// Connexion Google Agenda : /start (URL d'autorisation), /callback (échange du code), /disconnect.
// Le retour se fait vers l'origine de l'appel /start, jamais vers une adresse fournie par le client.
import { admin, corsHeaders, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'
import { GOOGLE_SCOPES, revokeGoogleToken, tokenRequest } from '../_shared/google.ts'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const REDIRECT_URI = (Deno.env.get('GOOGLE_REDIRECT_URI') ?? '').replace(/[\r\n]+/g, '').trim()
const SITE = 'https://leadcontrol.fr'
const DEFAULT_PATH = '/app/assistant'

function redirectTo(target: string, params: Record<string, string>) {
  const url = new URL(target)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Response(null, { status: 302, headers: { location: url.toString() } })
}

// corsHeaders ne renvoie l'origine que si elle fait partie des adresses de l'application.
function appOrigin(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  return origin && corsHeaders(req)['access-control-allow-origin'] === origin ? origin : SITE
}

async function start(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!CLIENT_ID || !REDIRECT_URI) return json(req, { error: 'google_not_configured' }, 503)
  let body: { return_path?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }
  const path = /^\/app(\/[\w-]+)*$/.test(body.return_path ?? '') ? body.return_path! : DEFAULT_PATH
  const state = crypto.randomUUID()
  const { error } = await admin.schema('secrets').from('oauth_states').insert({
    state,
    user_id: user.id,
    provider: 'google',
    return_to: `${appOrigin(req)}${path}`,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  if (error) return json(req, { error: 'state_insert_failed' }, 500)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return json(req, { auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

function idTokenClaims(idToken: unknown) {
  if (typeof idToken !== 'string') return null
  try {
    const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)) as { sub?: string; email?: string }
  } catch {
    return null
  }
}

async function callback(req: Request) {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const fallback = `${SITE}${DEFAULT_PATH}`
  if (!state) return redirectTo(fallback, { google_error: 'state_invalid' })

  // Lecture et consommation en une seule requête : un state ne sert qu'une fois.
  const stateRes = await admin
    .schema('secrets')
    .from('oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('state', state)
    .eq('provider', 'google')
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id, return_to')
    .maybeSingle()
  const st = stateRes.data
  if (!st) return redirectTo(fallback, { google_error: 'state_invalid' })
  const returnTo = st.return_to ?? fallback
  if (url.searchParams.get('error')) return redirectTo(returnTo, { google_error: 'denied' })
  if (!code) return redirectTo(returnTo, { google_error: 'exchange_failed' })

  try {
    const res = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
    const tokens = res.payload
    if (!res.ok || typeof tokens.access_token !== 'string') {
      throw new Error(`token_exchange:${JSON.stringify(tokens).slice(0, 200)}`)
    }
    // L'écran de consentement laisse décocher chaque autorisation.
    const granted = String(tokens.scope ?? '').split(' ')
    if (!GOOGLE_SCOPES.filter((s) => s.startsWith('https://')).every((s) => granted.includes(s))) {
      await revokeGoogleToken(tokens.access_token)
      return redirectTo(returnTo, { google_error: 'scope_missing' })
    }
    const claims = idTokenClaims(tokens.id_token)
    if (!claims?.sub) throw new Error('id_token sans sub')
    if (typeof tokens.refresh_token !== 'string') throw new Error('refresh_token absent')
    const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString()

    // Un seul agenda relié par compte : un autre compte Google remplace le précédent.
    const previous = await admin
      .from('channel_accounts')
      .select('id')
      .eq('user_id', st.user_id)
      .eq('provider', 'google')
      .neq('external_id', claims.sub)
      .neq('status', 'disconnected')
    for (const old of previous.data ?? []) {
      await admin.schema('secrets').from('channel_tokens').delete().eq('channel_account_id', old.id)
      await admin
        .from('channel_accounts')
        .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
        .eq('id', old.id)
    }

    const account = await admin
      .from('channel_accounts')
      .upsert(
        {
          user_id: st.user_id,
          provider: 'google',
          external_id: claims.sub,
          handle: claims.email ?? null,
          label: claims.email ?? null,
          status: 'connected',
          token_expires_at: expiresAt,
          last_refresh_at: new Date().toISOString(),
          last_error: null,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
        },
        { onConflict: 'user_id,provider,external_id' },
      )
      .select('id')
      .single()
    if (account.error) throw new Error(`account_upsert:${account.error.message}`)

    const saved = await admin
      .schema('secrets')
      .from('channel_tokens')
      .upsert(
        {
          channel_account_id: account.data.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          scopes: granted,
          expires_at: expiresAt,
          metadata: { email: claims.email ?? null },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'channel_account_id' },
      )
    if (saved.error) throw new Error(`token_upsert:${saved.error.message}`)
    return redirectTo(returnTo, { google_connected: '1' })
  } catch (e) {
    await logEvent('error', 'google-oauth', `callback en échec: ${String(e).slice(0, 300)}`, { user_id: st.user_id })
    return redirectTo(returnTo, { google_error: 'exchange_failed' })
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
    .select('id, user_id, provider')
    .eq('id', body.channel_account_id ?? '')
    .maybeSingle()
  if (!account || account.user_id !== user.id || account.provider !== 'google') return json(req, { error: 'not_found' }, 404)

  const { data: tokens } = await admin
    .schema('secrets')
    .from('channel_tokens')
    .select('refresh_token, access_token')
    .eq('channel_account_id', account.id)
    .maybeSingle()
  const toRevoke = tokens?.refresh_token ?? tokens?.access_token
  if (toRevoke) await revokeGoogleToken(toRevoke)
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
