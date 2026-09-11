// Réponses préenregistrées. Le tri se fait par un appel dédié sur le petit modèle, pas dans
// le prompt principal : celui-ci est repris de la V1 et ne doit pas gagner une voie de sortie
// supplémentaire. Quand une réponse correspond, la génération complète est évitée.
import { admin, logEvent } from '../_shared/core.ts'
import { AI_MODEL_SUMMARY, generateText, recordUsage } from '../_shared/ai.ts'
import { sendInstagramAudio, sendInstagramText } from '../_shared/instagram.ts'
import { planFollowups } from '../_shared/followups.ts'
import type { FollowupSettings } from '../_shared/followups.ts'

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
  'Ne choisis une situation que si le message du prospect y correspond sans ambiguïté. ' +
  'Dans le doute, réponds aucune.'

async function classify(opts: {
  apiKey: string
  keySource: 'platform' | 'byok'
  userId: string
  convId: number
  lastCustomerText: string
  entries: CannedResponse[]
}): Promise<string | null> {
  const list = opts.entries.map((e) => `${e.id} : ${e.trigger}`).join('\n')
  const prompt = `Message du prospect :\n"${opts.lastCustomerText.slice(0, 1000)}"\n\nSituations :\n${list}\n\nRéponds uniquement par un identifiant de la liste, ou par le mot aucune.`
  const res = await generateText({
    apiKey: opts.apiKey,
    model: AI_MODEL_SUMMARY,
    system: CLASSIFIER_SYSTEM,
    prompt,
    maxTokens: 20,
  })
  await recordUsage({
    userId: opts.userId,
    conversationId: opts.convId,
    model: AI_MODEL_SUMMARY,
    usage: res.usage,
    source: opts.keySource,
  })
  const answer = res.text.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const match = opts.entries.find((e) => (e.id ?? '').toLowerCase() === answer)
  return match?.id ?? null
}

// Renvoie true si une réponse préenregistrée a été envoyée : l'appelant s'arrête là.
export async function tryCannedResponse(params: {
  convId: number
  userId: string
  assistantId: string
  settings: Record<string, unknown>
  metadata: Record<string, unknown>
  lastCustomerText: string
  apiKey: string
  keySource: 'platform' | 'byok'
  token: string
  igUserId: string
  recipientId: string
}): Promise<boolean> {
  const all = usableCannedResponses(params.settings.canned_responses as CannedResponse[] | undefined)
  if (all.length === 0 || !params.lastCustomerText.trim()) return false
  const used = Array.isArray(params.metadata.canned_used) ? (params.metadata.canned_used as string[]) : []
  // Une même réponse ne se rejoue jamais dans une conversation, sinon le prospect
  // reçoit deux fois le même vocal.
  const entries = all.filter((e) => !used.includes(e.id!))
  if (entries.length === 0) return false

  let chosen: string | null = null
  try {
    chosen = await classify({
      apiKey: params.apiKey,
      keySource: params.keySource,
      userId: params.userId,
      convId: params.convId,
      lastCustomerText: params.lastCustomerText,
      entries,
    })
  } catch (_) {
    return false
  }
  if (!chosen) return false
  const entry = entries.find((e) => e.id === chosen)!
  const isAudio = entry.kind === 'audio'

  let audioUrl: string | null = null
  if (isAudio) {
    const signed = await admin.storage
      .from('assistant-audio')
      .createSignedUrl(entry.media_path!, AUDIO_URL_TTL_SECONDS)
    audioUrl = signed.data?.signedUrl ?? null
    if (!audioUrl) return false
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
  if (inserted.error) return false

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
    return false
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
  await admin
    .from('conversations')
    .update({
      automation_state: 'idle',
      automation_reason: 'canned_response',
      next_reply_at: null,
      debounce_until: null,
      pending_cursor_at: null,
      pending_since: null,
      pending_inbound_count: 0,
      is_processing: false,
      processing_started_at: null,
      last_agent_reply_at: now,
      last_message_at: now,
      last_message_preview: (isAudio ? '[Vocal]' : entry.text!).slice(0, 140),
      last_error_code: null,
      last_error_message: null,
      metadata: meta,
      updated_at: now,
    })
    .eq('id', params.convId)
  await admin.rpc('bump_agent_sent', { p_conversation_id: params.convId, p_count: 1 }).then(
    () => {},
    () => {},
  )
  try {
    await planFollowups({
      conversationId: params.convId,
      assistantId: params.assistantId,
      anchorMessageId: inserted.data.id,
      settings: (params.settings as { followups?: FollowupSettings }).followups,
    })
  } catch (_) {
    // la réponse est partie, une relance non programmée ne justifie pas d'échouer
  }
  return true
}
