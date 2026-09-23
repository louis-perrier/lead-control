// Aucun import : partagé par followups-dispatch, l'écran de réglage et les tests.

export type FollowupItem = {
  id?: string
  delay_minutes?: number
  kind?: 'text' | 'audio'
  variants?: string[]
  pick?: string
  media_path?: string
  media_mime?: string
  transcript?: string
}

export type FollowupMessage = { id: string; text: string }

export type FollowupVariantKind = 'text' | 'audio' | 'image'
export type FollowupStepKind = 'like' | 'message' | 'notify'

export type FollowupVariant = {
  id: string
  kind: FollowupVariantKind
  text?: string
  media_path?: string
  media_mime?: string
  media_duration_ms?: number
  // audio : transcription ; image : ce que montre l'image, lue par l'agent.
  transcript?: string
}

// at_minutes se compte depuis notre dernier message, pour toute la séquence : un like
// n'écrit rien dans le fil, il ne peut donc pas servir d'ancre à l'étape suivante.
export type FollowupStep = {
  id: string
  at_minutes: number
  kind: FollowupStepKind
  variants: FollowupVariant[]
}

export type AssistedFollowup = { id: string; days: number; text: string }

export type FollowupSettings = {
  enabled?: boolean
  after_own_message?: boolean
  version?: number
  steps?: FollowupStep[]
  // Réglages d'avant la séquence, jamais réécrits par l'écran mais toujours lus.
  messages?: FollowupMessage[]
  items?: FollowupItem[]
  assisted?: AssistedFollowup[]
}

export const MAX_FOLLOWUPS = 3
export const MAX_POOL = 4
export const PICK_RANDOM = 'random'
export const MIN_DELAY_MINUTES = 15
export const MAX_DELAY_MINUTES = 23 * 60 + 45
export const MESSAGING_WINDOW_MINUTES = 24 * 60
export const MAX_STEPS = 5
export const MAX_VARIANTS = 4
export const MAX_NOTIFY_MINUTES = 7 * 24 * 60
export const SETTINGS_VERSION = 3

// Un brouillon incomplet est ignoré sans bloquer. L'ordre de saisie compte : chaque délai
// part de la relance précédente, la liste n'est donc jamais triée.
export function usableFollowupItems(settings?: FollowupSettings | null): FollowupItem[] {
  if (!settings?.enabled) return []
  const items = Array.isArray(settings.items) ? settings.items : []
  const pool = followupPool(settings)
  return items
    .filter((item) => {
      const delay = Number(item?.delay_minutes)
      if (!Number.isFinite(delay) || delay < MIN_DELAY_MINUTES || delay > MAX_DELAY_MINUTES) return false
      if (item.kind === 'audio') return Boolean(item.media_path)
      if (pool) return pool.length > 0
      return (item.variants ?? []).some((v) => typeof v === 'string' && v.trim().length > 0)
    })
    .slice(0, MAX_FOLLOWUPS)
}

// null : réglages d'avant la réserve commune, chaque relance garde alors ses propres variantes.
export function followupPool(settings?: FollowupSettings | null): FollowupMessage[] | null {
  if (!Array.isArray(settings?.messages)) return null
  return settings.messages
    .filter((m) => m && typeof m.id === 'string' && typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m) => ({ id: m.id, text: m.text.trim() }))
}

// Anciens réglages ouverts dans l'écran : les variantes de toutes les relances forment la
// réserve, et une relance qui n'avait qu'un texte reste fixée dessus.
export function poolFromVariants(items: FollowupItem[]) {
  const messages: FollowupMessage[] = []
  const idOf = (text: string) => {
    const found = messages.find((m) => m.text === text)
    if (found) return found.id
    messages.push({ id: `m${messages.length + 1}`, text })
    return messages[messages.length - 1].id
  }
  const picks = items.map((item) => {
    const ids = (item.variants ?? []).map((v) => (v ?? '').trim()).filter(Boolean).map(idOf)
    return ids.length === 1 ? ids[0] : PICK_RANDOM
  })
  return { messages, picks }
}

// Le message fixé sur une relance, s'il existe encore dans la réserve.
export function fixedMessage(pool: FollowupMessage[], item: FollowupItem) {
  if (item.kind === 'audio' || !item.pick || item.pick === PICK_RANDOM) return null
  return pool.find((m) => m.id === item.pick) ?? null
}

// sent : textes déjà partis en relance dans cette conversation, du plus ancien au plus récent,
// tels qu'envoyés. render applique le prénom pour comparer à armes égales.
export function pickMessage(
  settings: FollowupSettings | null | undefined,
  item: FollowupItem,
  sent: string[] = [],
  render: (text: string) => string = (t) => t,
  rand: () => number = Math.random,
): string | null {
  const pool = followupPool(settings)
  const texts = pool
    ? pool.map((m) => m.text)
    : (item.variants ?? []).map((v) => (v ?? '').trim()).filter(Boolean)
  if (texts.length === 0) return null

  let candidates = texts
  if (pool) {
    const fixed = fixedMessage(pool, item)
    if (fixed) return fixed.text
    const taken = new Set(
      (settings?.items ?? []).filter((other) => other !== item && !(item.id && other.id === item.id)).map((other) => fixedMessage(pool, other)?.text),
    )
    const free = texts.filter((t) => !taken.has(t))
    if (free.length > 0) candidates = free
  }

  const seen = new Set(sent.map((t) => t.trim()))
  const last = sent.length ? sent[sent.length - 1].trim() : null
  const unseen = candidates.filter((t) => !seen.has(render(t).trim()))
  const notLast = candidates.filter((t) => render(t).trim() !== last)
  const from = unseen.length ? unseen : notLast.length ? notLast : candidates
  return from[Math.floor(rand() * from.length)]
}

// Retrouve la relance par son id : modifier ou réordonner ses relances ne doit pas faire
// partir le texte d'une autre. Les lignes planifiées avant l'id retombent sur la position.
export function findFollowupItem(items: FollowupItem[], itemId: string | null, slotIndex: number) {
  if (itemId) return items.find((item) => item.id === itemId) ?? null
  return items[slotIndex - 1] ?? null
}

export function nextFollowupItem(items: FollowupItem[], itemId: string | null, slotIndex: number) {
  const current = findFollowupItem(items, itemId, slotIndex)
  const position = current ? items.indexOf(current) : slotIndex - 1
  return items[position + 1] ?? null
}

// Minutes écoulées depuis notre dernier message au départ de chaque relance.
export function cumulativeOffsets(delays: number[]) {
  let total = 0
  return delays.map((delay) => (total += Math.max(0, Number(delay) || 0)))
}

// Séquence d'étapes (version 3). Les réglages plus anciens sont convertis à la lecture.

const inRange = (value: unknown, min: number, max: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max
}

export function stepDelayBounds(kind: FollowupStepKind) {
  return kind === 'notify'
    ? { min: MESSAGING_WINDOW_MINUTES + MIN_DELAY_MINUTES, max: MAX_NOTIFY_MINUTES }
    : { min: MIN_DELAY_MINUTES, max: MAX_DELAY_MINUTES }
}

export function variantHasContent(variant: FollowupVariant | null | undefined) {
  if (!variant || typeof variant.id !== 'string') return false
  if (variant.kind === 'text') return typeof variant.text === 'string' && variant.text.trim().length > 0
  if (variant.kind === 'audio' || variant.kind === 'image') return Boolean(variant.media_path)
  return false
}

function legacyDelayOk(item: FollowupItem) {
  return inRange(item?.delay_minutes, MIN_DELAY_MINUTES, MAX_DELAY_MINUTES)
}

// Anciens réglages : une relance devient une étape message, ses délais relatifs deviennent
// cumulés, et les modèles Human Agent deviennent des étapes de notification.
export function stepsFromLegacy(settings?: FollowupSettings | null): FollowupStep[] {
  const rawItems = (Array.isArray(settings?.items) ? settings!.items : []).filter(legacyDelayOk)
  let pool = followupPool(settings)
  let picks: string[]
  if (pool) {
    picks = rawItems.map((item) => item.pick ?? PICK_RANDOM)
  } else {
    const converted = poolFromVariants(rawItems)
    pool = converted.messages
    picks = converted.picks
  }
  const offsets = cumulativeOffsets(rawItems.map((item) => Number(item.delay_minutes)))
  const fixedElsewhere = (index: number) =>
    new Set(picks.filter((pick, i) => i !== index && pick !== PICK_RANDOM))
  const steps: FollowupStep[] = rawItems.map((item, index) => {
    const id = item.id ?? `slot${index + 1}`
    if (item.kind === 'audio') {
      return {
        id,
        at_minutes: offsets[index],
        kind: 'message',
        variants: [
          {
            id: `${id}-audio`,
            kind: 'audio',
            media_path: item.media_path,
            media_mime: item.media_mime,
            transcript: item.transcript,
          },
        ],
      }
    }
    const pick = picks[index]
    let messages = pool!
    if (pick !== PICK_RANDOM) {
      const fixed = pool!.find((m) => m.id === pick)
      if (fixed) messages = [fixed]
    } else {
      const taken = fixedElsewhere(index)
      const free = pool!.filter((m) => !taken.has(m.id))
      if (free.length > 0) messages = free
    }
    return { id, at_minutes: offsets[index], kind: 'message', variants: messages.map((m) => ({ id: m.id, kind: 'text' as const, text: m.text })) }
  })
  for (const assisted of Array.isArray(settings?.assisted) ? settings!.assisted : []) {
    if (!assisted || typeof assisted.text !== 'string' || !assisted.text.trim()) continue
    const days = Number(assisted.days)
    if (!Number.isFinite(days) || days < 2) continue
    const id = `assisted-${assisted.id ?? days}`
    steps.push({ id, at_minutes: days * 1440, kind: 'notify', variants: [{ id: `${id}-text`, kind: 'text', text: assisted.text.trim() }] })
  }
  return steps
}

// Les étapes telles que réglées, converties si besoin, sans filtrage : c'est ce que l'écran ouvre.
export function followupSteps(settings?: FollowupSettings | null): FollowupStep[] {
  if (Array.isArray(settings?.steps)) return settings!.steps
  return stepsFromLegacy(settings)
}

// Une étape incomplète est ignorée sans bloquer. Les étapes partent dans l'ordre de leur délai,
// jamais deux à moins de 15 min l'une de l'autre.
export function usableSteps(settings?: FollowupSettings | null): FollowupStep[] {
  if (!settings?.enabled) return []
  const valid = followupSteps(settings).filter((step) => {
    if (!step || typeof step.id !== 'string') return false
    if (step.kind !== 'like' && step.kind !== 'message' && step.kind !== 'notify') return false
    const bounds = stepDelayBounds(step.kind)
    if (!inRange(step.at_minutes, bounds.min, bounds.max)) return false
    if (step.kind === 'like') return true
    const variants = Array.isArray(step.variants) ? step.variants.filter(variantHasContent) : []
    if (step.kind === 'notify') return variants.some((v) => v.kind === 'text')
    return variants.length > 0
  })
  const ordered = [...valid].sort((a, b) => Number(a.at_minutes) - Number(b.at_minutes))
  const kept: FollowupStep[] = []
  for (const step of ordered) {
    const previous = kept[kept.length - 1]
    if (previous && Number(step.at_minutes) < Number(previous.at_minutes) + MIN_DELAY_MINUTES) continue
    kept.push(step)
  }
  return kept.slice(0, MAX_STEPS)
}

export function findStep(steps: FollowupStep[], stepId: string | null, slotIndex: number) {
  if (stepId) return steps.find((step) => step.id === stepId) ?? null
  return steps[slotIndex - 1] ?? null
}

export function nextStep(steps: FollowupStep[], stepId: string | null, slotIndex: number) {
  const current = findStep(steps, stepId, slotIndex)
  const position = current ? steps.indexOf(current) : slotIndex - 1
  return steps[position + 1] ?? null
}

export type SentVariant = { variant_id?: string | null; text?: string | null }

// Parts égales entre variantes. Ce prospect ne reçoit jamais deux fois la même : par id, et
// par texte rendu pour les envois d'avant l'id. Tout reçu : tout sauf la dernière envoyée.
export function pickVariant(
  step: FollowupStep,
  sent: SentVariant[] = [],
  render: (text: string) => string = (t) => t,
  rand: () => number = Math.random,
): FollowupVariant | null {
  const candidates = (step.variants ?? []).filter(variantHasContent)
  if (step.kind === 'notify') {
    const texts = candidates.filter((v) => v.kind === 'text')
    if (texts.length === 0) return null
    return pickAmong(texts, sent, render, rand)
  }
  if (candidates.length === 0) return null
  return pickAmong(candidates, sent, render, rand)
}

function pickAmong(candidates: FollowupVariant[], sent: SentVariant[], render: (t: string) => string, rand: () => number) {
  const seenIds = new Set(sent.map((s) => s.variant_id).filter(Boolean))
  const seenTexts = new Set(sent.map((s) => (s.text ?? '').trim()).filter(Boolean))
  const rendered = (v: FollowupVariant) => (v.kind === 'text' ? render(v.text ?? '').trim() : '')
  const received = (v: FollowupVariant) => seenIds.has(v.id) || (v.kind === 'text' && seenTexts.has(rendered(v)))
  const last = sent.length ? sent[sent.length - 1] : null
  const isLast = (v: FollowupVariant) =>
    Boolean(last) && (v.id === last!.variant_id || (v.kind === 'text' && rendered(v) === (last!.text ?? '').trim()))
  const unseen = candidates.filter((v) => !received(v))
  const notLast = candidates.filter((v) => !isLast(v))
  const from = unseen.length ? unseen : notLast.length ? notLast : candidates
  return from[Math.floor(rand() * from.length)]
}

// Les étapes de notification servent aussi de modèles au brouillon Human Agent de la boîte.
export function notifyTemplates(steps: FollowupStep[]): AssistedFollowup[] {
  return steps
    .filter((step) => step.kind === 'notify')
    .map((step) => {
      const text = (step.variants ?? []).find((v) => v.kind === 'text' && variantHasContent(v))?.text?.trim() ?? ''
      return { id: step.id, days: Math.max(1, Math.round(Number(step.at_minutes) / 1440)), text }
    })
    .filter((t) => t.text)
}

export const DEFAULT_SEQUENCE: FollowupStep[] = [
  { id: 'like-13h', at_minutes: 13 * 60, kind: 'like', variants: [] },
  { id: 'ping-23h', at_minutes: 23 * 60, kind: 'message', variants: [{ id: 'ping-23h-a', kind: 'text', text: '{prénom|} ?🙂' }] },
  {
    id: 'notify-36h',
    at_minutes: 36 * 60,
    kind: 'notify',
    variants: [{ id: 'notify-36h-a', kind: 'text', text: 'Hello {prénom|}, je me permets de te relancer, tu as vu mon message juste au-dessus ?🙂' }],
  },
  {
    id: 'notify-60h',
    at_minutes: 60 * 60,
    kind: 'notify',
    variants: [{ id: 'notify-60h-a', kind: 'text', text: 'Je reviens vers toi une dernière fois {prénom|}, dis-moi si le sujet t’intéresse toujours 🙂' }],
  },
]
