// Informations demandées au prospect avant la réservation : celles ajoutées dans LeadControl,
// plus les questions obligatoires de la page de réservation qu'aucune ne couvre déjà. Module pur,
// testé sous Vitest. Calendly repère ses questions par leur position, pas par leur nom.
import { fieldKey, type BookingField, type BookingFieldKind } from './calendly-settings.ts'
import type { EventQuestion } from './calendly-event-type.ts'

// Réponses au formulaire de la page : Calendly les repère par leur position.
export type QuestionAnswer = { question: string; answer: string; position: number }

export type Ask = {
  key: string
  label: string
  kind: BookingFieldKind
  required: boolean
  question: string | null
  position: number | null
}

function plain(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function buildAsks(fields: BookingField[], questions: EventQuestion[]): Ask[] {
  const taken = new Set<number>()
  const asks: Ask[] = fields.map((f, i) => {
    const match = questions.find(
      (q) =>
        q.askable &&
        !taken.has(q.position) &&
        (f.kind === 'phone' ? q.type === 'phone_number' : plain(q.name) === plain(f.label)),
    )
    if (match) taken.add(match.position)
    return {
      key: fieldKey(i),
      label: f.label,
      kind: f.kind,
      required: match?.required ?? false,
      question: match?.name ?? null,
      position: match?.position ?? null,
    }
  })

  for (const q of questions) {
    if (!q.required || !q.askable || taken.has(q.position)) continue
    asks.push({
      key: `question${q.position}`,
      label: q.name,
      kind: q.type === 'phone_number' ? 'phone' : 'text',
      required: true,
      question: q.name,
      position: q.position,
    })
  }
  return asks
}

export type CollectedAnswers = {
  answers: QuestionAnswer[]
  saved: { label: string; value: string }[]
  phone: string | null
  missing: string[]
}

export function collectAnswers(asks: Ask[], infos: unknown): CollectedAnswers {
  const given = (infos ?? {}) as Record<string, unknown>
  const out: CollectedAnswers = { answers: [], saved: [], phone: null, missing: [] }
  for (const ask of asks) {
    const raw = given[ask.key]
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      if (ask.required) out.missing.push(ask.label)
      continue
    }
    out.saved.push({ label: ask.label, value })
    if (ask.kind === 'phone' && !out.phone) out.phone = value
    if (ask.question !== null && ask.position !== null) {
      out.answers.push({ question: ask.question, answer: value, position: ask.position })
    }
  }
  return out
}
