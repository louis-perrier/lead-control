// Envoi manuel depuis la boîte de réception. Respecte la fenêtre Meta de 24 h
// et peut mettre l'assistant en pause sur la conversation (prise de main).
import { admin, getUser, handleOptions, json } from '../_shared/core.ts'
import { getChannelToken, sendInstagramText } from '../_shared/instagram.ts'
import { planFollowups } from '../_shared/followups.ts'
import type { FollowupSettings } from '../_shared/followups.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)

  let body: { conversation_id?: number; text?: string; take_over?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  const text = (body.text ?? '').trim()
  if (!body.conversation_id || !text) return json(req, { error: 'invalid_body' }, 400)

  const convRes = await admin
    .from('conversations')
    .select('id, user_id, assistant_id, channel_account_id, contact_external_id, automation_state')
    .eq('id', body.conversation_id)
    .maybeSingle()
  const conv = convRes.data
  if (!conv || conv.user_id !== user.id) return json(req, { error: 'not_found' }, 404)
  if (!conv.channel_account_id || !conv.contact_external_id) {
    return json(req, { error: 'channel_missing' }, 409)
  }

  const lastInbound = await admin
    .from('conversation_messages')
    .select('sent_at')
    .eq('conversation_id', conv.id)
    .eq('author_type', 'customer')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastAt = lastInbound.data?.sent_at ? Date.parse(lastInbound.data.sent_at) : 0
  if (!lastAt || Date.now() - lastAt > 24 * 3600 * 1000) {
    return json(req, { error: 'window_expired' }, 403)
  }

  const channel = await admin
    .from('channel_accounts')
    .select('external_id')
    .eq('id', conv.channel_account_id)
    .single()
  const token = await getChannelToken(conv.channel_account_id)
  if (!token || !channel.data?.external_id) return json(req, { error: 'channel_token_missing' }, 409)

  const now = new Date().toISOString()
  const provisional = `local:${crypto.randomUUID()}`
  const inserted = await admin
    .from('conversation_messages')
    .insert({
      conversation_id: conv.id,
      provider: 'instagram',
      external_message_id: provisional,
      direction: 'out',
      author_type: 'human',
      author_ref: user.id,
      body_text: text,
      send_state: 'queued',
      sent_at: now,
    })
    .select('id')
    .single()
  if (inserted.error) return json(req, { error: 'insert_failed' }, 500)

  try {
    const mid = await sendInstagramText(token, channel.data.external_id, conv.contact_external_id, text)
    await admin
      .from('conversation_messages')
      .update({ external_message_id: mid ?? provisional, send_state: 'sent' })
      .eq('id', inserted.data.id)
  } catch (e) {
    await admin
      .from('conversation_messages')
      .update({ send_state: 'failed', error_message: String(e).slice(0, 200) })
      .eq('id', inserted.data.id)
    return json(req, { error: 'send_failed' }, 502)
  }

  await admin.rpc('bump_conversation_human_sent', {
    p_conversation_id: conv.id,
    p_now: now,
    p_preview: text.slice(0, 140),
  })
  // Prendre la main coupe les relances : l'option ne vise que les messages envoyés
  // sans prise de main, où l'assistant reste aux commandes de la conversation.
  if (!body.take_over && conv.assistant_id) {
    const agent = await admin
      .from('assistants')
      .select('settings')
      .eq('id', conv.assistant_id)
      .maybeSingle()
    const followups = (agent.data?.settings as { followups?: FollowupSettings } | null)?.followups
    if (followups?.after_own_message) {
      try {
        await planFollowups({
          conversationId: conv.id,
          assistantId: conv.assistant_id,
          anchorMessageId: inserted.data.id,
          settings: followups,
        })
      } catch (_) {
        // le message est parti, une relance non programmée ne doit pas faire échouer l'envoi
      }
    }
  }

  if (body.take_over && !['stopped', 'condition_stop'].includes(conv.automation_state)) {
    await admin
      .from('conversations')
      .update({
        automation_state: 'stopped',
        automation_reason: 'human_takeover',
        next_reply_at: null,
        debounce_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id)
  }
  return json(req, { ok: true })
})
