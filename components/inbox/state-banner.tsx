'use client'

import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'
import type { Conversation } from '@/lib/types'

// Traduit l'état machine de la conversation en langage clair pour le coach.
export function stateLabel(conv: Conversation): { text: string; tone: 'primary' | 'success' | 'warning' | 'danger' | 'muted' } {
  switch (conv.automation_state) {
    case 'scheduled':
      return conv.next_reply_at
        ? { text: `Réponse prévue à ${formatDateTime(conv.next_reply_at)}`, tone: 'primary' }
        : { text: 'Réponse en préparation', tone: 'primary' }
    case 'pending':
      return { text: 'L’assistant rédige sa réponse', tone: 'primary' }
    case 'stopped':
      return { text: 'En pause : vous avez la main', tone: 'warning' }
    case 'condition_stop':
      return { text: 'Objectif atteint', tone: 'success' }
    case 'error':
      return {
        text: conv.last_error_message ?? 'Erreur : intervention nécessaire',
        tone: 'danger',
      }
    default:
      return conv.outcome
        ? { text: conv.outcome === 'won' ? 'Clôturée : gagnée' : 'Clôturée : perdue', tone: 'muted' }
        : { text: 'L’assistant répond aux nouveaux messages', tone: 'muted' }
  }
}

export function StateBadge({ conv }: { conv: Conversation }) {
  const { text, tone } = stateLabel(conv)
  return <Badge tone={tone === 'muted' ? 'muted' : tone}>{text}</Badge>
}

export function HeatBadge({ conv }: { conv: Conversation }) {
  if (conv.heat_tag === 'hot') return <Badge tone="danger">Chaud</Badge>
  if (conv.heat_tag === 'warm') return <Badge tone="warning">Tiède</Badge>
  if (conv.heat_tag === 'cold') return <Badge tone="primary">Froid</Badge>
  return null
}
