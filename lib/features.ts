import type { FeatureFlag, Profile } from './types'

export function isStaff(profile: Pick<Profile, 'role'> | null | undefined) {
  return ['viewer', 'admin', 'owner'].includes(profile?.role ?? '')
}

export function canAdminister(profile: Pick<Profile, 'role'> | null | undefined) {
  return ['admin', 'owner'].includes(profile?.role ?? '')
}

export function hasFeature(
  key: string,
  flags: FeatureFlag[] | undefined,
  profile: Profile | null | undefined,
  overrides?: { key: string; enabled: boolean }[],
) {
  const override = overrides?.find((o) => o.key === key)
  if (override) return override.enabled
  const flag = flags?.find((f) => f.key === key)
  if (!flag) return false
  switch (flag.stage) {
    case 'all':
      return true
    case 'beta':
      return isStaff(profile) || profile?.plan_override === 'beta_byok'
    case 'staff':
      return isStaff(profile)
    default:
      return false
  }
}
