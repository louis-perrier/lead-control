// Aiguillage entre les façons de réserver. Calendly, iClose, puis l'agenda Google.
// Aucun fournisseur actif, ou page de réservation que l'assistant ne peut pas remplir : `link`
// porte le lien à envoyer, et la conversation reprend le comportement d'origine.
import { FAILURE_MESSAGES as AGENDA_MESSAGES, agendaEnabled, prepareAgendaTurn, type AgendaFailure, type AgendaTurn } from './agenda.ts'
import {
  CALENDLY_FAILURE_MESSAGES,
  calendlyBookingEnabled,
  prepareCalendlyTurn,
  type CalendlyFailure,
  type CalendlyTurn,
} from './calendly-booking.ts'
import {
  ICLOSE_FAILURE_MESSAGES,
  icloseBookingEnabled,
  prepareIcloseTurn,
  type IcloseFailure,
  type IcloseTurn,
} from './iclose-booking.ts'

export type BookingTurn = AgendaTurn | CalendlyTurn | IcloseTurn
export type BookingFailure = AgendaFailure | CalendlyFailure | IcloseFailure

export const FAILURE_MESSAGES: Record<BookingFailure, string> = {
  ...AGENDA_MESSAGES,
  ...CALENDLY_FAILURE_MESSAGES,
  ...ICLOSE_FAILURE_MESSAGES,
}

export type BookingOptions = {
  userId: string
  convId: number
  tz: string
  settings: Record<string, any>
  metadata: Record<string, unknown>
  contactName: string
  contactHandle: string | null
}

export async function prepareBooking(opts: BookingOptions): Promise<{ turn: BookingTurn | null; link: string }> {
  if (await calendlyBookingEnabled(opts.userId, opts.settings)) {
    const prep = await prepareCalendlyTurn(opts)
    return prep.ok ? { turn: prep.turn, link: '' } : { turn: null, link: prep.link }
  }
  if (await icloseBookingEnabled(opts.userId, opts.settings)) {
    const prep = await prepareIcloseTurn(opts)
    return prep.ok ? { turn: prep.turn, link: '' } : { turn: null, link: prep.link }
  }
  if (await agendaEnabled(opts.userId, opts.settings)) {
    return { turn: await prepareAgendaTurn(opts), link: '' }
  }
  return { turn: null, link: '' }
}
