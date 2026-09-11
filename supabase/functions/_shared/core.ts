import { createClient } from 'npm:@supabase/supabase-js@2'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
export const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const ALLOWED_ORIGINS = ['https://leadcontrol.fr', 'http://localhost:3000']

export function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.workers.dev')
  return {
    'access-control-allow-origin': allowed ? origin : 'https://leadcontrol.fr',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  }
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json' },
  })
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  return null
}

export async function getUser(req: Request) {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data } = await admin.auth.getUser(jwt)
  return data.user ?? null
}

// Client lié au JWT de l'utilisateur : les RPC y voient auth.uid().
export function userClient(req: Request) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
  })
}

export function isServiceCall(req: Request) {
  return (req.headers.get('authorization') ?? '') === `Bearer ${SERVICE_ROLE_KEY}`
}

// La base est injoignable quelques secondes plusieurs fois par heure. Sans ce réessai,
// une coupure passagère se traduit par un jeton refusé et une minute de traitement perdue.
export async function isCronCall(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  if (token === SERVICE_ROLE_KEY) return true
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin.rpc('internal_token_matches', { p_token: token })
    if (!error) return data === true
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
      continue
    }
    await logEvent('warn', 'core', `vérification du jeton interne impossible: ${error.message}`)
  }
  return false
}

type EventExtra = { user_id?: string | null; conversation_id?: number | null; payload?: Record<string, unknown> }

export async function logEvent(level: 'info' | 'warn' | 'error', source: string, message: string, extra: EventExtra = {}) {
  console.log(`[${source}] ${level}: ${message}`)
  try {
    await admin.from('system_events').insert({
      level,
      source,
      message,
      user_id: extra.user_id ?? null,
      conversation_id: extra.conversation_id ?? null,
      payload: extra.payload ?? {},
    })
  } catch (_) {
    // la journalisation ne doit jamais faire échouer le traitement
  }
}
