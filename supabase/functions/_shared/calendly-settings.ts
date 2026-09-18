// Réglages du mode Calendly. Durée, jours, heures, délai minimum et horizon restent chez
// Calendly, pas ici. Le vocabulaire commun aux deux outils vit dans booking-settings.ts.
import {
  RANGE_HOUR_OPTIONS,
  clampInt,
  normalizeFields,
  offerStyle,
  text,
  type BookingField,
  type OfferStyle,
} from './booking-settings.ts'

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

export const CALENDLY_RANGE_OPTIONS = RANGE_HOUR_OPTIONS

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
    offer_style: offerStyle(r.offer_style),
    extra_fields: normalizeFields(r.extra_fields),
  }
}
