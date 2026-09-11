// Envoie les relances dues. Déclenché chaque minute par pg_cron, comme assistant-dispatch.
// Le texte vient du client, jamais de l'IA, et aucun crédit n'est consommé.
// Meta n'accepte un envoi automatisé que dans les 24 h qui suivent le dernier message du prospect.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'
import { getChannelToken, sendInstagramAudio, sendInstagramText } from '../_shared/instagram.ts'
import { pickVariant, usableFollowupItems } from '../_shared/followups.ts'
import type { FollowupItem, FollowupSettings } from '../_shared/followups.ts'

const AUDIO_URL_TTL_SECONDS = 3600
const MAX_ATTEMPTS = 3
// Sans ce décalage, toutes les relances reportées la nuit partiraient à la seconde
// d'ouverture des horaires, sur le même compte Instagram.
const MAX_JITTER_MS = 20 * 60 * 1000

type DueFollowup = {
  id: string
  user_id: string
  conversation_id: number
  assistant_id: string | null
  slot_index: number
  message_id: number | null
  attempts: number
}

async function skip(id: string, reason: string, errorMessage?: string) {
  await admin
    .from('followups')
    .update({ status: 'skipped', skip_reason: reason, error_message: errorMessage ?? null, locked_at: null })
    .eq('id', id)
}

// Un report n'est pas une tentative d'envoi : on rend le jeton pris à la réservation,
// sinon une relance repoussée plusieurs fois finirait abandonnée sans avoir rien tenté.
async function postpone(due: DueFollowup, at: number) {
  await admin
    .from('followups')
    .update({
      status: 'pending',
      scheduled_at: new Date(at + Math.floor(Math.random() * MAX_JITTER_MS)).toISOString(),
      locked_at: null,
      attempts: Math.max(0, due.attempts - 1),
    })
    .eq('id', due.id)
}

// Une reprise après interruption ne renvoie jamais : un second message identique chez le
// prospect coûte plus cher qu'une relance manquée.
async function resolveInterrupted(due: DueFollowup): Promise<boolean> {
  if (!due.message_id) return false
  const msg = await admin
    .from('conversation_messages')
    .select('send_state, external_message_id')
    .eq('id', due.message_id)
    .maybeSingle()
  if (msg.data?.send_state === 'sent') {
    await admin
      .from('followups')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        locked_at: null,
        external_message_id: msg.data.external_message_id,
      })
      .eq('id', due.id)
  } else {
    await skip(due.id, 'interrupted')
  }
  return true
}

async function handleFollowup(due: DueFollowup) {
  if (await resolveInterrupted(due)) return
  if (due.attempts > MAX_ATTEMPTS) return skip(due.id, 'too_many_attempts')

  const convRes = await admin
    .from('conversations')
    .select('id, user_id, assistant_id, channel_account_id, contact_external_id, automation_state, heat_tag')
    .eq('id', due.conversation_id)
    .maybeSingle()
  const conv = convRes.data
  if (!conv) return skip(due.id, 'conversation_missing')
  if (!['idle', 'condition_stop'].includes(conv.automation_state)) {
    return skip(due.id, `conversation_${conv.automation_state}`)
  }
  if (conv.heat_tag === 'cold') return skip(due.id, 'cold_conversation')
  if (!conv.channel_account_id || !conv.contact_external_id) return skip(due.id, 'channel_missing')

  const assistantId = due.assistant_id ?? conv.assistant_id
  if (!assistantId) return skip(due.id, 'agent_missing')
  const agentRes = await admin
    .from('assistants')
    .select('id, is_active, settings')
    .eq('id', assistantId)
    .maybeSingle()
  const agent = agentRes.data
  if (!agent || !agent.is_active) return skip(due.id, 'agent_inactive')

  const settings = (agent.settings ?? {}) as { followups?: FollowupSettings }
  const items = usableFollowupItems(settings.followups)
  const item: FollowupItem | undefined = items[due.slot_index - 1]
  if (!item) return skip(due.id, 'followup_removed')

  const closesRes = await admin.rpc('conversation_window_closes_at', { p_conversation_id: conv.id })
  const closesAt = closesRes.data ? Date.parse(closesRes.data as string) : 0
  if (!closesAt || Date.now() > closesAt) return skip(due.id, 'window_expired')

  // Une relance ne coûte pas de crédit, mais un compte résilié ne doit plus rien envoyer.
  const credit = await admin.rpc('can_consume_one_credit', { p_user_id: conv.user_id })
  const creditReason = (credit.data as { ok?: boolean; reason?: string } | null)?.reason
  if (creditReason === 'no_active_subscription' || creditReason === 'profile_not_found') {
    return skip(due.id, creditReason)
  }

  const allowed = await admin.rpc('assistant_next_allowed_time', {
    p_assistant_id: assistantId,
    p_at: new Date().toISOString(),
  })
  if (!allowed.data) return skip(due.id, 'outside_schedule')
  const allowedAt = Date.parse(allowed.data as string)
  if (allowedAt > Date.now() + 1000) {
    if (allowedAt > closesAt) return skip(due.id, 'window_expired')
    return postpone(due, allowedAt)
  }

  const channel = await admin
    .from('channel_accounts')
    .select('external_id')
    .eq('id', conv.channel_account_id)
    .maybeSingle()
  const token = await getChannelToken(conv.channel_account_id)
  if (!token || !channel.data?.external_id) return skip(due.id, 'channel_token_missing')

  const isAudio = item.kind === 'audio'
  const text = isAudio ? null : pickVariant(item)
  if (!isAudio && !text) return skip(due.id, 'followup_removed')

  let audioUrl: string | null = null
  if (isAudio) {
    const signed = await admin.storage
      .from('assistant-audio')
      .createSignedUrl(item.media_path!, AUDIO_URL_TTL_SECONDS)
    audioUrl = signed.data?.signedUrl ?? null
    if (!audioUrl) return skip(due.id, 'audio_unavailable', signed.error?.message)
  }

  // Dernier contrôle, au plus près de l'envoi : le prospect a pu écrire pendant les
  // vérifications, et le trigger d'annulation ne voit plus une relance déjà réservée.
  const lastMsg = await admin
    .from('conversation_messages')
    .select('direction')
    .eq('conversation_id', conv.id)
    .order('sent_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastMsg.data?.direction === 'in') return skip(due.id, 'customer_replied')

  const now = new Date().toISOString()
  const preview = isAudio ? '[Vocal]' : text!.slice(0, 140)
  const provisional = `local:${crypto.randomUUID()}`
  const inserted = await admin
    .from('conversation_messages')
    .insert({
      conversation_id: conv.id,
      provider: 'instagram',
      external_message_id: provisional,
      direction: 'out',
      author_type: 'agent',
      body_text: isAudio ? '[Vocal]' : text,
      message_type: isAudio ? 'audio' : 'text',
      media_path: isAudio ? item.media_path : null,
      media_mime: isAudio ? item.media_mime ?? 'audio/wav' : null,
      media_bucket: isAudio ? 'assistant-audio' : null,
      send_state: 'queued',
      sent_at: now,
    })
    .select('id')
    .single()
  if (inserted.error) return skip(due.id, 'insert_failed', inserted.error.message)

  await admin
    .from('followups')
    .update({
      message_id: inserted.data.id,
      kind: isAudio ? 'audio' : 'text',
      message_body: isAudio ? null : text,
      media_path: isAudio ? item.media_path : null,
      media_mime: isAudio ? item.media_mime ?? 'audio/wav' : null,
    })
    .eq('id', due.id)

  let mid: string | null = null
  try {
    mid = isAudio
      ? await sendInstagramAudio(token, channel.data.external_id, conv.contact_external_id, audioUrl!)
      : await sendInstagramText(token, channel.data.external_id, conv.contact_external_id, text!)
  } catch (e) {
    await admin
      .from('conversation_messages')
      .update({ send_state: 'failed', error_message: String(e).slice(0, 200) })
      .eq('id', inserted.data.id)
    await logEvent('error', 'followups-dispatch', `relance non envoyée conv=${conv.id}: ${String(e).slice(0, 300)}`, {
      user_id: conv.user_id,
      conversation_id: conv.id,
    })
    return skip(due.id, 'send_failed', String(e).slice(0, 200))
  }

  await admin
    .from('conversation_messages')
    .update({ external_message_id: mid ?? provisional, send_state: 'sent' })
    .eq('id', inserted.data.id)
  await admin
    .from('followups')
    .update({ status: 'sent', sent_at: now, locked_at: null, external_message_id: mid })
    .eq('id', due.id)
  await admin
    .from('conversations')
    .update({ last_message_at: now, last_message_preview: preview, updated_at: now })
    .eq('id', conv.id)
  await admin.rpc('bump_agent_sent', { p_conversation_id: conv.id, p_count: 1 }).then(
    () => {},
    () => {},
  )
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!(await isCronCall(req))) return new Response('unauthorized', { status: 401 })

  const { data, error } = await admin.rpc('dispatch_due_followups', { p_limit: 40 })
  if (error) {
    await logEvent('warn', 'followups-dispatch', `réservation impossible: ${error.message}`)
    return json(req, { error: 'reserve_failed' }, 500)
  }
  const due = (data ?? []) as DueFollowup[]
  const queue = [...due]
  const workers = Array.from({ length: Math.min(8, queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift()!
      try {
        await handleFollowup(item)
      } catch (e) {
        await logEvent('error', 'followups-dispatch', `relance=${item.id} échec inattendu: ${String(e).slice(0, 300)}`, {
          conversation_id: item.conversation_id,
        })
        await skip(item.id, 'dispatch_error', String(e).slice(0, 200))
      }
    }
  })
  await Promise.all(workers)
  return json(req, { dispatched: due.length })
})
