// Cerveau de l'assistant : réserve les conversations dues, construit le contexte,
// appelle Anthropic (clé plateforme ou clé du bêta-testeur), envoie la réponse
// sur Instagram et consomme le crédit. Déclenché chaque minute par pg_cron.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'
import { getChannelToken, markSeen, sendInstagramText } from '../_shared/instagram.ts'
import { AI_MODEL_REPLY, AI_MODEL_SUMMARY, generateText, recordUsage, resolveApiKey } from '../_shared/ai.ts'
import { buildSummaryPrompt, buildSystemPrompt } from './prompt.ts'
import { resolveTone } from './types.ts'
import type { AgentDecision, WindowMessage } from './types.ts'

// La mémoire n8n d'origine gardait 100 messages par conversation : on aligne
// la fenêtre pour obtenir le même niveau de contexte.
const MIN_WINDOW = 20
const MAX_WINDOW = 100
const MAX_CONTEXT_DOCS_CHARS = 6000

type DueConversation = {
  id: number
  user_id: string
  assistant_id: string | null
  channel_account_id: string | null
  provider: string
  contact_external_id: string | null
  pending_cursor_at: string | null
  pending_inbound_count: number
}

async function releaseLock(convId: number, patch: Record<string, unknown>) {
  await admin
    .from('conversations')
    .update({ is_processing: false, processing_started_at: null, updated_at: new Date().toISOString(), ...patch })
    .eq('id', convId)
}

async function stopWith(convId: number, reason: string, errorMessage?: string) {
  await releaseLock(convId, {
    automation_state: errorMessage ? 'error' : 'stopped',
    automation_reason: reason,
    next_reply_at: null,
    debounce_until: null,
    last_error_code: errorMessage ? reason : null,
    last_error_message: errorMessage ?? null,
  })
}

async function retryLater(convId: number, reason: string, delayMs: number) {
  const at = new Date(Date.now() + delayMs).toISOString()
  await releaseLock(convId, {
    automation_state: 'scheduled',
    automation_reason: reason,
    next_reply_at: at,
    debounce_until: at,
  })
}

async function fetchWindow(convId: number, cursor: string | null): Promise<WindowMessage[]> {
  const fields = 'id, direction, author_type, body_text, message_type, transcript, transcript_status, transcript_error, sent_at'
  if (!cursor) {
    const { data, error } = await admin
      .from('conversation_messages')
      .select(fields)
      .eq('conversation_id', convId)
      .order('sent_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_WINDOW)
    if (error) throw new Error(error.message)
    return (data ?? []).reverse() as WindowMessage[]
  }
  const pending = await admin
    .from('conversation_messages')
    .select(fields)
    .eq('conversation_id', convId)
    .gte('sent_at', cursor)
    .order('sent_at', { ascending: true })
    .order('id', { ascending: true })
  if (pending.error) throw new Error(pending.error.message)
  const pendingMessages = (pending.data ?? []) as WindowMessage[]
  if (pendingMessages.length >= MAX_WINDOW) return pendingMessages.slice(-MAX_WINDOW)
  if (pendingMessages.length >= MIN_WINDOW) return pendingMessages
  const backfill = await admin
    .from('conversation_messages')
    .select(fields)
    .eq('conversation_id', convId)
    .lt('sent_at', cursor)
    .order('sent_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MIN_WINDOW - pendingMessages.length)
  return ([...(backfill.data ?? []).reverse(), ...pendingMessages] as WindowMessage[])
}

function renderMessage(m: WindowMessage) {
  if (m.message_type === 'audio') {
    if (m.transcript_status === 'done' && m.transcript?.trim()) return `[Vocal] ${m.transcript.trim()}`
    if (m.transcript_status === 'processing') return '[Vocal en cours de transcription]'
    return '[Vocal non transcrit]'
  }
  if (m.message_type === 'image') return '[Photo]'
  return m.body_text?.trim() ?? ''
}

// Le modèle est instruit de séparer les bulles par une ligne vide à l'intérieur
// de reply_text : s'il retranscrit ce saut de ligne tel quel au lieu de l'échapper
// en \n, le JSON devient invalide. On répare en échappant les caractères de
// contrôle bruts, mais seulement à l'intérieur des chaînes, pas entre les jetons.
function sanitizeJsonControlChars(raw: string) {
  let result = ''
  let inString = false
  let escaped = false
  for (const ch of raw) {
    if (inString) {
      if (escaped) {
        result += ch
        escaped = false
      } else if (ch === '\\') {
        result += ch
        escaped = true
      } else if (ch === '"') {
        result += ch
        inString = false
      } else if (ch === '\n') {
        result += '\\n'
      } else if (ch === '\r') {
        result += '\\r'
      } else if (ch === '\t') {
        result += '\\t'
      } else {
        result += ch
      }
    } else {
      if (ch === '"') inString = true
      result += ch
    }
  }
  return result
}

function parseDecision(text: string): AgentDecision {
  const cleaned = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  try {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    const parsed = JSON.parse(sanitizeJsonControlChars(cleaned.slice(start, end + 1)))
    return {
      reply_text: typeof parsed.reply_text === 'string' ? parsed.reply_text : null,
      should_response: parsed.should_response !== false,
      stop_successful: parsed.stop_successful === true,
      should_notify_human: parsed.should_notify_human === true,
      heat_tag: ['hot', 'warm', 'cold', 'unknown'].includes(parsed.heat_tag) ? parsed.heat_tag : 'unknown',
      heat_reason: typeof parsed.heat_reason === 'string' ? parsed.heat_reason : '',
      summary: typeof parsed.summary === 'string' ? parsed.summary : null,
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
    }
  } catch {
    // JSON toujours invalide malgré la réparation : on tente d'extraire au moins
    // reply_text au lasso plutôt que d'abandonner.
    const match = cleaned.match(/"reply_text"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (match) {
      const extracted = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      return {
        reply_text: extracted || null,
        should_response: Boolean(extracted),
        stop_successful: false,
        should_notify_human: false,
        heat_tag: 'unknown',
        heat_reason: '',
        summary: null,
        reason: null,
      }
    }
    // Si la sortie ressemble à du JSON cassé, ne jamais l'envoyer telle quelle
    // au prospect : on escalade plutôt que de traiter ça comme la réponse elle-même.
    const looksLikeJson = /^\s*\{/.test(cleaned)
    return {
      reply_text: looksLikeJson ? null : cleaned || null,
      should_response: !looksLikeJson && Boolean(cleaned),
      stop_successful: false,
      should_notify_human: looksLikeJson,
      heat_tag: 'unknown',
      heat_reason: '',
      summary: null,
      reason: looksLikeJson ? 'Réponse du modèle illisible (JSON invalide) : vérifiez le dernier message.' : null,
    }
  }
}

async function customerRepliedSince(convId: number, sinceIso: string) {
  const { data } = await admin
    .from('conversation_messages')
    .select('id')
    .eq('conversation_id', convId)
    .eq('author_type', 'customer')
    .gt('sent_at', sinceIso)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function handleConversation(due: DueConversation) {
  const convId = due.id
  const convRes = await admin
    .from('conversations')
    .select('id, user_id, summary, contact_external_id, metadata, automation_state')
    .eq('id', convId)
    .single()
  if (convRes.error) return
  const conv = convRes.data

  if (!due.assistant_id) {
    await releaseLock(convId, { automation_state: 'idle', automation_reason: 'agent_missing' })
    return
  }
  const assistantRes = await admin
    .from('assistants')
    .select('id, user_id, is_active, settings, custom_tone, channel_account_id')
    .eq('id', due.assistant_id)
    .maybeSingle()
  const assistant = assistantRes.data
  if (!assistant || !assistant.is_active) {
    await stopWith(convId, 'agent_inactive')
    return
  }

  const profileRes = await admin
    .from('profiles')
    .select('plan_override')
    .eq('user_id', due.user_id)
    .single()
  const planOverride = profileRes.data?.plan_override ?? null

  const allowedRes = await admin.rpc('assistant_next_allowed_time', {
    p_assistant_id: assistant.id,
    p_at: new Date().toISOString(),
  })
  if (!allowedRes.data) {
    await stopWith(convId, 'outside_schedule')
    return
  }
  const allowedAt = new Date(allowedRes.data as string)
  if (allowedAt.getTime() > Date.now() + 1000) {
    await releaseLock(convId, {
      automation_state: 'scheduled',
      automation_reason: 'outside_schedule',
      next_reply_at: allowedAt.toISOString(),
      debounce_until: allowedAt.toISOString(),
    })
    return
  }

  const resolved = await resolveApiKey(due.user_id, planOverride)
  if (!resolved) {
    if (planOverride === 'beta_byok') {
      // Message visible par le bêta-testeur : c'est sa propre clé, il peut agir dessus.
      await stopWith(convId, 'missing_api_key', "Votre clé API Anthropic n'est pas configurée. Ajoutez-la dans Réglages pour que l'assistant puisse répondre.")
      await logEvent('warn', 'assistant-dispatch', 'clé Anthropic du bêta-testeur absente', {
        user_id: due.user_id,
        conversation_id: convId,
      })
    } else {
      // Jamais montré au client de base : c'est un problème côté plateforme, seuls les
      // admins doivent le voir (system_events), on retente juste plus tard.
      await retryLater(convId, 'platform_key_missing', 15 * 60 * 1000)
      await logEvent('error', 'assistant-dispatch', 'ANTHROPIC_API_KEY manquante côté plateforme', {
        conversation_id: convId,
      })
    }
    return
  }

  const canRes = await admin.rpc('can_consume_one_credit', { p_user_id: due.user_id })
  const can = canRes.data as { ok?: boolean; reason?: string } | null
  if (can?.ok === false) {
    const reason = can.reason ?? 'no_credits_left'
    const message =
      reason === 'no_credits_left'
        ? 'Tous les crédits du mois sont consommés. Achetez un pack de crédits ou attendez le renouvellement.'
        : reason === 'no_active_subscription'
          ? 'Aucun abonnement actif : rendez-vous dans Facturation pour continuer.'
          : "L'assistant ne peut pas répondre pour le moment, contactez le support."
    await stopWith(convId, reason, message)
    return
  }

  if (!due.channel_account_id || !conv.contact_external_id) {
    await stopWith(convId, 'channel_missing', 'Compte Instagram introuvable pour cette conversation.')
    return
  }
  const token = await getChannelToken(due.channel_account_id)
  if (!token) {
    await stopWith(convId, 'channel_token_missing', 'Le compte Instagram doit être reconnecté.')
    await admin
      .from('channel_accounts')
      .update({ status: 'expired', last_error: 'token manquant au moment de la réponse' })
      .eq('id', due.channel_account_id)
    return
  }
  const channelRes = await admin
    .from('channel_accounts')
    .select('external_id')
    .eq('id', due.channel_account_id)
    .single()
  const igUserId = channelRes.data?.external_id
  if (!igUserId) {
    await stopWith(convId, 'channel_missing', 'Compte Instagram introuvable.')
    return
  }

  const messages = await fetchWindow(convId, due.pending_cursor_at)
  const lastInbound = [...messages].reverse().find((m) => m.author_type === 'customer')
  if (lastInbound?.message_type === 'audio' && lastInbound.transcript_status === 'processing') {
    await retryLater(convId, 'audio_transcription_pending', 10_000)
    return
  }

  const settings = (assistant.settings ?? {}) as Record<string, any>

  let context = settings.context ?? ''
  const { data: docs } = await admin
    .from('context_documents')
    .select('title, extracted_text')
    .eq('user_id', due.user_id)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
  if (docs && docs.length > 0) {
    let remaining = MAX_CONTEXT_DOCS_CHARS
    const parts: string[] = []
    for (const d of docs) {
      if (remaining <= 0) break
      const text = (d.extracted_text ?? '').slice(0, remaining)
      if (text) parts.push(`### ${d.title}\n${text}`)
      remaining -= text.length
    }
    if (parts.length > 0) context = `${context}\n\n${parts.join('\n\n')}`.trim()
  }

  let summary = conv.summary ?? ''
  if (!summary && messages.length > 5) {
    try {
      const res = await generateText({
        apiKey: resolved.key,
        model: AI_MODEL_SUMMARY,
        system: 'Tu es un assistant CRM factuel.',
        prompt: buildSummaryPrompt(messages.map((m) => `${m.author_type} | ${renderMessage(m)}`)),
        maxTokens: 400,
      })
      summary = res.text
      await recordUsage({ userId: due.user_id, conversationId: convId, model: AI_MODEL_SUMMARY, usage: res.usage, source: resolved.source })
    } catch (_) {
      summary = ''
    }
  }

  const system = buildSystemPrompt({
    conversationId: convId,
    productName: settings.product?.name ?? '',
    context,
    qualification: settings.qualification ?? '',
    stopText: settings.stop_condition?.text ?? '',
    stopLink: settings.stop_condition?.link ?? '',
    tone: resolveTone(settings.tone?.preset, assistant.custom_tone),
    summary,
  })
  const transcriptLines = messages.map((m) => {
    const who = m.author_type === 'customer' ? 'PROSPECT' : m.author_type === 'human' ? 'OPÉRATEUR' : 'TOI'
    return `${who} : ${renderMessage(m)}`
  })
  const prompt = `Conversation (du plus ancien au plus récent) :\n${transcriptLines.join('\n')}\n\nRéponds au dernier message du prospect en respectant le format de sortie JSON.`

  const automationStart = new Date().toISOString()
  let decision: AgentDecision
  try {
    const res = await generateText({
      apiKey: resolved.key,
      model: AI_MODEL_REPLY,
      system,
      prompt,
      maxTokens: 1024,
    })
    decision = parseDecision(res.text)
    await recordUsage({ userId: due.user_id, conversationId: convId, model: AI_MODEL_REPLY, usage: res.usage, source: resolved.source })
  } catch (e) {
    const message = String(e)
    const looksLikeKeyIssue = /401|invalid.*api.?key|authentication|x-api-key|insufficient|credit balance/i.test(message)
    await logEvent('error', 'assistant-dispatch', `échec Anthropic conv=${convId}: ${message.slice(0, 300)}`, {
      user_id: due.user_id,
      conversation_id: convId,
    })

    // Clé du bêta-testeur invalide ou à court : message clair et immédiat, inutile
    // de réessayer, ça ne se corrigera pas tout seul.
    if (resolved.source === 'byok' && looksLikeKeyIssue) {
      await stopWith(convId, 'invalid_api_key', 'Votre clé API Anthropic ne fonctionne plus (invalide ou à court de crédit). Vérifiez-la dans Réglages.')
      return
    }

    const meta = (conv.metadata ?? {}) as Record<string, unknown>
    const retries = Number(meta.dispatch_retries ?? 0) + 1
    if (retries < 3) {
      await admin.from('conversations').update({ metadata: { ...meta, dispatch_retries: retries } }).eq('id', convId)
      await retryLater(convId, `ai_retry_${retries}`, 15_000)
    } else if (resolved.source === 'platform') {
      // Jamais de détail technique montré à un client de base pour un souci côté
      // plateforme : on retente en silence, seuls les admins voient l'échec loggé.
      await admin.from('conversations').update({ metadata: { ...meta, dispatch_retries: 0 } }).eq('id', convId)
      await retryLater(convId, 'platform_ai_error', 15 * 60 * 1000)
    } else {
      await stopWith(convId, 'ai_error', "Un problème technique empêche l'assistant de répondre pour le moment. Nous nous en occupons.")
    }
    return
  }

  await markSeen(token, igUserId, conv.contact_external_id)

  if (decision.should_notify_human) {
    await releaseLock(convId, {
      automation_state: 'error',
      automation_reason: 'notify_human',
      next_reply_at: null,
      debounce_until: null,
      pending_cursor_at: null,
      pending_since: null,
      pending_inbound_count: 0,
      last_error_code: 'notify_human',
      last_error_message: decision.reason || 'L’assistant demande une intervention humaine sur cette conversation.',
      heat_tag: decision.heat_tag,
      heat_reason: decision.heat_reason || null,
      summary: decision.summary ?? summary ?? null,
    })
    return
  }

  const blocks = (decision.reply_text ?? '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 2)

  let sentCount = 0
  if (decision.should_response && blocks.length > 0) {
    for (const [i, block] of blocks.entries()) {
      if (await customerRepliedSince(convId, automationStart)) break
      const provisional = `local:${crypto.randomUUID()}`
      const inserted = await admin
        .from('conversation_messages')
        .insert({
          conversation_id: convId,
          provider: 'instagram',
          external_message_id: provisional,
          direction: 'out',
          author_type: 'agent',
          body_text: block,
          send_state: 'queued',
          automation_start: automationStart,
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      try {
        const mid = await sendInstagramText(token, igUserId, conv.contact_external_id, block)
        await admin
          .from('conversation_messages')
          .update({
            external_message_id: mid ?? provisional,
            send_state: 'sent',
            automation_end: new Date().toISOString(),
            sent_at: new Date().toISOString(),
          })
          .eq('id', inserted.data!.id)
        sentCount += 1
        if (sentCount === 1) {
          await admin.rpc('consume_one_credit', { p_user_id: due.user_id })
        }
        if (i < blocks.length - 1) {
          await new Promise((r) => setTimeout(r, Math.min(8000, Math.max(1500, block.length * 60))))
        }
      } catch (e) {
        await admin
          .from('conversation_messages')
          .update({ send_state: 'failed', error_message: String(e).slice(0, 200) })
          .eq('id', inserted.data!.id)
        await stopWith(convId, 'send_failed', `L’envoi Instagram a échoué : ${String(e).slice(0, 160)}`)
        await logEvent('error', 'assistant-dispatch', `envoi échoué conv=${convId}: ${String(e).slice(0, 300)}`, {
          user_id: due.user_id,
          conversation_id: convId,
        })
        return
      }
    }
  }

  const now = new Date().toISOString()
  const meta = (conv.metadata ?? {}) as Record<string, unknown>
  delete meta.dispatch_retries
  await admin
    .from('conversations')
    .update({
      automation_state: decision.stop_successful ? 'condition_stop' : 'idle',
      automation_reason: decision.stop_successful ? 'stop_successful' : sentCount > 0 ? 'replied' : 'no_reply_needed',
      next_reply_at: null,
      debounce_until: null,
      pending_cursor_at: null,
      pending_since: null,
      pending_inbound_count: 0,
      is_processing: false,
      processing_started_at: null,
      last_agent_reply_at: sentCount > 0 ? now : undefined,
      last_message_at: sentCount > 0 ? now : undefined,
      last_message_preview: sentCount > 0 ? blocks[blocks.length - 1].slice(0, 140) : undefined,
      agent_sent_count: undefined,
      heat_tag: decision.heat_tag,
      heat_reason: decision.heat_reason || null,
      summary: decision.summary ?? (summary || null),
      last_error_code: null,
      last_error_message: null,
      metadata: meta,
      updated_at: now,
    })
    .eq('id', convId)
  if (sentCount > 0) {
    await admin.rpc('bump_agent_sent', { p_conversation_id: convId, p_count: sentCount }).then(
      () => {},
      () => {},
    )
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!(await isCronCall(req))) return new Response('unauthorized', { status: 401 })

  const { data, error } = await admin.rpc('dispatch_scheduled_replies', { p_limit: 40 })
  if (error) {
    await logEvent('error', 'assistant-dispatch', `réservation impossible: ${error.message}`)
    return json(req, { error: 'reserve_failed' }, 500)
  }
  const due = (data ?? []) as DueConversation[]
  const queue = [...due]
  const workers = Array.from({ length: Math.min(8, queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift()!
      try {
        await handleConversation(item)
      } catch (e) {
        await logEvent('error', 'assistant-dispatch', `conv=${item.id} échec inattendu: ${String(e).slice(0, 300)}`, {
          conversation_id: item.id,
        })
        await stopWith(item.id, 'dispatch_error', 'Erreur interne pendant la génération de la réponse.')
      }
    }
  })
  await Promise.all(workers)
  return json(req, { dispatched: due.length })
})
