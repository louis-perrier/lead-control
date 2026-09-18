// Lecture d'un type d'événement Calendly : ce que l'agent peut réserver seul, et ce qui l'oblige
// à repasser par le lien. Module pur, testé sous Vitest.

// Lieux où Calendly remplit tout : l'agent n'a rien à demander au prospect.
const READY_KINDS = new Set([
  'google_conference',
  'zoom_conference',
  'microsoft_teams_conference',
  'gotomeeting_conference',
  'webex_conference',
  'inbound_call',
])

// Lieux qui ont besoin d'une valeur reprise du type d'événement.
const FIXED_KINDS = new Set(['physical', 'custom'])

// Questions auxquelles l'assistant peut répondre en reprenant les mots du prospect. Une question
// à choix ne se devine pas : elle continue de renvoyer au lien.
const ASKABLE_QUESTIONS = new Set(['string', 'text', 'phone_number'])

const KIND_LABELS: Record<string, string> = {
  google_conference: 'visio Google Meet',
  zoom_conference: 'visio Zoom',
  microsoft_teams_conference: 'visio Microsoft Teams',
  gotomeeting_conference: 'visio GoToMeeting',
  webex_conference: 'visio Webex',
  inbound_call: 'appel entrant, le prospect vous appelle',
  physical: 'sur place',
  custom: 'lieu personnalisé',
  ask_invitee: 'lieu choisi par le prospect',
  outbound_call: 'appel sortant, vous appelez le prospect',
}

export type InviteeLocation = { kind: string; location?: string }

// Question du formulaire Calendly. `position` est ce que la réservation attend en retour.
export type EventQuestion = { name: string; type: string; position: number; required: boolean; askable: boolean }

export type EventTypeInfo = {
  uri: string
  name: string
  durationMin: number
  schedulingUrl: string
  active: boolean
  locationKind: string | null
  locationLabel: string
  isVideo: boolean
  location: InviteeLocation | null
  questions: EventQuestion[]
  requiredQuestions: string[]
  bookable: boolean
  blockers: string[]
}

type RawLocation = { kind?: unknown; location?: unknown }
type RawQuestion = { name?: unknown; type?: unknown; position?: unknown; enabled?: unknown; required?: unknown }

export type RawEventType = {
  uri?: unknown
  name?: unknown
  duration?: unknown
  scheduling_url?: unknown
  active?: unknown
  kind?: unknown
  type?: unknown
  pooling_type?: unknown
  locations?: unknown
  custom_questions?: unknown
}

function str(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function locationLabel(kind: string | null) {
  if (!kind) return 'lieu non défini'
  return KIND_LABELS[kind] ?? kind
}

export function describeEventType(raw: RawEventType): EventTypeInfo {
  const locations = Array.isArray(raw.locations) ? (raw.locations as RawLocation[]) : []
  const kinds = locations.map((l) => str(l.kind)).filter(Boolean)
  const kind = kinds.length === 1 ? kinds[0] : null
  const first = locations[0]

  const rawQuestions = Array.isArray(raw.custom_questions) ? (raw.custom_questions as RawQuestion[]) : []
  const questions: EventQuestion[] = rawQuestions
    .filter((q) => q.enabled !== false && str(q.name).trim())
    .map((q, i) => ({
      name: str(q.name).trim(),
      type: str(q.type),
      position: Number.isFinite(Number(q.position)) ? Number(q.position) : i,
      required: q.required === true,
      askable: ASKABLE_QUESTIONS.has(str(q.type)),
    }))
  const requiredQuestions = questions.filter((q) => q.required).map((q) => q.name)
  const unanswerable = questions.filter((q) => q.required && !q.askable).map((q) => q.name)

  const blockers: string[] = []
  if (raw.active === false) blockers.push('cette page de réservation est désactivée dans Calendly')
  if (str(raw.pooling_type)) blockers.push('les pages à plusieurs hôtes ne sont pas prises en charge')
  if (kinds.length > 1) blockers.push('cette page laisse le prospect choisir entre plusieurs lieux')
  if (kind && !READY_KINDS.has(kind) && !FIXED_KINDS.has(kind)) blockers.push(locationLabel(kind))
  if (!kind && kinds.length <= 1) blockers.push('aucun lieu défini sur cette page')
  if (kind && FIXED_KINDS.has(kind) && !str(first?.location).trim()) blockers.push('le lieu de cette page est vide')
  if (unanswerable.length > 0) blockers.push(`question à choix obligatoire : ${unanswerable.join(', ')}`)

  let location: InviteeLocation | null = null
  if (kind && READY_KINDS.has(kind)) location = { kind }
  else if (kind && FIXED_KINDS.has(kind)) location = { kind, location: str(first?.location) }

  return {
    uri: str(raw.uri),
    name: str(raw.name) || 'Sans titre',
    durationMin: Number(raw.duration) || 30,
    schedulingUrl: str(raw.scheduling_url),
    active: raw.active !== false,
    locationKind: kind,
    locationLabel: locationLabel(kind),
    isVideo: Boolean(kind && kind.endsWith('_conference')),
    location,
    questions,
    requiredQuestions,
    bookable: blockers.length === 0,
    blockers,
  }
}
