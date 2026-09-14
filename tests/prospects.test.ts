import { describe, expect, it } from 'vitest'
import { nextAction, prospectStage } from '@/lib/prospects'

const now = Date.parse('2026-09-14T12:00:00Z')
const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString()

const base = {
  outcome: null,
  automation_reason: null,
  heat_tag: 'unknown' as const,
  inbound_count: 1,
  agent_sent_count: 0,
  human_sent_count: 0,
  automation_state: 'idle' as const,
  last_message_at: hoursAgo(2),
  last_customer_message_at: hoursAgo(2),
  metadata: null,
}

describe('prospectStage', () => {
  it('suit le parcours du prospect', () => {
    expect(prospectStage(base, false)).toBe('new')
    expect(prospectStage({ ...base, agent_sent_count: 1 }, false)).toBe('talking')
    expect(prospectStage({ ...base, heat_tag: 'warm' }, false)).toBe('qualified')
    expect(prospectStage({ ...base, heat_tag: 'cold' }, false)).toBe('unqualified')
    expect(prospectStage({ ...base, heat_tag: 'hot' }, true)).toBe('booked')
    expect(prospectStage({ ...base, automation_reason: 'calendly_booked' }, false)).toBe('booked')
  })

  it('fait primer l’issue de la clôture', () => {
    expect(prospectStage({ ...base, outcome: 'won' }, true)).toBe('won')
    expect(prospectStage({ ...base, outcome: 'lost', heat_tag: 'hot' }, false)).toBe('lost')
  })
})

describe('nextAction', () => {
  const opts = { followupAt: null, humanAgent: false, now }

  it('signale ce qui demande le coach', () => {
    expect(nextAction({ ...base, automation_state: 'error' }, opts)).toEqual({ key: 'error', needsCoach: true })
    expect(nextAction({ ...base, automation_state: 'stopped', automation_reason: 'human_takeover' }, opts)?.key).toBe('awaiting_reply')
  })

  it('montre la relance prévue et l’assistant au travail', () => {
    expect(nextAction(base, { ...opts, followupAt: hoursAgo(-3) })?.key).toBe('followup_planned')
    expect(nextAction({ ...base, automation_state: 'scheduled' }, opts)?.key).toBe('assistant_replying')
    expect(nextAction({ ...base, automation_state: 'scheduled', automation_reason: 'human_active' }, opts)?.key).toBe('awaiting_reply')
    expect(nextAction({ ...base, automation_state: 'condition_stop' }, opts)?.key).toBe('goal_reached')
  })

  it('ne propose la relance à la main qu’avec Human Agent', () => {
    const silent = { ...base, last_customer_message_at: hoursAgo(40), last_message_at: hoursAgo(39) }
    expect(nextAction(silent, opts)).toBeNull()
    expect(nextAction(silent, { ...opts, humanAgent: true })?.key).toBe('manual_followup')
  })

  it('ne dit rien d’une conversation clôturée ou importée', () => {
    expect(nextAction({ ...base, outcome: 'won', automation_state: 'error' }, opts)).toBeNull()
    expect(nextAction({ ...base, automation_state: 'stopped', automation_reason: 'imported_history' }, opts)).toBeNull()
  })
})
