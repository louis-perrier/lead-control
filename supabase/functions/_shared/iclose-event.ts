// Lecture des réponses iClose : liste des pages de réservation et créneaux disponibles.
// Module pur, testé sous Vitest. Les réponses de l'API ne sont pas figées dans la documentation
// publique, la lecture accepte donc les formes voisines ; corriger ici et nulle part ailleurs si
// le compte réel renvoie autre chose.
import { zonedToUtc } from './agenda-slots.ts'

export type IcloseEvent = {
  id: string
  linkPrefix: string
  name: string
  durationMin: number
  bookingUrl: string
  active: boolean
  bookable: boolean
  blockers: string[]
}

type Raw = Record<string, unknown>

function str(source: Raw, ...keys: string[]) {
  for (const k of keys) {
    const v = source[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

function num(source: Raw, ...keys: string[]) {
  for (const k of keys) {
    const n = Number(source[k])
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

// Les listes iClose arrivent sous `data`, `items` ou `events` selon les endpoints.
export function listOf(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[]
  const root = (payload ?? {}) as Raw
  for (const key of ['data', 'items', 'events', 'results', 'records']) {
    const v = root[key]
    if (Array.isArray(v)) return v as Raw[]
    if (v && typeof v === 'object') {
      const nested = (v as Raw).data ?? (v as Raw).items
      if (Array.isArray(nested)) return nested as Raw[]
    }
  }
  return []
}

export function describeIcloseEvent(raw: Raw): IcloseEvent {
  const linkPrefix = str(raw, 'linkPrefix', 'link_prefix', 'slug', 'publicUrlSlug')
  const durationMin = num(raw, 'duration', 'durationMin', 'duration_minutes', 'length')
  const active = raw.status === 'DEACTIVATED' ? false : raw.active !== false && raw.isActive !== false

  const blockers: string[] = []
  if (!linkPrefix) blockers.push('cette page n’a pas de lien public exploitable')
  if (!active) blockers.push('cette page est désactivée dans iClose')

  return {
    id: str(raw, 'id', 'eventId', '_id'),
    linkPrefix,
    name: str(raw, 'name', 'title', 'eventName') || 'Sans titre',
    durationMin: durationMin || 30,
    bookingUrl: str(raw, 'bookingUrl', 'publicUrl', 'url') || (linkPrefix ? `https://iclosed.io/${linkPrefix}` : ''),
    active,
    bookable: blockers.length === 0,
    blockers,
  }
}

function timeOf(entry: unknown) {
  if (typeof entry === 'string') return entry
  const r = (entry ?? {}) as Raw
  return str(r, 'time', 'startTime', 'start', 'dateTime', 'slot')
}

function pushMoment(out: number[], date: string, time: string, tz: string) {
  if (!time) return
  if (time.includes('T')) {
    const ms = Date.parse(time)
    if (Number.isFinite(ms)) out.push(ms)
    return
  }
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  if (![y, mo, d, h].every((n) => Number.isFinite(n))) return
  const ms = zonedToUtc(y, mo, d, h * 60 + (Number.isFinite(mi) ? mi : 0), tz)
  if (ms != null) out.push(ms)
}

// Forme documentée : { availabilities: { "2026-02-26": ["09:00", "09:30"] } }. Une liste de
// { date, times } et des horodatages ISO complets passent aussi.
export function parseAvailabilities(payload: unknown, tz: string): number[] {
  const root = (payload ?? {}) as Raw
  const inner = (root.data ?? root) as Raw
  const source = inner.availabilities ?? inner.availableDates ?? inner.dates ?? inner.slots ?? inner
  const out: number[] = []

  if (Array.isArray(source)) {
    for (const item of source) {
      if (typeof item === 'string') {
        pushMoment(out, '', item, tz)
        continue
      }
      const r = (item ?? {}) as Raw
      const date = str(r, 'date', 'day')
      const times = r.times ?? r.slots ?? r.availableTimes ?? r.availability
      if (Array.isArray(times)) for (const t of times) pushMoment(out, date, timeOf(t), tz)
      else pushMoment(out, date, timeOf(r), tz)
    }
  } else if (source && typeof source === 'object') {
    for (const [date, times] of Object.entries(source as Raw)) {
      if (!Array.isArray(times)) continue
      for (const t of times) pushMoment(out, date, timeOf(t), tz)
    }
  }

  return [...new Set(out)].sort((a, b) => a - b)
}

// Réponses de POST /v1/contacts (data.contact.id) et POST /v1/eventCalls (data.eventCall.data.id),
// lues dans la documentation développeur le 2026-09-26. Les formes plates restent acceptées.
function pick(payload: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    let node: unknown = payload
    for (const key of path) node = node && typeof node === 'object' ? (node as Raw)[key] : undefined
    if (node !== undefined && node !== null && node !== '') return node
  }
  return undefined
}

function idText(value: unknown) {
  return typeof value === 'number' || (typeof value === 'string' && value.trim()) ? String(value).trim() : ''
}

export function contactIdOf(payload: unknown): string {
  return idText(pick(payload, [['data', 'contact', 'id'], ['data', 'id'], ['contact', 'id'], ['id']]))
}

export function eventCallOf(payload: unknown): { id: string; joinUrl: string | null } {
  const id = idText(pick(payload, [['data', 'eventCall', 'data', 'id'], ['data', 'eventCall', 'id'], ['data', 'id'], ['eventCall', 'id'], ['id']]))
  const join = pick(payload, [['data', 'eventCall', 'data', 'location'], ['data', 'eventCall', 'data', 'joinUrl'], ['data', 'location'], ['location'], ['joinUrl']])
  return { id, joinUrl: typeof join === 'string' && join.startsWith('http') ? join : null }
}

// GET /v1/contacts?search= : data.contacts[], recherche large (nom, e-mail, téléphone), on garde
// seulement l'e-mail exact.
export function contactIdByEmail(payload: unknown, email: string): string {
  const list = pick(payload, [['data', 'contacts'], ['contacts'], ['data']])
  if (!Array.isArray(list)) return ''
  const wanted = email.trim().toLowerCase()
  const match = list.find((c) => typeof c?.email === 'string' && c.email.trim().toLowerCase() === wanted)
  return match ? idText(match.id) : ''
}

// iClose attend des entiers pour contactId et eventId ; nos identifiants circulent en texte.
export function numericId(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value
}

