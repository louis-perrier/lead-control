// Fait partir les étapes de relance dues. Déclenché chaque minute par pg_cron, comme assistant-dispatch.
// Le contenu vient du client, jamais de l'IA, et aucun crédit n'est consommé.
// Meta n'accepte un envoi ou un like automatisé que dans les 24 h qui suivent le dernier message
// du prospect : au-delà, l'étape ne fait que prévenir le coach, qui envoie lui-même depuis Instagram.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'
import {
  getChannelToken,
  sendInstagramAudio,
  sendInstagramImage,
  sendInstagramReaction,
  sendInstagramText,
} from '../_shared/instagram.ts'
import {
  conversationHasBooking,
  findStep,
  nextStep,
  pickVariant,
  planFollowupSlot,
  usableSteps,
} from '../_shared/followups.ts'
import type { FollowupSettings, FollowupStep, FollowupVariant, SentVariant } from '../_shared/followups.ts'
import { audienceBlocks } from '../_shared/audience.ts'
import { formatFirstName, hasNameVariable, renderFollowupText, usableDisplayName } from '../_shared/followup-text.ts'
import { notifyFollowupToSend } from '../_shared/notify.ts'
import { AI_MODEL_SUMMARY, generateText, recordUsage, resolveApiKey } from '../_shared/ai.ts'

const MEDIA_URL_TTL_SECONDS = 3600
const MAX_ATTEMPTS = 3
// Sans ce décalage, toutes les relances reportées la nuit partiraient à la seconde
// d'ouverture des horaires, sur le même compte Instagram.
const MAX_JITTER_MS = 20 * 60 * 1000
const MEDIA_BUCKET: Record<string, string> = { audio: 'assistant-audio', image: 'assistant-media' }

// Un saut pour l'une de ces raisons ne doit pas tuer la suite : la notification au coach
// attend justement que la fenêtre soit fermée.
const CHAIN_AFTER_SKIP = new Set(['window_expired', 'react_failed', 'reaction_target_missing', 'already_liked'])

type DueFollowup = {
  id: string
  user_id: string
  conversation_id: number
  assistant_id: string | null
  slot_index: number
  message_id: number | null
  attempts: number
}

type FollowupRow = { item_id: string | null; anchor_message_id: number | null; variant_id: string | null }

const FIRST_NAME_SYSTEM =
  'Tu lis des messages envoyés par un prospect sur Instagram. Si le prospect y donne explicitement ' +
  'son propre prénom, réponds uniquement par ce prénom. Ignore tout autre prénom, en particulier celui ' +
  'de la personne à qui il écrit. Sinon réponds uniquement : aucun.'

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
    const profile = await admin.from('profiles').select('plan_override, full_name').eq('user_id', conv.user_id).maybeSingle()
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
      // Un prospect qui écrit « Salut Thibaut » ne doit jamais recevoir le prénom du coach.
      const coachFirstName = (profile.data?.full_name ?? '').trim().split(/\s+/)[0]?.toLowerCase()
      const lower = word.toLowerCase()
      if (/^\p{L}[\p{L}'-]{1,19}$/u.test(word) && lower !== 'aucun' && lower !== coachFirstName) found = formatFirstName(word)
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

async function followupRow(id: string): Promise<FollowupRow> {
  const { data } = await admin.from('followups').select('item_id, anchor_message_id, variant_id').eq('id', id).maybeSingle()
  return {
    item_id: (data?.item_id as string | null) ?? null,
    anchor_message_id: (data?.anchor_message_id as number | null) ?? null,
    variant_id: (data?.variant_id as string | null) ?? null,
  }
}

// Ce que ce prospect a déjà reçu en relance, pour ne pas lui resservir la même variante quand la
// séquence repart après une réponse. Une relance notifiée mais jamais envoyée ne compte pas.
async function sentVariants(conversationId: number): Promise<SentVariant[]> {
  const { data } = await admin
    .from('followups')
    .select('variant_id, message_body')
    .eq('conversation_id', conversationId)
    .eq('status', 'sent')
    .in('kind', ['text', 'audio', 'image'])
    .order('sent_at', { ascending: true })
  return (data ?? []).map((row) => ({ variant_id: row.variant_id as string | null, text: row.message_body as string | null }))
}

// L'étape suivante ne naît qu'une fois celle-ci passée, sur la même ancre : ses minutes sont
// comptées depuis notre dernier message, pas depuis l'étape précédente.
async function chainNext(due: DueFollowup, anchorMessageId: number | null, stepId: string | null) {
  if (!anchorMessageId) return
  try {
    const conv = await admin.from('conversations').select('assistant_id').eq('id', due.conversation_id).maybeSingle()
    const assistantId = due.assistant_id ?? conv.data?.assistant_id
    if (!assistantId) return
    const agent = await admin.from('assistants').select('settings').eq('id', assistantId).maybeSingle()
    const steps = usableSteps((agent.data?.settings as { followups?: FollowupSettings } | null)?.followups)
    const next = nextStep(steps, stepId, due.slot_index)
    if (!next) return
    await planFollowupSlot({
      conversationId: due.conversation_id,
      assistantId,
      anchorMessageId,
      slot: due.slot_index + 1,
      step: next,
    })
  } catch (e) {
    await logEvent('warn', 'followups-dispatch', `étape suivante non planifiée conv=${due.conversation_id}: ${String(e).slice(0, 200)}`, {
      conversation_id: due.conversation_id,
    })
  }
}

async function skipAndChain(due: DueFollowup, row: FollowupRow, reason: string, errorMessage?: string) {
  await skip(due.id, reason, errorMessage)
  if (CHAIN_AFTER_SKIP.has(reason)) await chainNext(due, row.anchor_message_id, row.item_id)
}

// Une reprise après interruption ne renvoie jamais : un second message identique chez le
// prospect coûte plus cher qu'une relance manquée.
async function resolveInterrupted(due: DueFollowup, row: FollowupRow): Promise<boolean> {
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
    await chainNext(due, row.anchor_message_id, row.item_id)
  } else {
    await skip(due.id, 'interrupted')
  }
  return true
}

type Conv = {
  id: number
  user_id: string
  assistant_id: string | null
  channel_account_id: string | null
  contact_external_id: string | null
  contact_name: string | null
  contact_handle: string | null
  metadata: Record<string, unknown> | null
  automation_state: string
  heat_tag: string | null
}

type Channel = { token: string; igUserId: string }

async function customerWroteLast(convId: number) {
  const lastMsg = await admin
    .from('conversation_messages')
    .select('direction')
    .eq('conversation_id', convId)
    .order('sent_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  return lastMsg.data?.direction === 'in'
}

// Le cœur remonte la conversation chez le prospect sans rien écrire dans le fil.
async function handleLike(due: DueFollowup, row: FollowupRow, conv: Conv, channel: Channel) {
  const target = await admin
    .from('conversation_messages')
    .select('id, external_message_id, reaction')
    .eq('conversation_id', conv.id)
    .eq('author_type', 'customer')
    .order('sent_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  const mid = target.data?.external_message_id as string | null | undefined
  if (!target.data || !mid || mid.startsWith('local:')) return skipAndChain(due, row, 'reaction_target_missing')
  if (target.data.reaction) return skipAndChain(due, row, 'already_liked')
  try {
    await sendInstagramReaction(channel.token, channel.igUserId, conv.contact_external_id!, mid)
  } catch (e) {
    await logEvent('warn', 'followups-dispatch', `like de relance refusé conv=${conv.id}: ${String(e).slice(0, 200)}`, {
      user_id: conv.user_id,
      conversation_id: conv.id,
    })
    return skipAndChain(due, row, 'react_failed', String(e).slice(0, 200))
  }
  const now = new Date().toISOString()
  await admin.from('conversation_messages').update({ reaction: '❤️' }).eq('id', target.data.id)
  await admin
    .from('followups')
    .update({ status: 'sent', kind: 'like', sent_at: now, locked_at: null, external_message_id: mid })
    .eq('id', due.id)
  await chainNext(due, row.anchor_message_id, row.item_id)
}

async function signedMediaUrl(variant: FollowupVariant) {
  const bucket = MEDIA_BUCKET[variant.kind]
  if (!bucket || !variant.media_path) return { url: null, error: 'media_path_missing' }
  const signed = await admin.storage.from(bucket).createSignedUrl(variant.media_path, MEDIA_URL_TTL_SECONDS)
  return { url: signed.data?.signedUrl ?? null, error: signed.error?.message }
}

async function sendVariant(
  due: DueFollowup,
  row: FollowupRow,
  conv: Conv,
  channel: Channel,
  variant: FollowupVariant,
  text: string | null,
  opts: { chain: boolean },
) {
  const isMedia = variant.kind !== 'text'
  let mediaUrl: string | null = null
  if (isMedia) {
    const signed = await signedMediaUrl(variant)
    if (!signed.url) return skip(due.id, variant.kind === 'audio' ? 'audio_unavailable' : 'image_unavailable', signed.error)
    mediaUrl = signed.url
  }

  // Dernier contrôle, au plus près de l'envoi : le prospect a pu écrire pendant les
  // vérifications, et le trigger d'annulation ne voit plus une relance déjà réservée.
  if (await customerWroteLast(conv.id)) return skip(due.id, 'customer_replied')

  const now = new Date().toISOString()
  const placeholder = variant.kind === 'audio' ? '[Vocal]' : variant.kind === 'image' ? '[Image]' : null
  const caption = isMedia ? variant.transcript?.trim() || null : null
  const preview = placeholder ?? text!.slice(0, 140)
  const provisional = `local:${crypto.randomUUID()}`
  const inserted = await admin
    .from('conversation_messages')
    .insert({
      conversation_id: conv.id,
      provider: 'instagram',
      external_message_id: provisional,
      direction: 'out',
      author_type: 'agent',
      body_text: placeholder ?? text,
      message_type: variant.kind,
      media_path: isMedia ? variant.media_path : null,
      media_mime: isMedia ? variant.media_mime ?? (variant.kind === 'audio' ? 'audio/wav' : 'image/jpeg') : null,
      media_bucket: isMedia ? MEDIA_BUCKET[variant.kind] : null,
      transcript: caption,
      transcript_status: caption ? 'done' : 'none',
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
      kind: variant.kind,
      variant_id: variant.id,
      message_body: isMedia ? null : text,
      media_path: isMedia ? variant.media_path : null,
      media_mime: isMedia ? variant.media_mime ?? null : null,
    })
    .eq('id', due.id)

  let mid: string | null = null
  try {
    mid =
      variant.kind === 'audio'
        ? await sendInstagramAudio(channel.token, channel.igUserId, conv.contact_external_id!, mediaUrl!)
        : variant.kind === 'image'
          ? await sendInstagramImage(channel.token, channel.igUserId, conv.contact_external_id!, mediaUrl!)
          : await sendInstagramText(channel.token, channel.igUserId, conv.contact_external_id!, text!)
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
  if (opts.chain) await chainNext(due, row.anchor_message_id, row.item_id)
}

// La fenêtre Meta est fermée : le coach reçoit le texte prêt et l'envoie depuis Instagram.
// Son envoi revient par l'écho du webhook, ce qui retire la relance de la liste « à envoyer ».
async function handleNotify(due: DueFollowup, row: FollowupRow, conv: Conv, variant: FollowupVariant, text: string) {
  if (await customerWroteLast(conv.id)) return skip(due.id, 'customer_replied')
  const now = new Date().toISOString()
  await admin
    .from('followups')
    .update({ status: 'notified', kind: 'notify', variant_id: variant.id, message_body: text, sent_at: now, locked_at: null })
    .eq('id', due.id)
  await notifyFollowupToSend(conv.user_id, conv.id, text)
  await chainNext(due, row.anchor_message_id, row.item_id)
}

async function handleFollowup(due: DueFollowup) {
  const row = await followupRow(due.id)
  if (await resolveInterrupted(due, row)) return
  if (due.attempts > MAX_ATTEMPTS) return skip(due.id, 'too_many_attempts')

  const convRes = await admin
    .from('conversations')
    .select('id, user_id, assistant_id, channel_account_id, contact_external_id, contact_name, contact_handle, metadata, automation_state, heat_tag')
    .eq('id', due.conversation_id)
    .maybeSingle()
  const conv = convRes.data as Conv | null
  if (!conv) return skip(due.id, 'conversation_missing')
  if (!['idle', 'condition_stop'].includes(conv.automation_state)) {
    return skip(due.id, `conversation_${conv.automation_state}`)
  }
  if (conv.heat_tag === 'cold') return skip(due.id, 'cold_conversation')
  if (await conversationHasBooking(conv.id)) return skip(due.id, 'booked')
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
  const steps = usableSteps(settings.followups)
  const step: FollowupStep | null = findStep(steps, row.item_id, due.slot_index)
  if (!step) return skip(due.id, 'followup_removed')

  const closesRes = await admin.rpc('conversation_window_closes_at', { p_conversation_id: conv.id })
  const closesAt = closesRes.data ? Date.parse(closesRes.data as string) : 0
  const windowOpen = Boolean(closesAt) && Date.now() <= closesAt
  if (step.kind !== 'notify' && !windowOpen) return skipAndChain(due, row, 'window_expired')

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
    if (step.kind !== 'notify' && allowedAt > closesAt) return skipAndChain(due, row, 'window_expired')
    return postpone(due, allowedAt)
  }

  const channelRow = await admin
    .from('channel_accounts')
    .select('external_id')
    .eq('id', conv.channel_account_id)
    .maybeSingle()
  const token = await getChannelToken(conv.channel_account_id)
  const channel: Channel | null = token && channelRow.data?.external_id ? { token, igUserId: channelRow.data.external_id } : null
  if (!channel && step.kind !== 'notify') return skip(due.id, 'channel_token_missing')

  if (step.kind === 'like') return handleLike(due, row, conv, channel!)

  const texts = step.variants.map((v) => v.text ?? '')
  const firstName = texts.some((t) => hasNameVariable(t)) ? await resolveFirstName(conv) : null
  const render = (t: string) => (hasNameVariable(t) ? renderFollowupText(t, firstName) : t)
  const variant = pickVariant(step, await sentVariants(conv.id), render)
  if (!variant) return skip(due.id, 'followup_removed')
  const text = variant.kind === 'text' ? render(variant.text ?? '') : null

  if (step.kind === 'notify') {
    // Réglée trop tôt, la fenêtre est encore ouverte : autant l'envoyer comme un message.
    if (windowOpen && channel) return sendVariant(due, row, conv, channel, variant, text, { chain: true })
    return handleNotify(due, row, conv, variant, text ?? '')
  }
  return sendVariant(due, row, conv, channel!, variant, text, { chain: true })
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
