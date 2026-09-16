import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Le stockage Supabase refuse les caractères hors ASCII dans un chemin (« ’ », accents) :
// l'import échouait en 400 sur un nom de fichier ordinaire. Le nom affiché, lui, reste intact.
export function storageSafeName(name: string) {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const safe = base
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  return `${safe || 'document'}${ext ? `.${ext}` : ''}`
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(value: string | Date | null | undefined) {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  const diffMs = Date.now() - d.getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const days = Math.round(h / 24)
  if (days < 7) return `il y a ${days} j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function formatCurrency(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
}

export function initialsOf(nameOrEmail: string | null | undefined) {
  const source = (nameOrEmail ?? '?').trim()
  const parts = source.split(/[\s._@-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '')
  return letters.join('') || '?'
}
