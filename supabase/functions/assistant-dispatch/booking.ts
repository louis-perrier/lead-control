// Aiguillage entre les deux façons de réserver. Calendly d'abord, l'agenda Google ensuite.
// Aucun fournisseur actif, ou page Calendly que l'assistant ne peut pas remplir : `link` porte
// le lien de réservation à envoyer, et la conversation reprend le comportement d'origine.
import { FAILURE_MESSAGES as AGENDA_MESSAGES, agendaEnabled, prepareAgendaTurn, type AgendaFailure, type AgendaTurn } from './agenda.ts'
import {
  CALENDLY_FAILURE_MESSAGES,
  calendlyBookingEnabled,
  prepareCalendlyTurn,
  type CalendlyFailure,
  type CalendlyTurn,
} from './calendly-booking.ts'

export type BookingTurn = AgendaTurn | CalendlyTurn
export type BookingFailure = AgendaFailure | CalendlyFailure

export const FAILURE_MESSAGES: Record<BookingFailure, string> = { ...AGENDA_MESSAGES, ...CALENDLY_FAILURE_MESSAGES }

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
  if (await agendaEnabled(opts.userId, opts.settings)) {
    return { turn: await prepareAgendaTurn(opts), link: '' }
  }
  return { turn: null, link: '' }
}
