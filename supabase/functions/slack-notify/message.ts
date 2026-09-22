// Aucun import : testé sous Vitest. Slack lit le texte en mrkdwn, donc tout ce qui vient du
// prospect passe par escape : un « < » laissé tel quel ouvre un lien et avale la suite.

export type SlackBooking = {
  conversation_id: number | null
  invitee_name: string | null
  invitee_email: string | null
  event_start_at: string | null
  raw_payload: Record<string, unknown> | null
}

export type SlackConversation = {
  provider: string | null
  contact_name: string | null
  contact_handle: string | null
  summary: string | null
}

const SITE = 'https://leadcontrol.fr'

// Envoyé à la connexion et par « Envoyer un message d'essai » : sans lui, rien n'arrive dans le
// canal avant le premier appel réservé, et le client croit que la connexion a échoué.
export const SLACK_HELLO =
  'LeadControl est relié à ce canal. Un message arrivera ici à chaque appel réservé, avec le prospect, la date, ses coordonnées et le résumé de la conversation.'

// Slack répond « no_service » quand le client a retiré l'application : le compte est clos.
export function slackGone(status: number, detail: string) {
  return status === 404 || detail.includes('no_service') || detail.includes('no_team')
}

function escape(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function momentLabel(iso: string | null, tz: string) {
  const ms = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(ms)) return 'date inconnue'
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

function whoOf(booking: SlackBooking, conv: SlackConversation | null) {
  const handle = text(conv?.contact_handle).replace(/^@/, '')
  const name = text(booking.invitee_name) || text(conv?.contact_name)
  const tag = !handle
    ? ''
    : conv?.provider === 'instagram' && /^[\w.]+$/.test(handle)
      ? `<https://www.instagram.com/${handle}/|@${handle}>`
      : `@${escape(handle)}`
  const sameAsHandle = name.replace(/^@/, '').toLowerCase() === handle.toLowerCase()
  if (name && tag && !sameAsHandle) return `*${escape(name)}* (${tag})`
  if (tag) return tag
  return name ? `*${escape(name)}*` : 'un prospect'
}

// L'assistant range ce qu'il a demandé dans answers. Quand le prospect réserve lui-même par le
// lien, Calendly envoie son formulaire dans payload.questions_and_answers.
function answersOf(raw: Record<string, unknown> | null) {
  const out: [string, string][] = []
  const own = raw?.answers
  if (Array.isArray(own)) {
    for (const a of own as { label?: unknown; value?: unknown }[]) {
      if (text(a?.label) && text(a?.value)) out.push([text(a.label), text(a.value)])
    }
  }
  const form = (raw?.payload as Record<string, unknown> | undefined)?.questions_and_answers
  if (Array.isArray(form)) {
    for (const a of form as { question?: unknown; answer?: unknown }[]) {
      if (text(a?.question) && text(a?.answer)) out.push([text(a.question), text(a.answer)])
    }
  }
  return out
}

// Calendly : numéro donné pour les rappels SMS. iClose : forme du webhook non confirmée.
function phoneOf(raw: Record<string, unknown> | null) {
  const calendly = raw?.payload as Record<string, unknown> | undefined
  const invitee = raw?.invitee as Record<string, unknown> | undefined
  return (
    text(calendly?.text_reminder_number) ||
    text(invitee?.phone) ||
    text(invitee?.phoneNumber) ||
    text(invitee?.phone_number)
  )
}

export function slackBookingText(booking: SlackBooking, conv: SlackConversation | null, tz: string) {
  const out = [`Appel réservé avec ${whoOf(booking, conv)}`, `Quand : ${momentLabel(booking.event_start_at, tz)}`]

  const phone = phoneOf(booking.raw_payload)
  if (phone) out.push(`Téléphone : ${escape(phone)}`)
  if (text(booking.invitee_email)) out.push(`E-mail : ${escape(text(booking.invitee_email))}`)
  for (const [label, value] of answersOf(booking.raw_payload)) out.push(`${escape(label)} : ${escape(value)}`)

  const summary = text(conv?.summary)
  if (summary) {
    out.push('')
    for (const line of summary.split('\n')) if (line.trim()) out.push(`> ${escape(line.trim())}`)
  }
  if (booking.conversation_id) {
    out.push('')
    out.push(`<${SITE}/app/inbox?c=${booking.conversation_id}|Ouvrir la conversation>`)
  }
  return out.join('\n')
}
