// Vocabulaire commun aux réglages de réservation, quel que soit l'outil relié. Aucun import :
// la page Assistant lit ce fichier directement.

// offer_style : 'range' propose une fourchette d'heures, 'slot' propose des heures exactes.
export type OfferStyle = 'range' | 'slot'

// Informations que l'assistant demande avant de réserver, en plus de l'e-mail que les deux outils
// exigent. Chacune coûte un tour de conversation, d'où le plafond.
export type BookingFieldKind = 'phone' | 'email' | 'text'
export type BookingField = { label: string; kind: BookingFieldKind }

export const MAX_EXTRA_FIELDS = 3

// Motifs d'arrêt qui veulent dire « un appel est réservé », quel que soit l'outil.
export const BOOKED_REASONS = ['calendly_booked', 'calendar_booked', 'iclose_booked']

export const RANGE_HOUR_OPTIONS = [1, 2, 3, 4]

export const OFFER_STYLES: { value: OfferStyle; label: string }[] = [
  { value: 'range', label: 'Des plages horaires' },
  { value: 'slot', label: 'Des créneaux précis' },
]

export const FIELD_KINDS: { value: BookingFieldKind; label: string }[] = [
  { value: 'text', label: 'Texte libre' },
  { value: 'phone', label: 'Numéro de téléphone' },
  { value: 'email', label: 'Adresse e-mail' },
]

export function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

export function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function offerStyle(value: unknown): OfferStyle {
  return value === 'slot' ? 'slot' : 'range'
}

export function normalizeFields(value: unknown): BookingField[] {
  if (!Array.isArray(value)) return []
  const out: BookingField[] = []
  for (const raw of value) {
    const f = raw as Partial<BookingField>
    const label = text(f?.label).slice(0, 60)
    if (!label) continue
    const kind: BookingFieldKind = f?.kind === 'phone' || f?.kind === 'email' ? f.kind : 'text'
    if (out.some((o) => o.label.toLowerCase() === label.toLowerCase())) continue
    out.push({ label, kind })
    if (out.length >= MAX_EXTRA_FIELDS) break
  }
  return out
}

// Clé de la propriété portée par l'outil de réservation : posée par la place, pas par le libellé,
// pour qu'un libellé retouché ne change pas le schéma.
export function fieldKey(index: number) {
  return `champ${index + 1}`
}
