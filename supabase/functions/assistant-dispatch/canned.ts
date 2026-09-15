// Réponses préenregistrées, reconnues hors du prompt principal repris de la V1. Si le message
// ne demande rien d'autre, la génération complète est évitée ; sinon l'agent répond au reste.
import { admin, logEvent } from '../_shared/core.ts'
import { bestKeywordMatch, firstJsonObject, isOnlyPoliteness, triggerKind } from '../_shared/canned-match.ts'
import { AI_MODEL_SUMMARY, generateText, recordUsage } from '../_shared/ai.ts'
import { sendInstagramAudio, sendInstagramText } from '../_shared/instagram.ts'
import { planFollowups } from '../_shared/followups.ts'
import { finalizeConversation } from './finalize.ts'

export type CannedResponse = {
  id?: string
  trigger?: string
  kind?: 'text' | 'audio'
  text?: string
  media_path?: string
  media_mime?: string
}

export const MAX_CANNED_RESPONSES = 5
const AUDIO_URL_TTL_SECONDS = 3600

export function usableCannedResponses(list?: CannedResponse[] | null): CannedResponse[] {
  if (!Array.isArray(list)) return []
  return list
    .filter((entry) => {
      if (!entry?.id || !(entry.trigger ?? '').trim()) return false
      return entry.kind === 'audio' ? Boolean(entry.media_path) : Boolean((entry.text ?? '').trim())
    })
    .slice(0, MAX_CANNED_RESPONSES)
}

const CLASSIFIER_SYSTEM =
  'Tu es un routeur de messages. Tu ne rédiges rien, tu choisis au plus une situation. ' +
  'Ne choisis une situation que si le dernier message du prospect y correspond sans ambiguïté ' +
  'et si la réponse associée reste cohérente avec ce que le prospect a déjà dit. Les échanges ' +
  'précédents servent seulement à le comprendre. Dans le doute, choisis 0. ' +
  '"reste" vaut true si le dernier message du prospect contient aussi une autre question ou ' +
  'information qui appelle une réponse, en plus de la situation choisie. ' +
  'Réponds uniquement par ce JSON, sans aucun texte autour : {"situation": numéro ou 0, "reste": true ou false}'

const KEYWORD_CHECK_SYSTEM =
  'Tu vérifies si une réponse préenregistrée peut partir telle quelle. Le dernier message du ' +
  'prospect contient le mot-clé indiqué. "envoyer" vaut true seulement si le message parle bien ' +
  'de ce mot-clé et si la réponse reste cohérente avec ce que le prospect a dit : elle ne lui ' +
  'redemande pas une information déjà donnée et ne le contredit pas. "reste" vaut true si le ' +
  'message contient aussi une autre question ou information qui appelle une réponse. ' +
  'Réponds uniquement par ce JSON, sans aucun texte autour : {"envoyer": true ou false, "reste": true ou false}'

type AiContext = {
  apiKey: string
  keySource: 'platform' | 'byok'
  userId: string
  convId: number
  lastCustomerText: string
  recentLines: string[]
}

function replyPreview(entry: CannedResponse) {
  return entry.kind === 'audio' ? '(message vocal)' : (entry.text ?? '').slice(0, 300)
}

async function askSmallModel(ctx: AiContext, system: string, body: string, maxTokens: number) {
  const recent = ctx.recentLines.length ? `Échanges précédents :\n${ctx.recentLines.join('\n').slice(-1500)}\n\n` : ''
  const res = await generateText({
    apiKey: ctx.apiKey,
    model: AI_MODEL_SUMMARY,
    system,
    prompt: `${recent}Dernier message du prospect :\n"${ctx.lastCustomerText.slice(0, 1000)}"\n\n${body}`,
    maxTokens,
  })
  await recordUsage({
    userId: ctx.userId,
    conversationId: ctx.convId,
    model: AI_MODEL_SUMMARY,
    usage: res.usage,
    source: ctx.keySource,
  })
  return res.text
}

async function confirmKeyword(ctx: AiContext, entry: CannedResponse): Promise<{ id: string; other: boolean } | null> {
  const text = await askSmallModel(
    ctx,
    KEYWORD_CHECK_SYSTEM,
    `Mot-clé : ${entry.trigger}\nRéponse préenregistrée : ${replyPreview(entry)}`,
    40,
  )
  const parsed = firstJsonObject(text)
  return parsed?.envoyer === true ? { id: entry.id!, other: parsed.reste === true } : null
}

async function classify(ctx: AiContext, entries: CannedResponse[]): Promise<{ id: string; other: boolean } | null> {
  // Des numéros plutôt que les identifiants : moins de tokens, et une réponse jamais coupée.
  const list = entries.map((e, i) => `${i + 1}. ${e.trigger}\n   Réponse associée : ${replyPreview(e)}`).join('\n')
  const text = await askSmallModel(ctx, CLASSIFIER_SYSTEM, `Situations :\n${list}`, 60)
  const parsed = firstJsonObject(text)
  const match = entries[Number(parsed?.situation) - 1]
  return match?.id ? { id: match.id, other: parsed?.reste === true } : null
}

export type CannedOutcome = {
  sent: boolean
  // Le message du prospect demande autre chose : l'agent principal répond au reste dans le même tour.
  continueWithAgent: boolean
  metadata: Record<string, unknown>
  messageId: number | null
}

export async function tryCannedResponse(params: {
  convId: number
  userId: string
  assistantId: string
  settings: Record<string, unknown>
  metadata: Record<string, unknown>
  contactHandle: string | null
  lastCustomerText: string
  recentLines: string[]
  apiKey: string
  keySource: 'platform' | 'byok'
  token: string
  igUserId: string
  recipientId: string
}): Promise<CannedOutcome> {
  const none: CannedOutcome = { sent: false, continueWithAgent: false, metadata: params.metadata, messageId: null }
  const all = usableCannedResponses(params.settings.canned_responses as CannedResponse[] | undefined)
  if (all.length === 0 || isOnlyPoliteness(params.lastCustomerText)) return none
  const used = Array.isArray(params.metadata.canned_used) ? (params.metadata.canned_used as string[]) : []
  // Une même réponse ne se rejoue jamais dans une conversation, sinon le prospect
  // reçoit deux fois le même vocal.
  const entries = all.filter((e) => !used.includes(e.id!))
  if (entries.length === 0) return none

  const ctx: AiContext = {
    apiKey: params.apiKey,
    keySource: params.keySource,
    userId: params.userId,
    convId: params.convId,
    lastCustomerText: params.lastCustomerText,
    recentLines: params.recentLines,
  }
  // Un message qui se résume au mot-clé part sans appel IA ; le petit modèle ne sert qu'à
  // vérifier un mot-clé noyé dans un message plus long, puis à reconnaître les situations.
  let chosen: { id: string; other: boolean } | null = null
  try {
    const hit = bestKeywordMatch(params.lastCustomerText, entries)
    if (hit?.match === 'exact') chosen = { id: hit.entry.id!, other: false }
    else if (hit) chosen = await confirmKeyword(ctx, hit.entry)
    const situations = entries.filter((e) => triggerKind(e.trigger ?? '') === 'situation')
    if (!chosen && situations.length > 0) chosen = await classify(ctx, situations)
  } catch (_) {
    return none
  }
  if (!chosen) return none
  const entry = entries.find((e) => e.id === chosen!.id)!
  const isAudio = entry.kind === 'audio'

  let audioUrl: string | null = null
  if (isAudio) {
    const signed = await admin.storage
      .from('assistant-audio')
      .createSignedUrl(entry.media_path!, AUDIO_URL_TTL_SECONDS)
    audioUrl = signed.data?.signedUrl ?? null
    if (!audioUrl) return none
  }

  const now = new Date().toISOString()
  const provisional = `local:${crypto.randomUUID()}`
  const inserted = await admin
    .from('conversation_messages')
    .insert({
      conversation_id: params.convId,
      provider: 'instagram',
      external_message_id: provisional,
      direction: 'out',
      author_type: 'agent',
      body_text: isAudio ? '[Vocal]' : entry.text,
      message_type: isAudio ? 'audio' : 'text',
      media_path: isAudio ? entry.media_path : null,
      media_mime: isAudio ? entry.media_mime ?? 'audio/wav' : null,
      media_bucket: isAudio ? 'assistant-audio' : null,
      send_state: 'queued',
      sent_at: now,
    })
    .select('id')
    .single()
  if (inserted.error) return none

  let mid: string | null = null
  try {
    mid = isAudio
      ? await sendInstagramAudio(params.token, params.igUserId, params.recipientId, audioUrl!)
      : await sendInstagramText(params.token, params.igUserId, params.recipientId, entry.text!)
  } catch (e) {
    await admin
      .from('conversation_messages')
      .update({ send_state: 'failed', error_message: String(e).slice(0, 200) })
      .eq('id', inserted.data.id)
    await logEvent('error', 'assistant-dispatch', `réponse préenregistrée non envoyée conv=${params.convId}: ${String(e).slice(0, 300)}`, {
      user_id: params.userId,
      conversation_id: params.convId,
    })
    return none
  }

  await admin
    .from('conversation_messages')
    .update({ external_message_id: mid ?? provisional, send_state: 'sent' })
    .eq('id', inserted.data.id)
  // Une réponse préenregistrée reste une réponse envoyée au prospect : même tarif
  // qu'une réponse générée, sinon la facturation dépendrait de la façon d'écrire.
  await admin.rpc('consume_one_credit', { p_user_id: params.userId })

  const meta = { ...params.metadata, canned_used: [...used, entry.id!] }
  delete (meta as Record<string, unknown>).dispatch_retries
  await admin.rpc('bump_agent_sent', { p_conversation_id: params.convId, p_count: 1 }).then(
    () => {},
    () => {},
  )

  // L'agent reprend la main dans ce tour : l'état et les relances sont posés à la fin.
  if (chosen.other) {
    await admin
      .from('conversations')
      .update({ metadata: meta, last_message_at: now, last_message_preview: (isAudio ? '[Vocal]' : entry.text!).slice(0, 140) })
      .eq('id', params.convId)
    return { sent: true, continueWithAgent: true, metadata: meta, messageId: inserted.data.id }
  }

  await finalizeConversation(
    params.convId,
    {
      automation_state: 'idle',
      automation_reason: 'canned_response',
      next_reply_at: null,
      debounce_until: null,
      pending_cursor_at: null,
      pending_since: null,
      pending_inbound_count: 0,
      last_error_code: null,
      last_error_message: null,
    },
    {
      last_agent_reply_at: now,
      last_message_at: now,
      last_message_preview: (isAudio ? '[Vocal]' : entry.text!).slice(0, 140),
      metadata: meta,
    },
  )
  try {
    await planFollowups({
      conversationId: params.convId,
      assistantId: params.assistantId,
      anchorMessageId: inserted.data.id,
      assistantSettings: params.settings,
      contactHandle: params.contactHandle,
      anchorText: isAudio ? null : entry.text,
    })
  } catch (_) {
    // la réponse est partie, une relance non programmée ne justifie pas d'échouer
  }
  return { sent: true, continueWithAgent: false, metadata: meta, messageId: inserted.data.id }
}
