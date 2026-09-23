// Envoi manuel depuis la boîte de réception. Respecte les fenêtres Meta (24 h, 7 jours avec
// Human Agent) et peut mettre l'assistant en pause sur la conversation (prise de main).
import { admin, getUser, handleOptions, json } from '../_shared/core.ts'
import { getChannelToken, sendInstagramText } from '../_shared/instagram.ts'
import { STANDARD_WINDOW_MS, manualSendMode } from '../_shared/messaging-window.ts'
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
    .select('id, user_id, assistant_id, channel_account_id, contact_external_id, contact_handle, automation_state, last_customer_message_at')
    .eq('id', body.conversation_id)
    .maybeSingle()
  const conv = convRes.data
  if (!conv || conv.user_id !== user.id) return json(req, { error: 'not_found' }, 404)
  if (!conv.channel_account_id || !conv.contact_external_id) {
    return json(req, { error: 'channel_missing' }, 409)
  }

  let lastCustomerAt: string | null = conv.last_customer_message_at
  if (!lastCustomerAt) {
    const lastInbound = await admin
      .from('conversation_messages')
      .select('sent_at')
      .eq('conversation_id', conv.id)
      .eq('author_type', 'customer')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    lastCustomerAt = lastInbound.data?.sent_at ?? null
  }
  const beyondStandard = !lastCustomerAt || Date.now() - Date.parse(lastCustomerAt) > STANDARD_WINDOW_MS
  const humanAgent = beyondStandard
    ? (await admin.rpc('user_has_feature', { p_user: user.id, p_key: 'human_agent' })).data === true
    : false
  const mode = manualSendMode(lastCustomerAt, Date.now(), humanAgent)
  if (mode === 'expired') return json(req, { error: 'window_expired' }, 403)
  if (mode === 'closed') return json(req, { error: 'window_closed' }, 403)

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
    const mid = await sendInstagramText(token, channel.data.external_id, conv.contact_external_id, text, {
      humanAgent: mode === 'human_agent',
    })
    await admin
      .from('conversation_messages')
      .update({ external_message_id: mid ?? provisional, send_state: 'sent' })
      .eq('id', inserted.data.id)
  } catch (e) {
    const detail = String(e).slice(0, 200)
    await admin
      .from('conversation_messages')
      .update({ send_state: 'failed', error_message: detail })
      .eq('id', inserted.data.id)
    // Hors fenêtre de 24 h, le seul refus possible vient du tag : le dire, sinon l'écran laisse
    // croire à une panne de LeadControl.
    if (mode === 'human_agent') return json(req, { error: 'human_agent_refused', detail }, 502)
    return json(req, { error: 'send_failed', detail }, 502)
  }

  await admin.rpc('bump_conversation_human_sent', {
    p_conversation_id: conv.id,
    p_now: now,
    p_preview: text.slice(0, 140),
  })
  // Prendre la main coupe les relances, et après 24 h une relance automatique ne partirait pas :
  // l'option ne vise que les messages envoyés sans prise de main, dans la fenêtre standard.
  if (!body.take_over && conv.assistant_id && mode === 'standard') {
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
          assistantSettings: agent.data?.settings,
          contactHandle: conv.contact_handle,
          anchorText: text,
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
