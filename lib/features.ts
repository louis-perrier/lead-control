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

// Drapeaux posés à l'avance, qu'aucun écran ni aucune fonction ne lit encore. En retirer un
// d'ici le jour où son module est écrit, sinon il reste rangé avec les idées dans Admin.
const UNWIRED_FLAGS = ['crm', 'gmail', 'instagram_comments', 'scraping', 'voice_calls', 'voice_messages', 'whatsapp']

export function groupFlags(flags: FeatureFlag[]) {
  const ideas = flags.filter((f) => UNWIRED_FLAGS.includes(f.key) && f.stage === 'hidden')
  const open = flags.filter((f) => f.stage === 'all' && !ideas.includes(f))
  const building = flags.filter((f) => !ideas.includes(f) && !open.includes(f))
  return { building, open, ideas }
}
