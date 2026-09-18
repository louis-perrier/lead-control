// Réglages du mode Calendly. Aucun import : la page Assistant lit ce fichier directement.
// Durée, jours, heures, délai minimum et horizon restent chez Calendly, pas ici.

// offer_style : 'range' propose une fourchette d'heures, 'slot' propose des heures exactes.
export type OfferStyle = 'range' | 'slot'

// Informations que l'assistant demande avant de réserver, en plus de l'e-mail que Calendly exige.
// Chacune coûte un tour de conversation, d'où le plafond.
export type BookingFieldKind = 'phone' | 'email' | 'text'
export type BookingField = { label: string; kind: BookingFieldKind }

export const MAX_EXTRA_FIELDS = 3

export const FIELD_KINDS: { value: BookingFieldKind; label: string }[] = [
  { value: 'text', label: 'Texte libre' },
  { value: 'phone', label: 'Numéro de téléphone' },
  { value: 'email', label: 'Adresse e-mail' },
]

export type CalendlySettings = {
  event_type_uri: string
  event_type_name: string
  scheduling_url: string
  duration_min: number
  range_hours: number
  first_offer: number
  extra_offers: number
  offer_style: OfferStyle
  extra_fields: BookingField[]
}

export const CALENDLY_DEFAULTS: CalendlySettings = {
  event_type_uri: '',
  event_type_name: '',
  scheduling_url: '',
  duration_min: 30,
  range_hours: 3,
  first_offer: 2,
  extra_offers: 1,
  offer_style: 'range',
  extra_fields: [],
}

export const CALENDLY_RANGE_OPTIONS = [1, 2, 3, 4]

export const OFFER_STYLES: { value: OfferStyle; label: string }[] = [
  { value: 'range', label: 'Des plages horaires' },
  { value: 'slot', label: 'Des créneaux précis' },
]

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function fields(value: unknown): BookingField[] {
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

export function normalizeCalendly(raw: Partial<CalendlySettings> | null | undefined): CalendlySettings {
  const r = raw ?? {}
  return {
    event_type_uri: text(r.event_type_uri),
    event_type_name: text(r.event_type_name),
    scheduling_url: text(r.scheduling_url),
    duration_min: clampInt(r.duration_min, 5, 480, CALENDLY_DEFAULTS.duration_min),
    range_hours: clampInt(r.range_hours, 1, 4, CALENDLY_DEFAULTS.range_hours),
    first_offer: clampInt(r.first_offer, 0, 3, CALENDLY_DEFAULTS.first_offer),
    extra_offers: clampInt(r.extra_offers, 0, 2, CALENDLY_DEFAULTS.extra_offers),
    offer_style: r.offer_style === 'slot' ? 'slot' : 'range',
    extra_fields: fields(r.extra_fields),
  }
}
