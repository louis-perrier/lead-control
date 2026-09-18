// Réglage du mode iClose depuis la page Assistant : dépôt de la clé d'API, liste des pages de
// réservation, et aperçu des propositions réelles. L'aperçu vaut vérification de bout en bout :
// il échoue explicitement si le forfait ou la clé ne permettent pas de réserver.
import { admin, getUser, handleOptions, json, logEvent, SUPABASE_URL } from '../_shared/core.ts'
import { IcloseError, availableTimes, listEvents, registerWebhook } from '../_shared/iclose.ts'
import { computeBookingOffers } from '../_shared/slot-offers.ts'
import { normalizeIclose } from '../_shared/iclose-settings.ts'
import { isValidTimezone } from '../_shared/agenda-slots.ts'

const HORIZON_MS = 30 * 86_400_000
const WEBHOOK_SECRET = Deno.env.get('ICLOSE_WEBHOOK_SECRET') ?? ''

function failure(req: Request, e: unknown) {
  if (e instanceof IcloseError) {
    if (e.code === 'plan_required') return json(req, { error: 'plan_required' }, 403)
    if (e.code === 'token_invalid') return json(req, { error: 'token_invalid' }, 401)
    if (e.code === 'rate_limited') return json(req, { error: 'rate_limited' }, 429)
    if (e.code === 'bad_request') return json(req, { error: 'event_missing' }, 404)
  }
  return json(req, { error: 'unavailable' }, 503)
}

async function allowed(userId: string) {
  const { data } = await admin.rpc('user_has_feature', { p_user: userId, p_key: 'iclose_booking' })
  return data === true
}

async function timezoneOf(userId: string) {
  const { data } = await admin.from('profiles').select('timezone').eq('user_id', userId).maybeSingle()
  const tz = data?.timezone ?? ''
  return isValidTimezone(tz) ? tz : 'Europe/Paris'
}

async function body(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

async function account(userId: string) {
  const { data } = await admin
    .from('channel_accounts')
    .select('id, user_id, external_id, handle')
    .eq('user_id', userId)
    .eq('provider', 'iclose')
    .in('status', ['connected', 'expired'])
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function keyOf(userId: string) {
  const row = await account(userId)
  if (!row) return null
  const { data } = await admin
    .schema('secrets')
    .from('channel_tokens')
    .select('access_token')
    .eq('channel_account_id', row.id)
    .maybeSingle()
  const key = (data as { access_token: string | null } | null)?.access_token ?? ''
  return key ? { row, key } : null
}

// La clé est vérifiée par un vrai appel avant d'être gardée : une clé morte ne doit jamais
// s'installer silencieusement dans les réglages.
async function saveKey(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!(await allowed(user.id))) return json(req, { error: 'feature_disabled' }, 403)
  const payload = await body(req)
  if (!payload) return json(req, { error: 'Invalid JSON body' }, 400)
  const key = typeof payload.api_key === 'string' ? payload.api_key.trim() : ''
  if (!key) return json(req, { error: 'key_missing' }, 400)

  let events
  try {
    events = await listEvents(key)
  } catch (e) {
    await logEvent('warn', 'iclose-setup', `clé iClose refusée: ${String(e).slice(0, 200)}`, { user_id: user.id })
    return failure(req, e)
  }

  const inserted = await admin
    .from('channel_accounts')
    .upsert(
      {
        user_id: user.id,
        provider: 'iclose',
        external_id: 'api-key',
        label: `clé ...${key.slice(-4)}`,
        status: 'connected',
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        last_error: null,
      },
      { onConflict: 'user_id,provider,external_id' },
    )
    .select('id')
    .single()
  if (inserted.error || !inserted.data) return json(req, { error: 'unavailable' }, 503)

  const stored = await admin
    .schema('secrets')
    .from('channel_tokens')
    .upsert({ channel_account_id: inserted.data.id, access_token: key }, { onConflict: 'channel_account_id' })
  if (stored.error) return json(req, { error: 'unavailable' }, 503)

  // Sans webhook, une réservation faite par le prospect depuis le lien ne remonte jamais. Le
  // silence serait pire que l'échec : il est remonté au compte et au journal de santé.
  const webhook = WEBHOOK_SECRET
    ? await registerWebhook(key, `${SUPABASE_URL}/functions/v1/iclose-webhook/${WEBHOOK_SECRET}`)
    : false
  if (!webhook) {
    const why = WEBHOOK_SECRET ? 'iClose a refusé l’enregistrement' : 'ICLOSE_WEBHOOK_SECRET absent'
    await logEvent('error', 'iclose-setup', `webhook iClose à poser à la main (${why})`, { user_id: user.id })
  }
  return json(req, { ok: true, events: events.length, webhook })
}

async function disconnect(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  const row = await account(user.id)
  if (!row) return json(req, { ok: true })
  await admin.schema('secrets').from('channel_tokens').delete().eq('channel_account_id', row.id)
  await admin
    .from('channel_accounts')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', row.id)
  return json(req, { ok: true })
}

async function events(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!(await allowed(user.id))) return json(req, { error: 'feature_disabled' }, 403)
  const found = await keyOf(user.id)
  if (!found) return json(req, { error: 'not_connected' }, 404)
  try {
    const list = await listEvents(found.key, found.row)
    return json(req, {
      events: list.map((e) => ({
        id: e.id,
        link_prefix: e.linkPrefix,
        name: e.name,
        duration_min: e.durationMin,
        booking_url: e.bookingUrl,
        bookable: e.bookable,
        blockers: e.blockers,
      })),
    })
  } catch (e) {
    await logEvent('warn', 'iclose-setup', `liste des pages iClose en échec: ${String(e).slice(0, 200)}`, { user_id: user.id })
    return failure(req, e)
  }
}

async function preview(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!(await allowed(user.id))) return json(req, { error: 'feature_disabled' }, 403)
  const payload = await body(req)
  if (!payload) return json(req, { error: 'Invalid JSON body' }, 400)
  const settings = normalizeIclose(payload as Record<string, never>)
  if (!settings.link_prefix) return json(req, { error: 'event_missing' }, 400)
  const found = await keyOf(user.id)
  if (!found) return json(req, { error: 'not_connected' }, 404)

  try {
    const list = await listEvents(found.key, found.row)
    const event = list.find((e) => e.id === settings.event_id || e.linkPrefix === settings.link_prefix)
    if (!event) return json(req, { error: 'event_missing' }, 404)
    const shared = {
      id: event.id,
      link_prefix: event.linkPrefix,
      name: event.name,
      duration_min: event.durationMin,
      booking_url: event.bookingUrl,
      bookable: event.bookable,
      blockers: event.blockers,
    }
    if (!event.bookable) return json(req, { ...shared, steps: [] })

    const now = Date.now()
    const tz = await timezoneOf(user.id)
    const slots = await availableTimes(found.key, event.linkPrefix, tz, now, now + HORIZON_MS, found.row)
    const offers = computeBookingOffers({
      now,
      tz,
      settings: { ...settings, duration_min: event.durationMin },
      slots,
      count: settings.first_offer > 0 ? settings.first_offer + settings.extra_offers : 0,
    })
    const labels = offers.map((o) => o.label)
    const first = labels.slice(0, settings.first_offer)
    const last =
      settings.offer_style === 'slot'
        ? 'Demande l’e-mail, puis réserve dans iClose.'
        : 'Fait préciser l’heure, demande l’e-mail, puis réserve dans iClose.'
    const steps =
      first.length > 0
        ? [
            `Propose ${first.join(' ou ')}.`,
            ...labels.slice(settings.first_offer).map((l) => `Si ça ne va pas : ${l}.`),
            'Sinon, demande le moment qui l’arrange.',
            last,
          ]
        : ['Demande au prospect le moment qui l’arrange.', last]
    return json(req, { ...shared, steps, slot_count: slots.length })
  } catch (e) {
    await logEvent('warn', 'iclose-setup', `aperçu iClose en échec: ${String(e).slice(0, 200)}`, { user_id: user.id })
    return failure(req, e)
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const path = new URL(req.url).pathname
  if (req.method === 'POST' && path.endsWith('/key')) return saveKey(req)
  if (req.method === 'POST' && path.endsWith('/disconnect')) return disconnect(req)
  if (req.method === 'POST' && path.endsWith('/events')) return events(req)
  if (req.method === 'POST' && path.endsWith('/preview')) return preview(req)
  return json(req, { error: 'Not found' }, 404)
})
