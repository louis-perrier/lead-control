// Réglage du mode Calendly depuis la page Assistant : liste des pages de réservation, et
// aperçu des plages réelles que l'assistant proposerait. L'aperçu vaut vérification de bout en
// bout : il échoue explicitement si le forfait ou la connexion ne permettent pas de réserver.
import { admin, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'
import {
  CalendlyError,
  availableTimes,
  findCalendlyAccount,
  getCalendlyAccessToken,
  getEventType,
  listEventTypes,
} from '../_shared/calendly.ts'
import { computeCalendlyOffers } from '../_shared/calendly-slots.ts'
import { normalizeCalendly } from '../_shared/calendly-settings.ts'
import { isValidTimezone } from '../_shared/agenda-slots.ts'

const HORIZON_MS = 30 * 86_400_000

function failure(req: Request, e: unknown) {
  if (e instanceof CalendlyError) {
    if (e.code === 'plan_required') return json(req, { error: 'plan_required' }, 403)
    if (e.code === 'token_expired') return json(req, { error: 'token_expired' }, 401)
    if (e.code === 'bad_request') return json(req, { error: 'event_type_missing' }, 404)
  }
  return json(req, { error: 'unavailable' }, 503)
}

async function allowed(userId: string) {
  const { data } = await admin.rpc('user_has_feature', { p_user: userId, p_key: 'calendly_booking' })
  return data === true
}

async function timezoneOf(userId: string) {
  const { data } = await admin.from('profiles').select('timezone').eq('user_id', userId).maybeSingle()
  const tz = data?.timezone ?? ''
  return isValidTimezone(tz) ? tz : 'Europe/Paris'
}

async function eventTypes(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!(await allowed(user.id))) return json(req, { error: 'feature_disabled' }, 403)
  const account = await findCalendlyAccount(user.id)
  if (!account) return json(req, { error: 'not_connected' }, 404)
  try {
    const token = await getCalendlyAccessToken(account)
    const list = await listEventTypes(account, token)
    return json(req, {
      event_types: list.map((e) => ({
        uri: e.uri,
        name: e.name,
        duration_min: e.durationMin,
        scheduling_url: e.schedulingUrl,
        location_label: e.locationLabel,
        bookable: e.bookable,
        blockers: e.blockers,
      })),
    })
  } catch (e) {
    await logEvent('warn', 'calendly-setup', `liste des pages en échec: ${String(e).slice(0, 200)}`, { user_id: user.id })
    return failure(req, e)
  }
}

async function preview(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!(await allowed(user.id))) return json(req, { error: 'feature_disabled' }, 403)
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }
  const settings = normalizeCalendly(body as Record<string, never>)
  if (!settings.event_type_uri) return json(req, { error: 'event_type_missing' }, 400)
  const account = await findCalendlyAccount(user.id)
  if (!account) return json(req, { error: 'not_connected' }, 404)

  try {
    const token = await getCalendlyAccessToken(account)
    const info = await getEventType(account, token, settings.event_type_uri)
    const shared = {
      name: info.name,
      duration_min: info.durationMin,
      scheduling_url: info.schedulingUrl,
      location_label: info.locationLabel,
      bookable: info.bookable,
      blockers: info.blockers,
    }
    if (!info.bookable) return json(req, { ...shared, steps: [] })

    const now = Date.now()
    const tz = await timezoneOf(user.id)
    const slots = await availableTimes(account, token, settings.event_type_uri, now, now + HORIZON_MS)
    const offers = computeCalendlyOffers({
      now,
      tz,
      settings: { ...settings, duration_min: info.durationMin },
      slots,
      count: settings.first_offer > 0 ? settings.first_offer + settings.extra_offers : 0,
    })
    const labels = offers.map((o) => o.label)
    const first = labels.slice(0, settings.first_offer)
    const steps =
      first.length > 0
        ? [
            `Propose ${first.join(' ou ')}.`,
            ...labels.slice(settings.first_offer).map((l) => `Si ça ne va pas : ${l}.`),
            'Sinon, demande le moment qui l’arrange.',
          ]
        : ['Demande au prospect le moment qui l’arrange.']
    return json(req, { ...shared, steps, slot_count: slots.length })
  } catch (e) {
    await logEvent('warn', 'calendly-setup', `aperçu en échec: ${String(e).slice(0, 200)}`, { user_id: user.id })
    return failure(req, e)
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const path = new URL(req.url).pathname
  if (req.method === 'POST' && path.endsWith('/event-types')) return eventTypes(req)
  if (req.method === 'POST' && path.endsWith('/preview')) return preview(req)
  return json(req, { error: 'Not found' }, 404)
})
