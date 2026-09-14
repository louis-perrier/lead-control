// Cerveau de l'assistant : réserve les conversations dues, construit le contexte,
// appelle Anthropic (clé plateforme ou clé du bêta-testeur), envoie la réponse
// sur Instagram et consomme le crédit. Déclenché chaque minute par pg_cron.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'
import { getChannelToken, sendInstagramText, sendTypingOn } from '../_shared/instagram.ts'
import { planFollowups } from '../_shared/followups.ts'
import { AI_MODEL_REPLY, AI_MODEL_SUMMARY, generateText, recordUsage, resolveApiKey } from '../_shared/ai.ts'
import { buildSummaryPrompt, buildSystemPrompt } from './prompt.ts'
import { tryCannedResponse } from './canned.ts'
import { audienceBlocks } from '../_shared/audience.ts'
import { allocateBudget, cutAtBoundary } from '../_shared/context-budget.ts'
import { alreadyAnswered, humanActiveUntil, linkBase, parseDecision, stopConfirmed } from './decision.ts'
import { splitReply, typingPauses } from './bubbles.ts'
import { finalizeConversation } from './finalize.ts'
import { splitSystemForCache } from './system-blocks.ts'
import { resolveTone } from './types.ts'
import type { AgentDecision, WindowMessage } from './types.ts'

// La mémoire n8n d'origine gardait 100 messages par conversation : on aligne
// la fenêtre pour obtenir le même niveau de contexte.
const MIN_WINDOW = 20
const MAX_WINDOW = 100
// Le modèle réfléchit avant d'écrire et ce raisonnement consomme le même budget :
// à 1 024 tokens, un quart des réponses était coupé avant la fin du JSON.
const REPLY_MAX_TOKENS = 4096
const REPLY_RETRY_MAX_TOKENS = 8192

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
  const fields = 'id, direction, author_type, body_text, message_type, transcript, transcript_status, transcript_error, sent_at, send_state'
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

function speaker(m: WindowMessage) {
  return m.author_type === 'customer' ? 'PROSPECT' : m.author_type === 'human' ? 'OPÉRATEUR' : 'TOI'
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

// Comparaison sur l'id et non sur sent_at : l'horodatage vient de Meta et peut précéder
// l'arrivée du webhook, un message livré en retard passerait inaperçu.
async function customerWroteAfter(convId: number, lastSeenId: number) {
  const { data } = await admin
    .from('conversation_messages')
    .select('id')
    .eq('conversation_id', convId)
    .eq('author_type', 'customer')
    .gt('id', lastSeenId)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function stopLinkAlreadySent(convId: number, stopLink: string) {
  const base = linkBase(stopLink)
  if (!base) return false
  const { data } = await admin
    .from('conversation_messages')
    .select('id')
    .eq('conversation_id', convId)
    .eq('author_type', 'agent')
    .eq('send_state', 'sent')
    .ilike('body_text', `%${base}%`)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function hasActiveBooking(convId: number) {
  const { data } = await admin
    .from('bookings')
    .select('id')
    .eq('conversation_id', convId)
    .neq('status', 'canceled')
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function handleConversation(due: DueConversation) {
  const convId = due.id
  const convRes = await admin
    .from('conversations')
    .select('id, user_id, summary, contact_external_id, contact_handle, metadata, automation_state')
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

  // Dernier verrou du filtre d'audience : c'est le seul point par lequel passent toutes
  // les planifications, le webhook ne voyait pas celles créées après une transcription.
  if (audienceBlocks(assistant.settings, conv.contact_handle)) {
    await releaseLock(convId, {
      automation_state: 'idle',
      automation_reason: 'audience_blocked',
      next_reply_at: null,
      debounce_until: null,
    })
    return
  }

  let messages = await fetchWindow(convId, due.pending_cursor_at)
  const lastInbound = [...messages].reverse().find((m) => m.author_type === 'customer')
  if (lastInbound?.message_type === 'audio' && lastInbound.transcript_status === 'processing') {
    await retryLater(convId, 'audio_transcription_pending', 10_000)
    return
  }
  const lastSeenId = messages.reduce((max, m) => Math.max(max, m.id), 0)

  // Quelqu'un a répondu à la main pendant l'attente : rien à ajouter, aucun appel IA.
  if (alreadyAnswered(messages)) {
    await finalizeConversation(
      convId,
      {
        automation_state: 'idle',
        automation_reason: 'already_answered',
        next_reply_at: null,
        debounce_until: null,
        pending_cursor_at: null,
        pending_since: null,
        pending_inbound_count: 0,
      },
      {},
    )
    return
  }

  const lastHuman = await admin
    .from('conversation_messages')
    .select('sent_at')
    .eq('conversation_id', convId)
    .eq('author_type', 'human')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const waitForHuman = humanActiveUntil(lastHuman.data?.sent_at, Date.now())
  if (waitForHuman) {
    await releaseLock(convId, {
      automation_state: 'scheduled',
      automation_reason: 'human_active',
      next_reply_at: waitForHuman.toISOString(),
      debounce_until: waitForHuman.toISOString(),
    })
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

  const settings = (assistant.settings ?? {}) as Record<string, any>
  let metadata = (conv.metadata ?? {}) as Record<string, unknown>

  const canned = await tryCannedResponse({
    convId,
    userId: due.user_id,
    assistantId: assistant.id,
    settings,
    metadata,
    contactHandle: conv.contact_handle,
    lastCustomerText: lastInbound ? renderMessage(lastInbound) : '',
    recentLines: (() => {
      const at = lastInbound ? messages.lastIndexOf(lastInbound) : messages.length
      return messages.slice(Math.max(0, at - 6), at).map((m) => `${speaker(m)} : ${renderMessage(m)}`)
    })(),
    apiKey: resolved.key,
    keySource: resolved.source,
    token,
    igUserId,
    recipientId: conv.contact_external_id,
  })
  if (canned.sent && !canned.continueWithAgent) return
  const creditAlreadyConsumed = canned.sent
  if (canned.sent) {
    metadata = canned.metadata
    messages = await fetchWindow(convId, due.pending_cursor_at)
  }

  let context = settings.context ?? ''
  const { data: docs } = await admin
    .from('context_documents')
    .select('title, extracted_text')
    .eq('user_id', due.user_id)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
  if (docs && docs.length > 0) {
    const texts = docs.map((d) => d.extracted_text ?? '')
    const caps = allocateBudget(texts.map((t) => t.length))
    const parts = docs
      .map((d, i) => ({ title: d.title, text: cutAtBoundary(texts[i], caps[i]) }))
      .filter((d) => d.text)
      .map((d) => `### ${d.title}\n${d.text}`)
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
    secondaryLinks: (settings.stop_condition?.secondary_links ?? []).map((l) => ({
      condition: l.condition ?? '',
      link: l.link ?? '',
    })),
    tone: resolveTone(settings.tone?.preset, assistant.custom_tone),
    summary,
  })
  const transcriptLines = messages.map((m) => `${speaker(m)} : ${renderMessage(m)}`)
  const prompt = `Conversation (du plus ancien au plus récent) :\n${transcriptLines.join('\n')}\n\nRéponds au dernier message du prospect en respectant le format de sortie JSON.`

  const systemBlocks = splitSystemForCache(system)
  const automationStart = new Date().toISOString()
  let decision: AgentDecision
  let unreadable = false
  try {
    const first = await generateText({
      apiKey: resolved.key,
      model: AI_MODEL_REPLY,
      system: systemBlocks,
      prompt,
      maxTokens: REPLY_MAX_TOKENS,
    })
    await recordUsage({ userId: due.user_id, conversationId: convId, model: AI_MODEL_REPLY, usage: first.usage, source: resolved.source })
    let parsed = parseDecision(first.text)
    if (!parsed.readable || first.stopReason === 'max_tokens') {
      await logEvent('warn', 'assistant-dispatch', `sortie illisible conv=${convId} (${first.stopReason}), nouvel essai : ${first.text.slice(0, 300)}`, {
        user_id: due.user_id,
        conversation_id: convId,
      })
      const retry = await generateText({
        apiKey: resolved.key,
        model: AI_MODEL_REPLY,
        system: systemBlocks,
        prompt,
        maxTokens: REPLY_RETRY_MAX_TOKENS,
      })
      await recordUsage({ userId: due.user_id, conversationId: convId, model: AI_MODEL_REPLY, usage: retry.usage, source: resolved.source })
      const retried = parseDecision(retry.text)
      // La seconde sortie ne remplace la première que si elle apporte mieux : un JSON
      // complet, ou au moins une réponse là où la première n'en avait pas.
      if (retried.readable || (!parsed.decision.reply_text && retried.decision.reply_text)) parsed = retried
      if (!retried.readable) {
        await logEvent('error', 'assistant-dispatch', `sortie toujours illisible conv=${convId} (${retry.stopReason}) : ${retry.text.slice(0, 300)}`, {
          user_id: due.user_id,
          conversation_id: convId,
        })
      }
    }
    decision = parsed.decision
    unreadable = !parsed.readable && !decision.reply_text
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

    const retries = Number(metadata.dispatch_retries ?? 0) + 1
    if (retries < 3) {
      await admin.from('conversations').update({ metadata: { ...metadata, dispatch_retries: retries } }).eq('id', convId)
      await retryLater(convId, `ai_retry_${retries}`, 15_000)
    } else if (resolved.source === 'platform') {
      // Jamais de détail technique montré à un client de base pour un souci côté
      // plateforme : on retente en silence, seuls les admins voient l'échec loggé.
      await admin.from('conversations').update({ metadata: { ...metadata, dispatch_retries: 0 } }).eq('id', convId)
      await retryLater(convId, 'platform_ai_error', 15 * 60 * 1000)
    } else {
      await stopWith(convId, 'ai_error', "Un problème technique empêche l'assistant de répondre pour le moment. Nous nous en occupons.")
    }
    return
  }

  // Une sortie illisible ne dit rien du prospect : on garde la température et le résumé connus.
  const profilePatch = {
    heat_tag: decision.heat_tag ?? undefined,
    heat_reason: decision.heat_tag ? decision.heat_reason || null : undefined,
    summary: decision.summary?.trim() ? decision.summary : summary || undefined,
  }

  if (decision.should_notify_human) {
    await finalizeConversation(
      convId,
      {
        automation_state: 'error',
        automation_reason: 'notify_human',
        next_reply_at: null,
        debounce_until: null,
        pending_cursor_at: null,
        pending_since: null,
        pending_inbound_count: 0,
        last_error_code: unreadable ? 'model_output_unreadable' : 'notify_human',
        last_error_message: decision.reason || 'L’assistant demande une intervention humaine sur cette conversation.',
      },
      { ...profilePatch, metadata },
    )
    return
  }

  // Le prompt ne laisse plus le choix de se taire : une réponse écrite part toujours, même si
  // should_response dit le contraire.
  const blocks = splitReply(decision.reply_text ?? '')
  if (blocks.length === 0 && !canned.sent) {
    await finalizeConversation(
      convId,
      {
        automation_state: 'error',
        automation_reason: 'notify_human',
        next_reply_at: null,
        debounce_until: null,
        pending_cursor_at: null,
        pending_since: null,
        pending_inbound_count: 0,
        last_error_code: 'no_reply',
        last_error_message: 'L’assistant n’a pas su répondre à ce message. Répondez-lui ou reprenez l’assistant.',
      },
      { ...profilePatch, metadata },
    )
    return
  }

  const pauses = typingPauses(blocks)
  let sentCount = 0
  let anchorMessageId: number | null = canned.messageId
  if (blocks.length > 0) {
    for (const [i, block] of blocks.entries()) {
      if (await customerWroteAfter(convId, lastSeenId)) break
      if (pauses[i] > 0) {
        await sendTypingOn(token, igUserId, conv.contact_external_id)
        await new Promise((r) => setTimeout(r, pauses[i]))
        if (await customerWroteAfter(convId, lastSeenId)) break
      }
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
        anchorMessageId = inserted.data!.id
        if (sentCount === 1 && !creditAlreadyConsumed) {
          await admin.rpc('consume_one_credit', { p_user_id: due.user_id })
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

  let stopReached = false
  if (decision.stop_successful) {
    const stopLink = settings.stop_condition?.link ?? ''
    const base = linkBase(stopLink)
    const linkSent = base ? blocks.slice(0, sentCount).some((b) => b.includes(base)) || (await stopLinkAlreadySent(convId, stopLink)) : false
    const hasBooking = base && !linkSent ? await hasActiveBooking(convId) : false
    stopReached = stopConfirmed({ stopSuccessful: true, stopLink, linkSent, hasBooking })
  }

  const now = new Date().toISOString()
  const replied = sentCount > 0 || canned.sent
  delete metadata.dispatch_retries
  await finalizeConversation(
    convId,
    {
      automation_state: stopReached ? 'condition_stop' : 'idle',
      automation_reason: stopReached
        ? 'stop_successful'
        : decision.stop_successful
          ? 'stop_unconfirmed'
          : replied
            ? 'replied'
            : 'no_reply_needed',
      next_reply_at: null,
      debounce_until: null,
      pending_cursor_at: null,
      pending_since: null,
      pending_inbound_count: 0,
      last_error_code: null,
      last_error_message: null,
    },
    {
      last_agent_reply_at: replied ? now : undefined,
      last_message_at: sentCount > 0 ? now : undefined,
      last_message_preview: sentCount > 0 ? blocks[sentCount - 1].slice(0, 140) : undefined,
      ...profilePatch,
      metadata,
    },
  )
  if (sentCount > 0) {
    await admin.rpc('bump_agent_sent', { p_conversation_id: convId, p_count: sentCount }).then(
      () => {},
      () => {},
    )
  }
  if (replied) {
    // Échouer ici ne doit pas remettre en cause une réponse déjà partie chez le prospect.
    try {
      await planFollowups({
        conversationId: convId,
        assistantId: assistant.id,
        anchorMessageId,
        assistantSettings: assistant.settings,
        contactHandle: conv.contact_handle,
      })
    } catch (e) {
      await logEvent('warn', 'assistant-dispatch', `relances non programmées conv=${convId}: ${String(e).slice(0, 200)}`, {
        user_id: due.user_id,
        conversation_id: convId,
      })
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!(await isCronCall(req))) return new Response('unauthorized', { status: 401 })

  const { data, error } = await admin.rpc('dispatch_scheduled_replies', { p_limit: 40 })
  if (error) {
    // Panne réseau ponctuelle côté base : le cron réessaie de lui-même à la minute suivante.
    await logEvent('warn', 'assistant-dispatch', `réservation impossible: ${error.message}`)
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
