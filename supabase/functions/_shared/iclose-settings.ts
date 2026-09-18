// Réglages du mode iClose. Durée, jours, heures, délai minimum, horizon et règles de
// disqualification restent chez iClose, pas ici.
import {
  clampInt,
  normalizeFields,
  noticeHours,
  offerStyle,
  text,
  type BookingField,
  type OfferStyle,
} from './booking-settings.ts'

export type IcloseSettings = {
  event_id: string
  link_prefix: string
  event_name: string
  booking_url: string
  duration_min: number
  range_hours: number
  first_offer: number
  extra_offers: number
  offer_style: OfferStyle
  notice_hours: number
  extra_fields: BookingField[]
}

export const ICLOSE_DEFAULTS: IcloseSettings = {
  event_id: '',
  link_prefix: '',
  event_name: '',
  booking_url: '',
  duration_min: 30,
  range_hours: 3,
  first_offer: 2,
  extra_offers: 1,
  offer_style: 'range',
  notice_hours: 0,
  extra_fields: [],
}


export function normalizeIclose(raw: Partial<IcloseSettings> | null | undefined): IcloseSettings {
  const r = raw ?? {}
  return {
    event_id: text(r.event_id),
    link_prefix: text(r.link_prefix),
    event_name: text(r.event_name),
    booking_url: text(r.booking_url),
    duration_min: clampInt(r.duration_min, 5, 480, ICLOSE_DEFAULTS.duration_min),
    range_hours: clampInt(r.range_hours, 1, 4, ICLOSE_DEFAULTS.range_hours),
    first_offer: clampInt(r.first_offer, 0, 3, ICLOSE_DEFAULTS.first_offer),
    extra_offers: clampInt(r.extra_offers, 0, 2, ICLOSE_DEFAULTS.extra_offers),
    offer_style: offerStyle(r.offer_style),
    notice_hours: noticeHours(r.notice_hours),
    extra_fields: normalizeFields(r.extra_fields),
  }
}
