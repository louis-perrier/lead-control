// Connexion d'un compte Instagram : /start (URL d'autorisation), /callback
// (échange du code, token longue durée, abonnement webhook, import 15 jours),
// /disconnect. Le token vit dans secrets.channel_tokens, jamais côté client.
import { admin, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'

const IG_APP_ID = Deno.env.get('IG_APP_ID')!
const IG_APP_SECRET = Deno.env.get('IG_APP_SECRET')!
const IG_REDIRECT_URI = (Deno.env.get('IG_REDIRECT_URI') ?? '').replace(/[\r\n]+/g, '').trim()
const IG_SCOPES =
  (Deno.env.get('IG_SCOPES') ?? '').replace(/[\r\n]+/g, '').trim() ||
  'instagram_business_basic,instagram_business_manage_messages'
const GRAPH = 'https://graph.instagram.com'
const SITE = 'https://leadcontrol.fr'

function redirectTo(base: string, params: Record<string, string>) {
  const url = new URL(base.startsWith('http') ? base : `${SITE}${base}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Response(null, { status: 302, headers: { location: url.toString() } })
}

async function start(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  let body: { assistant_id?: string; return_to?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }
  const state = crypto.randomUUID()
  const { error } = await admin.schema('secrets').from('oauth_states').insert({
    state,
    user_id: user.id,
    provider: 'instagram',
    return_to: body.return_to ?? `${SITE}/app`,
    assistant_id: body.assistant_id ?? null,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  if (error) return json(req, { error: 'state_insert_failed' }, 500)
  const authUrl =
    `https://www.instagram.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(IG_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(IG_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(IG_SCOPES)}` +
    `&state=${state}`
  return json(req, { auth_url: authUrl })
}

function audienceBlocks(settings: Record<string, unknown> | null, handle: string | null) {
  const audience = (settings as { audience?: { mode?: string; handles?: string[] } } | null)?.audience
  if (!audience || !handle) return false
  const handles = (audience.handles ?? []).map((h) => h.replace(/^@/, '').toLowerCase())
  const h = handle.replace(/^@/, '').toLowerCase()
  if (audience.mode === 'blocklist') return handles.includes(h)
  if (audience.mode === 'allowlist') return !handles.includes(h)
  return false
}

function computeWaitSeconds(text: string) {
  const bonus = Math.ceil(text.length / 100) * 2
  return Math.min(90, Math.max(12, 12 + bonus))
}

async function syncRecentHistory(channelAccountId: string, igUserId: string, token: string, userId: string, assistantId: string | null) {
  try {
    const since = Math.floor((Date.now() - 15 * 24 * 3600 * 1000) / 1000)
    const res = await fetch(
      `${GRAPH}/v25.0/me/conversations?platform=instagram&fields=participants,messages.limit(10){id,from,to,message,created_time}&limit=25&access_token=${encodeURIComponent(token)}`,
    )
    if (!res.ok) return
    const payload = await res.json()
    const assistant = assistantId
      ? (await admin.from('assistants').select('id, is_active, settings').eq('id', assistantId).maybeSingle()).data
      : null
    for (const thread of payload.data ?? []) {
      const other = (thread.participants?.data ?? []).find((p: { id: string }) => p.id !== igUserId)
      if (!other) continue
      const messages = (thread.messages?.data ?? []).filter(
        (m: { created_time?: string }) => m.created_time && Date.parse(m.created_time) / 1000 > since,
      )
      if (!messages.length) continue
      const threadKey = `ig:${igUserId}:${other.id}`
      const existing = await admin
        .from('conversations')
        .select('id')
        .eq('channel_account_id', channelAccountId)
        .eq('external_thread_id', threadKey)
        .maybeSingle()
      const last = messages[0]
      // Dernier mot au prospect et fenêtre Meta de 24h encore ouverte : laissé actif au lieu d'être marqué en pause.
      const resumable =
        !existing.data && last.from?.id === other.id && Date.now() - Date.parse(last.created_time) < 24 * 3600 * 1000
      const convRes = await admin
        .from('conversations')
        .upsert(
          {
            user_id: userId,
            assistant_id: assistantId,
            channel_account_id: channelAccountId,
            provider: 'instagram',
            external_thread_id: threadKey,
            contact_external_id: other.id,
            contact_handle: other.username ?? null,
            contact_name: other.name ?? other.username ?? null,
            // Seulement sur une ligne neuve non reprenable, jamais sur un fil déjà suivi en direct.
            ...(existing.data || resumable ? {} : { automation_state: 'stopped', automation_reason: 'imported_history' }),
          },
          { onConflict: 'channel_account_id,external_thread_id', ignoreDuplicates: false },
        )
        .select('id')
        .single()
      if (convRes.error) continue
      for (const m of [...messages].reverse()) {
        const fromContact = m.from?.id === other.id
        await admin
          .from('conversation_messages')
          .insert({
            conversation_id: convRes.data.id,
            provider: 'instagram',
            external_message_id: m.id,
            direction: fromContact ? 'in' : 'out',
            author_type: fromContact ? 'customer' : 'human',
            author_ref: m.from?.id ?? null,
            body_text: m.message || null,
            send_state: fromContact ? 'received' : 'sent',
            sent_at: m.created_time,
          })
          .then(() => {})
      }
      await admin
        .from('conversations')
        .update({
          last_message_at: last.created_time,
          last_message_preview: (last.message ?? '').slice(0, 140) || '[Message]',
        })
        .eq('id', convRes.data.id)
      if (resumable && assistant?.is_active && !audienceBlocks(assistant.settings, other.username ?? null)) {
        const allowedRes = await admin.rpc('assistant_next_allowed_time', {
          p_assistant_id: assistant.id,
          p_at: new Date().toISOString(),
        })
        const allowed = allowedRes.data ? new Date(allowedRes.data as string) : null
        if (allowed) {
          const wait = new Date(Date.now() + computeWaitSeconds(last.message ?? '') * 1000)
          const target = allowed > wait ? allowed : wait
          await admin.rpc('schedule_conversation_debounce', {
            p_conversation_id: convRes.data.id,
            p_next_reply_at: target.toISOString(),
            p_cursor_at: last.created_time,
            p_automation_reason: allowed > wait ? 'outside_schedule' : 'debounce_inbound',
          })
        }
      }
    }
  } catch (e) {
    await logEvent('warn', 'instagram-oauth', `import historique échoué: ${String(e).slice(0, 200)}`, {
      user_id: userId,
    })
  }
}

async function callback(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return redirectTo('/app', { ig_error: 'missing_code' })

  const stateRes = await admin
    .schema('secrets')
    .from('oauth_states')
    .select('user_id, return_to, assistant_id, expires_at, consumed_at')
    .eq('state', state)
    .maybeSingle()
  const st = stateRes.data
  if (!st || st.consumed_at || new Date(st.expires_at) < new Date()) {
    return redirectTo('/app', { ig_error: 'state_invalid' })
  }
  await admin
    .schema('secrets')
    .from('oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('state', state)
  const returnTo = st.return_to ?? `${SITE}/app`

  try {
    const form = new FormData()
    form.set('client_id', IG_APP_ID)
    form.set('client_secret', IG_APP_SECRET)
    form.set('grant_type', 'authorization_code')
    form.set('redirect_uri', IG_REDIRECT_URI)
    form.set('code', code)
    const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: form,
    })
    const short = await shortRes.json()
    if (!shortRes.ok || !short.access_token) {
      throw new Error(`short_token:${JSON.stringify(short).slice(0, 200)}`)
    }

    const longRes = await fetch(
      `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(IG_APP_SECRET)}&access_token=${encodeURIComponent(short.access_token)}`,
    )
    const long = await longRes.json()
    const token: string = long.access_token ?? short.access_token
    const expiresAt = new Date(Date.now() + (long.expires_in ?? 3600) * 1000).toISOString()

    const meRes = await fetch(
      `${GRAPH}/v25.0/me?fields=user_id,username,name&access_token=${encodeURIComponent(token)}`,
    )
    const me = await meRes.json()
    const igUserId = String(me.user_id ?? short.user_id)
    if (!igUserId) throw new Error('missing_ig_user_id')

    const account = await admin
      .from('channel_accounts')
      .upsert(
        {
          user_id: st.user_id,
          provider: 'instagram',
          external_id: igUserId,
          handle: me.username ?? null,
          label: me.name ?? me.username ?? null,
          status: 'connected',
          token_expires_at: expiresAt,
          last_refresh_at: new Date().toISOString(),
          last_error: null,
          disconnected_at: null,
        },
        { onConflict: 'user_id,provider,external_id' },
      )
      .select('id')
      .single()
    if (account.error) throw new Error(`account_upsert:${account.error.message}`)

    await admin
      .schema('secrets')
      .from('channel_tokens')
      .upsert(
        {
          channel_account_id: account.data.id,
          access_token: short.access_token,
          long_lived_token: token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'channel_account_id' },
      )

    let assistantId: string | null = null
    if (st.assistant_id) {
      const linked = await admin
        .from('assistants')
        .update({ channel_account_id: account.data.id, updated_at: new Date().toISOString() })
        .eq('id', st.assistant_id)
        .eq('user_id', st.user_id)
        .select('id')
        .maybeSingle()
      assistantId = linked.data?.id ?? null
    }

    await fetch(
      `${GRAPH}/v25.0/me/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    ).catch(() => {})

    // @ts-ignore fourni par le runtime Edge
    EdgeRuntime.waitUntil(syncRecentHistory(account.data.id, igUserId, token, st.user_id, assistantId))

    return redirectTo(returnTo, { ig_connected: '1' })
  } catch (e) {
    await logEvent('error', 'instagram-oauth', `callback en échec: ${String(e).slice(0, 300)}`, {
      user_id: st.user_id,
    })
    return redirectTo(returnTo, { ig_error: 'exchange_failed' })
  }
}

async function disconnect(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  let body: { channel_account_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }
  const { data: account } = await admin
    .from('channel_accounts')
    .select('id, user_id')
    .eq('id', body.channel_account_id ?? '')
    .maybeSingle()
  if (!account || account.user_id !== user.id) return json(req, { error: 'not_found' }, 404)

  await admin.schema('secrets').from('channel_tokens').delete().eq('channel_account_id', account.id)
  await admin
    .from('channel_accounts')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', account.id)
  await admin
    .from('assistants')
    .update({ is_active: false, paused_reason: 'channel_disconnected', updated_at: new Date().toISOString() })
    .eq('channel_account_id', account.id)
  return json(req, { ok: true })
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const path = new URL(req.url).pathname
  if (req.method === 'POST' && path.endsWith('/start')) return start(req)
  if (req.method === 'GET' && path.endsWith('/callback')) return callback(req)
  if (req.method === 'POST' && path.endsWith('/disconnect')) return disconnect(req)
  return json(req, { error: 'Not found' }, 404)
})
