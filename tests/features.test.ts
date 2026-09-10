import { describe, expect, it } from 'vitest'
import { hasFeature, isStaff, canAdminister } from '@/lib/features'
import type { FeatureFlag, Profile } from '@/lib/types'

const flags: FeatureFlag[] = [
  { key: 'open', label: '', description: null, stage: 'all', notes: null },
  { key: 'beta_only', label: '', description: null, stage: 'beta', notes: null },
  { key: 'staff_only', label: '', description: null, stage: 'staff', notes: null },
  { key: 'off', label: '', description: null, stage: 'hidden', notes: null },
]

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: 'u1',
    email: 'u@example.com',
    full_name: null,
    role: 'user',
    plan_override: null,
    plan_override_since: null,
    timezone: 'Europe/Paris',
    city: null,
    company_name: null,
    company_size: null,
    onboarding_completed_at: null,
    credits_consumed_in_period: 0,
    created_at: '2026-01-01',
    ...overrides,
  }
}

describe('hasFeature', () => {
  it('ouvre les drapeaux all à tout le monde', () => {
    expect(hasFeature('open', flags, profile())).toBe(true)
  })

  it('cache les drapeaux hidden même au staff', () => {
    expect(hasFeature('off', flags, profile({ role: 'owner' }))).toBe(false)
  })

  it('réserve staff au staff', () => {
    expect(hasFeature('staff_only', flags, profile())).toBe(false)
    expect(hasFeature('staff_only', flags, profile({ role: 'viewer' }))).toBe(true)
  })

  it('ouvre beta aux bêta-testeurs et au staff', () => {
    expect(hasFeature('beta_only', flags, profile())).toBe(false)
    expect(hasFeature('beta_only', flags, profile({ plan_override: 'beta_byok' }))).toBe(true)
    expect(hasFeature('beta_only', flags, profile({ role: 'admin' }))).toBe(true)
  })

  it("l'override utilisateur prime sur le stage", () => {
    expect(hasFeature('off', flags, profile(), [{ key: 'off', enabled: true }])).toBe(true)
    expect(hasFeature('open', flags, profile(), [{ key: 'open', enabled: false }])).toBe(false)
  })

  it('refuse un drapeau inconnu', () => {
    expect(hasFeature('inconnu', flags, profile({ role: 'owner' }))).toBe(false)
  })
})

describe('rôles', () => {
  it('distingue staff et administration', () => {
    expect(isStaff(profile({ role: 'viewer' }))).toBe(true)
    expect(canAdminister(profile({ role: 'viewer' }))).toBe(false)
    expect(canAdminister(profile({ role: 'admin' }))).toBe(true)
    expect(isStaff(profile())).toBe(false)
  })
})
