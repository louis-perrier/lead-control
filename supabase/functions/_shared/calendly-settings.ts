// Réglages du mode Calendly. Aucun import : la page Assistant lit ce fichier directement.
// Durée, jours, heures, délai minimum et horizon restent chez Calendly, pas ici.

export type CalendlySettings = {
  event_type_uri: string
  event_type_name: string
  scheduling_url: string
  duration_min: number
  range_hours: number
  first_offer: number
  extra_offers: number
}

export const CALENDLY_DEFAULTS: CalendlySettings = {
  event_type_uri: '',
  event_type_name: '',
  scheduling_url: '',
  duration_min: 30,
  range_hours: 3,
  first_offer: 2,
  extra_offers: 1,
}

export const CALENDLY_RANGE_OPTIONS = [1, 2, 3, 4]

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
  }
}
