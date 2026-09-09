// Rappels Meta (slug historique conservé : URLs déclarées dans l'app Meta).
// Désautorisation et demande de suppression de données, signées par Meta.
import { admin, json, logEvent } from '../_shared/core.ts'

const IG_APP_SECRET = Deno.env.get('IG_APP_SECRET')!

function base64UrlToBytes(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : ''
  return Uint8Array.from(atob(normalized + pad), (c) => c.charCodeAt(0))
}

async function parseSignedRequest(signedRequest: string): Promise<{ user_id?: string } | null> {
  const [sig, payload] = signedRequest.split('.')
  if (!sig || !payload) return null
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(IG_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
  )
  const given = base64UrlToBytes(sig)
  if (expected.length !== given.length || !expected.every((b, i) => b === given[i])) return null
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)))
  } catch {
    return null
  }
}

async function revokeByPlatformUserId(platformUserId: string) {
  const { data: accounts } = await admin
    .from('channel_accounts')
    .select('id')
    .eq('external_id', platformUserId)
  for (const account of accounts ?? []) {
    await admin.schema('secrets').from('channel_tokens').delete().eq('channel_account_id', account.id)
    await admin
      .from('channel_accounts')
      .update({ status: 'disconnected', disconnected_at: new Date().toISOString(), last_error: 'désautorisé côté Meta' })
      .eq('id', account.id)
    await admin
      .from('assistants')
      .update({ is_active: false, paused_reason: 'channel_disconnected', updated_at: new Date().toISOString() })
      .eq('channel_account_id', account.id)
  }
  return (accounts ?? []).length
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const path = new URL(req.url).pathname

  const form = await req.formData().catch(() => null)
  const signedRequest = form?.get('signed_request')
  if (typeof signedRequest !== 'string') return json(req, { error: 'missing_signed_request' }, 400)
  const payload = await parseSignedRequest(signedRequest)
  if (!payload?.user_id) return json(req, { error: 'invalid_signed_request' }, 401)

  const revoked = await revokeByPlatformUserId(String(payload.user_id))
  await logEvent('info', 'dynamic-responder', `rappel Meta ${path} pour ${payload.user_id}, ${revoked} compte(s)`)

  if (path.endsWith('/data-deletion')) {
    const code = crypto.randomUUID()
    return json(req, {
      url: `https://leadcontrol.fr/policy/data-deletion?code=${code}`,
      confirmation_code: code,
    })
  }
  return json(req, { ok: true })
})
