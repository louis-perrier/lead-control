// Aucun import : testé sous Vitest. Le chiffre exact n'atteint jamais le modèle, seul l'arrondi
// lui est donné, pour qu'il parle comme quelqu'un qui a jeté un œil au profil.

function compact(n: number, div: number, unit: string) {
  const v = n / div
  // Arrondi vers le bas : 12 600 donne 12K, jamais 13K.
  const shown = v < 10 ? Math.floor(v * 10) / 10 : Math.floor(v)
  return `${String(shown).replace('.', ',')}${unit}`
}

export function followerLabel(n: number) {
  if (n < 100) return 'moins de 100'
  if (n < 1000) {
    const h = Math.round(n / 100) * 100
    return h >= 1000 ? '1K' : `environ ${h}`
  }
  if (n < 1_000_000) return compact(n, 1000, 'K')
  return compact(n, 1_000_000, 'M')
}

export function profileNote(followers: number | null | undefined) {
  if (typeof followers !== 'number' || !Number.isFinite(followers) || followers < 0) return ''
  return (
    `Profil Instagram du prospect : ${followerLabel(followers)} abonnés. Ce chiffre ne dit ni s'il crée du contenu, ` +
    "ni sur quoi : ne l'affirme jamais, pose la question si ça compte. N'en parle que si ça sert la conversation, " +
    'sous cette forme arrondie, et ne demande jamais la permission de regarder son profil.'
  )
}
