// Envoie les relances dues. Déclenché chaque minute par pg_cron, comme assistant-dispatch.
// Le texte vient du client, jamais de l'IA, et aucun crédit n'est consommé.
// Meta n'accepte un envoi automatisé que dans les 24 h qui suivent le dernier message du prospect.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'
import { getChannelToken, sendInstagramAudio, sendInstagramText } from '../_shared/instagram.ts'
import { findFollowupItem, nextFollowupItem, pickVariant, planNextFollowup, usableFollowupItems } from '../_shared/followups.ts'
import type { FollowupItem, FollowupSettings } from '../_shared/followups.ts'
import { audienceBlocks } from '../_shared/audience.ts'
import { formatFirstName, hasNameVariable, renderFollowupText, usableDisplayName } from '../_shared/followup-text.ts'
import { AI_MODEL_SUMMARY, generateText, recordUsage, resolveApiKey } from '../_shared/ai.ts'

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

const FIRST_NAME_SYSTEM =
  'Tu lis des messages envoyés par un prospect sur Instagram. Si le prospect y donne explicitement ' +
  'son propre prénom, réponds uniquement par ce prénom. Sinon réponds uniquement : aucun.'

type NameSource = {
  id: number
  user_id: string
  contact_name: string | null
  contact_handle: string | null
  metadata: Record<string, unknown> | null
}

// Le prénom donné par le prospect prime sur son nom Instagram, souvent un pseudo. Le résultat
// est mémorisé, y compris « aucun », pour ne payer la lecture qu'une fois par conversation.
async function resolveFirstName(conv: NameSource): Promise<string | null> {
  const fallback = usableDisplayName(conv.contact_name, conv.contact_handle)
  const meta = conv.metadata ?? {}
  if (typeof meta.first_name === 'string') return meta.first_name || fallback
  try {
    const profile = await admin.from('profiles').select('plan_override').eq('user_id', conv.user_id).maybeSingle()
    const key = await resolveApiKey(conv.user_id, profile.data?.plan_override ?? null)
    if (!key) return fallback
    const msgs = await admin
      .from('conversation_messages')
      .select('body_text, transcript')
      .eq('conversation_id', conv.id)
      .eq('author_type', 'customer')
      .order('id', { ascending: false })
      .limit(30)
    const lines = (msgs.data ?? [])
      .reverse()
      .map((m) => (m.transcript || m.body_text || '').trim())
      .filter(Boolean)
    let found = ''
    if (lines.length > 0) {
      const res = await generateText({
        apiKey: key.key,
        model: AI_MODEL_SUMMARY,
        system: FIRST_NAME_SYSTEM,
        prompt: lines.join('\n').slice(-4000),
        maxTokens: 12,
      })
      await recordUsage({ userId: conv.user_id, conversationId: conv.id, model: AI_MODEL_SUMMARY, usage: res.usage, source: key.source })
      const word = res.text.trim().split(/\s+/)[0]?.replace(/[.,!]+$/, '') ?? ''
      if (/^\p{L}[\p{L}'-]{1,19}$/u.test(word) && word.toLowerCase() !== 'aucun') found = formatFirstName(word)
    }
    await admin
      .from('conversations')
      .update({ metadata: { ...meta, first_name: found } })
      .eq('id', conv.id)
    return found || fallback
  } catch (_) {
    return fallback
  }
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

async function followupItemId(id: string) {
  const { data } = await admin.from('followups').select('item_id').eq('id', id).maybeSingle()
  return (data?.item_id as string | null) ?? null
}

// La relance suivante ne naît qu'une fois celle-ci partie, avec son propre délai.
async function chainNext(due: DueFollowup, anchorMessageId: number) {
  try {
    const conv = await admin.from('conversations').select('assistant_id').eq('id', due.conversation_id).maybeSingle()
    const assistantId = due.assistant_id ?? conv.data?.assistant_id
    if (!assistantId) return
    const agent = await admin.from('assistants').select('settings').eq('id', assistantId).maybeSingle()
    const items = usableFollowupItems((agent.data?.settings as { followups?: FollowupSettings } | null)?.followups)
    const next = nextFollowupItem(items, await followupItemId(due.id), due.slot_index)
    if (!next) return
    await planNextFollowup({
      conversationId: due.conversation_id,
      assistantId,
      anchorMessageId,
      slot: due.slot_index + 1,
      item: next,
    })
  } catch (e) {
    await logEvent('warn', 'followups-dispatch', `relance suivante non planifiée conv=${due.conversation_id}: ${String(e).slice(0, 200)}`, {
      conversation_id: due.conversation_id,
    })
  }
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
    await chainNext(due, due.message_id)
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
    .select('id, user_id, assistant_id, channel_account_id, contact_external_id, contact_name, contact_handle, metadata, automation_state, heat_tag')
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
  if (audienceBlocks(agent.settings, conv.contact_handle)) return skip(due.id, 'audience_blocked')

  const settings = (agent.settings ?? {}) as { followups?: FollowupSettings }
  const items = usableFollowupItems(settings.followups)
  const item: FollowupItem | null = findFollowupItem(items, await followupItemId(due.id), due.slot_index)
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
  const variant = isAudio ? null : pickVariant(item)
  if (!isAudio && !variant) return skip(due.id, 'followup_removed')
  const text = variant && hasNameVariable(variant) ? renderFollowupText(variant, await resolveFirstName(conv)) : variant

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
  await chainNext(due, inserted.data.id)
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
