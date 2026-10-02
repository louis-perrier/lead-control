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

// « Prénom - Nom », « Nom complet », « Full name », mais pas « Nombre d'abonnés ».
const NAME_LABEL = /(^|[^\p{L}])(pr[ée])?noms?($|[^\p{L}])|name/iu

export function asksName(labels: string[]) {
  return labels.some((l) => NAME_LABEL.test(l))
}

function clean(text: string | null | undefined) {
  return (text ?? '').replace(/[\s«»]+/g, ' ').trim().slice(0, 60)
}

export type ProspectProfile = { followers?: number | null; name?: string | null; handle?: string | null }

// `name` et `handle` ne sont passés que si un prénom ou un nom est demandé avant la réservation.
export function profileNote(p: ProspectProfile) {
  const lines: string[] = []
  if (typeof p.followers === 'number' && Number.isFinite(p.followers) && p.followers >= 0) {
    lines.push(
      `Profil Instagram du prospect : ${followerLabel(p.followers)} abonnés. Ce chiffre ne dit ni s'il crée du contenu, ` +
        "ni sur quoi : ne l'affirme jamais, pose la question si ça compte. N'en parle que si ça sert la conversation, " +
        'sous cette forme arrondie, et ne demande jamais la permission de regarder son profil.',
    )
  }
  const name = clean(p.name)
  const handle = clean(p.handle)
  if (name || handle) {
    const shown = [name && `nom affiché « ${name} »`, handle && `pseudo « ${handle} »`].filter(Boolean).join(', ')
    lines.push(
      `Sur son Instagram : ${shown}. Si tu y lis un vrai prénom ou un vrai nom, ne le redemande pas : suppose-le, sans ` +
        "jamais dire où tu l'as lu ni parler de son profil, sur le modèle « ton prénom c'est … j'imagine ? » ou « je suppose " +
        "que ton prénom c'est bien …, c'est ça ? ». Fais-le dans le même message que tes autres demandes, et demande dans ce " +
        "même message ce que son Instagram ne donne pas, son nom de famille s'il n'y est pas. " +
        "S'il ne le corrige pas, c'est sa réponse : passe-le tel quel à la réservation. Ne dis jamais que tu ne peux pas voir son profil.",
    )
  }
  return lines.join('\n')
}

// Inséré dans les entrées du prompt, comme le déroulé de découverte. Les « / » marquent les bulles.
export const CONTENT_FLOW =
  "- **contenu du prospect** : quand tu as besoin de savoir s'il crée du contenu, ou sur quoi, ne le demande pas " +
  "sèchement et ne parle jamais de regarder son profil. Amène-le à en parler lui-même avec ce déroulé, un temps par " +
  "message, en restant au plus près de ces formulations : adapte un mot au ton ou à la situation quand il le faut, et la " +
  "réaction du début à ce qu'il vient de dire. Une barre « / » sépare deux bulles : mets une ligne vide à sa place.\n" +
  "  1. « Toi côté contenu t'en es où ? / tu postes déjà régulièrement, de temps en temps ou tu te lances ? »\n" +
  "  2. S'il poste : « Ok top et ça donne quoi comme résultats pour toi en ce moment ? »\n" +
  "  3. « Ok je vois / À la limite, je veux bien que tu m'expliques un peu plus en détail ton contenu / tu parles de quoi " +
  "dans tes posts, dans quel but ? J'préfère que ça vienne de toi, ça m'aide à bien cerner où t'en es »\n" +
  "  Saute ce que tu sais déjà : s'il a dit qu'il poste, ou si la conversation le montre, commence au 2 ; s'il ne poste " +
  "pas, ne pose ni le 2 ni le 3. Les trois options de la première question et les trois bulles du 3 sont permises ici."
