import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assistedSuggestion,
  formatRemaining,
  humanAgentRemainingMs,
  manualSendMode,
  needsManualFollowup,
} from '../supabase/functions/_shared/messaging-window'

const now = Date.parse('2026-09-14T12:00:00Z')
const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString()

describe('manualSendMode', () => {
  it('laisse partir librement dans les 24 h', () => {
    expect(manualSendMode(hoursAgo(23), now, false)).toBe('standard')
  })

  it('passe par Human Agent entre 24 h et 7 jours seulement si le module est ouvert', () => {
    expect(manualSendMode(hoursAgo(30), now, true)).toBe('human_agent')
    expect(manualSendMode(hoursAgo(30), now, false)).toBe('expired')
  })

  it('ferme tout au-delà de 7 jours ou sans message du prospect', () => {
    expect(manualSendMode(hoursAgo(24 * 7 + 1), now, true)).toBe('closed')
    expect(manualSendMode(null, now, true)).toBe('closed')
  })

  it('donne le temps restant pour répondre à la main', () => {
    expect(formatRemaining(humanAgentRemainingMs(hoursAgo(42), now))).toBe('5 j 6 h')
    expect(formatRemaining(40 * 60000)).toBe('40 min')
  })
})

describe('needsManualFollowup', () => {
  const silent = {
    last_customer_message_at: hoursAgo(40),
    last_message_at: hoursAgo(39),
    heat_tag: 'warm',
    outcome: null,
    automation_state: 'idle',
  }

  it('retient un prospect silencieux depuis plus de 24 h après notre message', () => {
    expect(needsManualFollowup(silent, now)).toBe(true)
  })

  it('écarte quand le prospect a écrit en dernier, dans les 24 h ou au-delà de 7 jours', () => {
    expect(needsManualFollowup({ ...silent, last_message_at: hoursAgo(40) }, now)).toBe(false)
    expect(needsManualFollowup({ ...silent, last_customer_message_at: hoursAgo(10), last_message_at: hoursAgo(9) }, now)).toBe(false)
    expect(needsManualFollowup({ ...silent, last_customer_message_at: hoursAgo(200), last_message_at: hoursAgo(199) }, now)).toBe(false)
  })

  it('écarte les froids, les clôturés, les erreurs et ceux que le coach a écartés', () => {
    expect(needsManualFollowup({ ...silent, heat_tag: 'cold' }, now)).toBe(false)
    expect(needsManualFollowup({ ...silent, outcome: 'lost' }, now)).toBe(false)
    expect(needsManualFollowup({ ...silent, automation_state: 'error' }, now)).toBe(false)
    expect(needsManualFollowup({ ...silent, metadata: { assisted_dismissed_at: hoursAgo(1) } }, now)).toBe(false)
  })

  it('propose le message du jour le plus avancé déjà atteint', () => {
    const templates = [
      { id: 'j2', days: 2, text: 'Toujours partant ?' },
      { id: 'j5', days: 5, text: 'Je clôture de mon côté' },
    ]
    expect(assistedSuggestion(templates, hoursAgo(24 * 3), now)?.id).toBe('j2')
    expect(assistedSuggestion(templates, hoursAgo(24 * 5 + 1), now)?.id).toBe('j5')
    expect(assistedSuggestion(templates, hoursAgo(30), now)).toBeNull()
  })
})

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'billing-v1-rootowned' ? [] : sources(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

describe('tag HUMAN_AGENT', () => {
  it('n’est posé que par l’envoi manuel de la boîte de réception', () => {
    const users = sources('supabase/functions').filter((path) => /humanAgent:/.test(readFileSync(path, 'utf8')))
    expect(users.map((path) => path.replaceAll('\\', '/'))).toEqual(['supabase/functions/messages-send/index.ts'])
  })
})
