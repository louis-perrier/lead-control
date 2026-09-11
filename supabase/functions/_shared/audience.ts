type AudienceSettings = { audience?: { mode?: string; handles?: string[] } }

// Le filtre doit être revérifié au moment d'envoyer : la planification peut venir du
// webhook, de la transcription d'un vocal ou d'une reprise, et chaque chemin l'oubliait.
export function audienceBlocks(settings: Record<string, unknown> | null, handle: string | null) {
  const audience = (settings as AudienceSettings | null)?.audience
  if (!audience) return false
  const mode = audience.mode
  if (mode !== 'blocklist' && mode !== 'allowlist') return false
  const handles = (audience.handles ?? []).map((h) => h.replace(/^@/, '').trim().toLowerCase())
  const h = (handle ?? '').replace(/^@/, '').trim().toLowerCase()
  // Un compte encore inconnu ne peut pas être reconnu dans une liste blanche : on préfère
  // ne pas répondre plutôt que d'écrire à quelqu'un que le coach avait exclu.
  if (!h) return mode === 'allowlist'
  if (mode === 'blocklist') return handles.includes(h)
  return !handles.includes(h)
}
