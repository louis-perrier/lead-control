// URL signée (10 minutes) pour un média de conversation, réservée au propriétaire.
import { admin, getUser, handleOptions, json } from '../_shared/core.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)

  let body: { message_id?: number } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  if (!body.message_id) return json(req, { error: 'invalid_body' }, 400)

  const { data: msg } = await admin
    .from('conversation_messages')
    .select('media_path, message_type, conversations!inner(user_id)')
    .eq('id', body.message_id)
    .maybeSingle()
  const owner = (msg as unknown as { conversations?: { user_id?: string } } | null)?.conversations?.user_id
  if (!msg?.media_path || owner !== user.id) return json(req, { error: 'not_found' }, 404)

  const bucket = msg.message_type === 'image' ? 'ig-images' : 'ig-audio'
  const signed = await admin.storage.from(bucket).createSignedUrl(msg.media_path, 600)
  if (signed.error || !signed.data) return json(req, { error: 'sign_failed' }, 500)
  return json(req, { url: signed.data.signedUrl })
})
