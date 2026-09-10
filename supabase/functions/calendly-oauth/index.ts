// Connexion d'un compte Calendly : /start (URL d'autorisation), /callback
// (échange du code, enregistrement du webhook Calendly), /disconnect.
// Le token vit dans secrets.channel_tokens, jamais côté client.
import { admin, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'

const CALENDLY_CLIENT_ID = Deno.env.get('CALENDLY_CLIENT_ID')!
const CALENDLY_CLIENT_SECRET = Deno.env.get('CALENDLY_CLIENT_SECRET')!
const CALENDLY_REDIRECT_URI = (Deno.env.get('CALENDLY_REDIRECT_URI') ?? '').replace(/[\r\n]+/g, '').trim()
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
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
    provider: 'calendly',
    return_to: body.return_to ?? `${SITE}/app/assistant`,
    assistant_id: body.assistant_id ?? null,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  if (error) return json(req, { error: 'state_insert_failed' }, 500)
  const authUrl =
    `https://auth.calendly.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(CALENDLY_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(CALENDLY_REDIRECT_URI)}` +
    `&response_type=code` +
    `&state=${state}`
  return json(req, { auth_url: authUrl })
}

async function exchangeCode(code: string) {
  const credentials = btoa(`${CALENDLY_CLIENT_ID}:${CALENDLY_CLIENT_SECRET}`)
  const res = await fetch('https://auth.calendly.com/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: CALENDLY_REDIRECT_URI,
      code,
    }),
  })
  const payload = await res.json()
  if (!res.ok || !payload.access_token) throw new Error(`token_exchange:${JSON.stringify(payload).slice(0, 200)}`)
  return payload as { access_token: string; refresh_token?: string; expires_in?: number }
}

async function registerWebhook(accessToken: string, organizationUri: string, userUri: string) {
  await fetch('https://api.calendly.com/webhook_subscriptions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: `${SUPABASE_URL}/functions/v1/calendly-webhook`,
      events: ['invitee.created', 'invitee.canceled'],
      organization: organizationUri,
      user: userUri,
      scope: 'user',
    }),
  }).catch(() => {})
}

async function callback(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return redirectTo('/app/assistant', { calendly_error: 'missing_code' })

  const stateRes = await admin
    .schema('secrets')
    .from('oauth_states')
    .select('user_id, return_to, expires_at, consumed_at')
    .eq('state', state)
    .eq('provider', 'calendly')
    .maybeSingle()
  const st = stateRes.data
  if (!st || st.consumed_at || new Date(st.expires_at) < new Date()) {
    return redirectTo('/app/assistant', { calendly_error: 'state_invalid' })
  }
  await admin.schema('secrets').from('oauth_states').update({ consumed_at: new Date().toISOString() }).eq('state', state)
  const returnTo = st.return_to ?? `${SITE}/app/assistant`

  try {
    const tokens = await exchangeCode(code)
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

    const meRes = await fetch('https://api.calendly.com/users/me', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    const me = await meRes.json()
    const resource = me.resource
    if (!resource?.uri) throw new Error('missing_calendly_user')

    const account = await admin
      .from('channel_accounts')
      .upsert(
        {
          user_id: st.user_id,
          provider: 'calendly',
          external_id: resource.uri,
          handle: resource.slug ?? null,
          label: resource.name ?? null,
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
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          expires_at: expiresAt,
          metadata: {
            email: resource.email ?? null,
            slug: resource.slug ?? null,
            scheduling_url: resource.scheduling_url ?? null,
            organization_uri: resource.current_organization ?? null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'channel_account_id' },
      )

    await registerWebhook(tokens.access_token, resource.current_organization, resource.uri)

    return redirectTo(returnTo, { calendly_connected: '1' })
  } catch (e) {
    await logEvent('error', 'calendly-oauth', `callback en échec: ${String(e).slice(0, 300)}`, {
      user_id: st.user_id,
    })
    return redirectTo(returnTo, { calendly_error: 'exchange_failed' })
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
