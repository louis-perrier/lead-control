// Quel outil de réservation la page Assistant montre. Un seul à la fois : l'outil ne se choisit
// pas dans une liste, il se choisit en le reliant, et les autres connexions disparaissent tant
// qu'un compte existe. Le mode enregistré garde le nom du fournisseur, c'est lui que lit le serveur.

export type BookingMode = 'link' | 'calendly' | 'iclose' | 'calendar'

export const BOOKING_TOOLS = ['calendly', 'iclose', 'calendar'] as const

export const TOOL_NAMES: Record<string, string> = {
  calendly: 'Calendly',
  iclose: 'iClose',
  calendar: 'Google Agenda',
}

export function bookingChoice(
  savedMode: string | null | undefined,
  allowed: BookingMode[],
  // null tant que les comptes n'ont pas chargé : on suit alors le réglage enregistré, sinon la
  // carte proposerait une connexion pendant une seconde à quelqu'un qui en a déjà une.
  connected: BookingMode[] | null,
  byAgentChoice: boolean | null,
  providerChoice: BookingMode | null,
) {
  const saved = allowed.find((t) => t === savedMode) ?? null
  const linked = connected ? allowed.filter((t) => connected.includes(t)) : saved ? [saved] : []
  const byAgent = allowed.length > 0 && (byAgentChoice ?? saved !== null)
  const provider: BookingMode =
    providerChoice && linked.includes(providerChoice)
      ? providerChoice
      : saved && linked.includes(saved)
        ? saved
        : linked[0] ?? saved ?? allowed[0] ?? 'calendly'
  return { linked, byAgent, provider, mode: byAgent ? provider : ('link' as BookingMode) }
}
