// Connexion d'un espace Slack : /start (URL d'autorisation), /callback (échange du code),
// /disconnect. La portée demandée est incoming-webhook : Slack fait choisir le canal au client
// et nous rend une URL liée à ce canal, qui vit dans secrets.channel_tokens.
import { admin, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'

const SLACK_CLIENT_ID = Deno.env.get('SLACK_CLIENT_ID') ?? ''
const SLACK_CLIENT_SECRET = Deno.env.get('SLACK_CLIENT_SECRET') ?? ''
const SLACK_REDIRECT_URI = (Deno.env.get('SLACK_REDIRECT_URI') ?? '').replace(/[\r\n]+/g, '').trim()
const SITE = 'https://leadcontrol.fr'

function redirectTo(base: string, params: Record<string, string>) {
  const url = new URL(base.startsWith('http') ? base : `${SITE}${base}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Response(null, { status: 302, headers: { location: url.toString() } })
}

async function allowed(userId: string) {
  const { data } = await admin.rpc('user_has_feature', { p_user: userId, p_key: 'slack_notifications' })
  return data === true
}

async function start(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!(await allowed(user.id))) return json(req, { error: 'feature_disabled' }, 403)
  if (!SLACK_CLIENT_ID || !SLACK_REDIRECT_URI) return json(req, { error: 'not_configured' }, 503)

  let body: { return_to?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }

  const state = crypto.randomUUID()
  const { error } = await admin.schema('secrets').from('oauth_states').insert({
    state,
    user_id: user.id,
    provider: 'slack',
    return_to: body.return_to ?? `${SITE}/app/settings`,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  if (error) return json(req, { error: 'state_insert_failed' }, 500)

  const authUrl =
    'https://slack.com/oauth/v2/authorize' +
    `?client_id=${encodeURIComponent(SLACK_CLIENT_ID)}` +
    '&scope=incoming-webhook' +
    `&redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}` +
    `&state=${state}`
  return json(req, { auth_url: authUrl })
}

async function exchangeCode(code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: SLACK_REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(8000),
  })
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

async function callback(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const denied = url.searchParams.get('error')
  if (denied) return redirectTo('/app/settings', { slack_error: denied })
  if (!code || !state) return redirectTo('/app/settings', { slack_error: 'missing_code' })

  try {
    // Lecture et consommation en une seule écriture : un état rejoué ne passe pas deux fois.
    const { data: row } = await admin
      .schema('secrets')
      .from('oauth_states')
      .update({ consumed_at: new Date().toISOString() })
      .eq('state', state)
      .eq('provider', 'slack')
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('user_id, return_to')
      .maybeSingle()
    if (!row) return redirectTo('/app/settings', { slack_error: 'state_invalid' })

    const payload = await exchangeCode(code)
    if (payload.ok !== true) {
      await logEvent('error', 'slack-oauth', `échange refusé: ${String(payload.error).slice(0, 120)}`, {
        user_id: row.user_id,
      })
      return redirectTo(row.return_to ?? '/app/settings', { slack_error: 'exchange_failed' })
    }

    const team = (payload.team ?? {}) as Record<string, unknown>
    const hook = (payload.incoming_webhook ?? {}) as Record<string, unknown>
    const hookUrl = typeof hook.url === 'string' ? hook.url : ''
    if (!hookUrl) return redirectTo(row.return_to ?? '/app/settings', { slack_error: 'no_channel' })

    const account = await admin
      .from('channel_accounts')
      .upsert(
        {
          user_id: row.user_id,
          provider: 'slack',
          external_id: String(team.id ?? 'slack'),
          handle: typeof team.name === 'string' ? team.name : null,
          label: typeof hook.channel === 'string' ? hook.channel : null,
          status: 'connected',
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          last_error: null,
        },
        { onConflict: 'user_id,provider,external_id' },
      )
      .select('id')
      .single()
    if (account.error || !account.data) throw new Error(account.error?.message ?? 'compte non enregistré')

    const stored = await admin
      .schema('secrets')
      .from('channel_tokens')
      .upsert(
        { channel_account_id: account.data.id, access_token: hookUrl, scopes: ['incoming-webhook'] },
        { onConflict: 'channel_account_id' },
      )
    if (stored.error) throw new Error(stored.error.message)

    return redirectTo(row.return_to ?? '/app/settings', { slack_connected: '1' })
  } catch (e) {
    await logEvent('error', 'slack-oauth', `connexion échouée: ${String(e).slice(0, 200)}`)
    return redirectTo('/app/settings', { slack_error: 'unavailable' })
  }
}

async function disconnect(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  let body: { channel_account_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const { data: rows } = await admin
    .from('channel_accounts')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'slack')
    .neq('status', 'disconnected')
  for (const row of rows ?? []) {
    if (body.channel_account_id && body.channel_account_id !== row.id) continue
    await admin.schema('secrets').from('channel_tokens').delete().eq('channel_account_id', row.id)
    await admin
      .from('channel_accounts')
      .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
      .eq('id', row.id)
  }
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
