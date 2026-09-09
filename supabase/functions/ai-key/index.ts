// Clé Anthropic des bêta-testeurs : validation par un appel réel puis stockage
// dans Vault via RPC. La clé n'est jamais renvoyée ni journalisée.
import { admin, getUser, handleOptions, json, userClient } from '../_shared/core.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('plan_override')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profile?.plan_override !== 'beta_byok') {
    return json(req, { error: 'not_beta_tester' }, 403)
  }

  if (req.method === 'DELETE') {
    const { error } = await userClient(req).rpc('delete_user_ai_key')
    if (error) return json(req, { error: 'delete_failed' }, 500)
    return json(req, { ok: true })
  }

  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/validate')) {
    let body: { key?: string } = {}
    try {
      body = await req.json()
    } catch {
      return json(req, { error: 'invalid_body' }, 400)
    }
    const key = (body.key ?? '').trim()
    if (key.length < 20) return json(req, { error: 'invalid_key' }, 400)

    let valid = false
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      })
      valid = res.ok
    } catch {
      valid = false
    }

    const { error } = await userClient(req).rpc('set_user_ai_key', { p_key: key })
    if (error) return json(req, { error: 'store_failed' }, 500)
    await admin
      .from('user_ai_keys')
      .update({ status: valid ? 'valid' : 'invalid', last_checked_at: new Date().toISOString() })
      .eq('user_id', user.id)
    return json(req, { ok: true, valid })
  }

  return json(req, { error: 'Not found' }, 404)
})
