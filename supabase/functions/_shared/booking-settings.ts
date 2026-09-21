// Vocabulaire commun aux réglages de réservation, quel que soit l'outil relié. Aucun import :
// la page Assistant lit ce fichier directement.

// offer_style : 'range' propose une fourchette d'heures, 'slot' propose des heures exactes.
export type OfferStyle = 'range' | 'slot'

// Informations que l'assistant demande avant de réserver, en plus de l'e-mail que les deux outils
// exigent. Chacune coûte un tour de conversation, d'où le plafond.
export type BookingFieldKind = 'phone' | 'text'
export type BookingField = { label: string; kind: BookingFieldKind }

export const MAX_EXTRA_FIELDS = 3

// Motifs d'arrêt qui veulent dire « un appel est réservé », quel que soit l'outil.
export const BOOKED_REASONS = ['calendly_booked', 'calendar_booked', 'iclose_booked']

export const RANGE_HOUR_OPTIONS = [1, 2, 3, 4]

// Délai minimum avant un rendez-vous, en heures. L'outil de réservation a déjà le sien : celui-ci
// s'y ajoute et ne peut que l'allonger, d'où le 0 qui veut dire « celui de l'outil suffit ».
export const BOOKING_NOTICE_OPTIONS = [0, 2, 4, 12, 24, 36, 48]

export function noticeHours(value: unknown) {
  const n = Math.round(Number(value))
  return BOOKING_NOTICE_OPTIONS.includes(n) ? n : 0
}

export const OFFER_STYLES: { value: OfferStyle; label: string }[] = [
  { value: 'range', label: 'Des plages horaires' },
  { value: 'slot', label: 'Des créneaux précis' },
]

export const FIELD_KINDS: { value: BookingFieldKind; label: string }[] = [
  { value: 'phone', label: 'Numéro de téléphone' },
  { value: 'text', label: 'Réponse libre' },
]

// Nom proposé quand on choisit le type : sans lui, un champ enregistré sans nom était accepté par
// l'écran puis écarté à la lecture, et l'assistant ne demandait rien.
export const KIND_DEFAULT_LABEL: Record<BookingFieldKind, string> = {
  phone: 'Numéro de téléphone',
  text: '',
}

export function hasUnnamedField(fields: BookingField[]) {
  return fields.some((f) => !f.label.trim())
}

// L'e-mail est déjà demandé à chaque réservation. Un champ « Email » en plus le faisait demander
// deux fois, avec un tour de conversation perdu pendant que le créneau n'est pas encore pris.
export function isEmailField(f: BookingField) {
  const label = f.label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return f.kind === 'text' && /(^|[^a-z])(e-?mail|mail|courriel)([^a-z]|$)/.test(label)
}

export function hasEmailField(fields: BookingField[]) {
  return fields.some(isEmailField)
}

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
    const kind: BookingFieldKind = f?.kind === 'phone' ? 'phone' : 'text'
    if (isEmailField({ label, kind })) continue
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
