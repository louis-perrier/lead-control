// Aucun import ici : le module est testé sous Vitest, hors du runtime Deno.

export type AgentDecision = {
  reply_text: string | null
  should_response: boolean
  stop_successful: boolean
  should_notify_human: boolean
  // null quand la sortie est illisible : la conversation garde sa valeur précédente.
  heat_tag: 'hot' | 'warm' | 'cold' | 'unknown' | null
  heat_reason: string
  summary: string | null
  reason: string | null
}

export type ParsedDecision = { decision: AgentDecision; readable: boolean }

// Les bulles sont séparées par une ligne vide dans reply_text : un saut de ligne brut rend le
// JSON invalide, on l'échappe donc à l'intérieur des chaînes seulement.
export function sanitizeJsonControlChars(raw: string) {
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

export function parseDecision(text: string): ParsedDecision {
  const cleaned = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  try {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('no_json')
    const parsed = JSON.parse(sanitizeJsonControlChars(cleaned.slice(start, end + 1)))
    return {
      readable: true,
      decision: {
        reply_text: typeof parsed.reply_text === 'string' ? parsed.reply_text : null,
        should_response: parsed.should_response !== false,
        stop_successful: parsed.stop_successful === true,
        should_notify_human: parsed.should_notify_human === true,
        heat_tag: ['hot', 'warm', 'cold', 'unknown'].includes(parsed.heat_tag) ? parsed.heat_tag : 'unknown',
        heat_reason: typeof parsed.heat_reason === 'string' ? parsed.heat_reason : '',
        summary: typeof parsed.summary === 'string' ? parsed.summary : null,
        reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      },
    }
  } catch {
    // JSON toujours invalide malgré la réparation : on tente d'extraire au moins
    // reply_text au lasso plutôt que d'abandonner.
    const match = cleaned.match(/"reply_text"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (match) {
      const extracted = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      return {
        readable: false,
        decision: {
          reply_text: extracted || null,
          should_response: Boolean(extracted),
          stop_successful: false,
          should_notify_human: false,
          heat_tag: null,
          heat_reason: '',
          summary: null,
          reason: null,
        },
      }
    }
    // Une sortie vide ou du JSON cassé n'est jamais envoyée au prospect.
    const looksLikeJson = /^\s*\{/.test(cleaned)
    const usableText = !looksLikeJson && cleaned ? cleaned : null
    return {
      readable: Boolean(usableText),
      decision: {
        reply_text: usableText,
        should_response: Boolean(usableText),
        stop_successful: false,
        should_notify_human: !usableText,
        heat_tag: null,
        heat_reason: '',
        summary: null,
        reason: usableText ? null : 'Réponse du modèle illisible : vérifiez le dernier message.',
      },
    }
  }
}

// Ordre d'insertion et non sent_at : l'horodatage Meta d'un message du prospect peut précéder
// celui d'une bulle déjà enregistrée, et ce message passerait pour déjà traité.
export function alreadyAnswered(messages: { id: number; author_type: string; send_state?: string | null }[]) {
  let lastCustomer = 0
  let lastOutgoing = 0
  for (const m of messages) {
    if (m.author_type === 'customer') lastCustomer = Math.max(lastCustomer, m.id)
    else if (m.send_state !== 'failed') lastOutgoing = Math.max(lastOutgoing, m.id)
  }
  return lastOutgoing > lastCustomer
}

export const HUMAN_ACTIVE_MS = 60 * 60 * 1000

// Un message écrit à la main il y a moins d'une heure : l'agent laisse la personne répondre.
export function humanActiveUntil(lastHumanSentAt: string | null | undefined, now: number) {
  if (!lastHumanSentAt) return null
  const until = Date.parse(lastHumanSentAt) + HUMAN_ACTIVE_MS
  return until > now ? new Date(until) : null
}

export function linkBase(link: string | null | undefined) {
  return (link ?? '').trim().split('?')[0].split('#')[0].replace(/\/+$/, '')
}

// « Objectif atteint » ferme la conversation à l'agent : on ne le croit que sur une
// preuve, sinon une condition d'arrêt à plusieurs branches coupe des prospects en cours.
export function stopConfirmed(opts: {
  stopSuccessful: boolean
  stopLink: string | null | undefined
  linkSent: boolean
  hasBooking: boolean
}) {
  if (!opts.stopSuccessful) return false
  if (!linkBase(opts.stopLink)) return true
  return opts.linkSent || opts.hasBooking
}

// Mode agenda : seule une réservation Google active fait foi, et la conversation ne se ferme
// qu'une fois la confirmation partie chez le prospect.
export function agendaStopReached(opts: { hasBooking: boolean; sentThisTurn: number; confirmedBefore: boolean }) {
  return opts.hasBooking && (opts.sentThisTurn > 0 || opts.confirmedBefore)
}
