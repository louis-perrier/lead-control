'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'lc_view_as'

let targetUserId: string | null = null
const listeners = new Set<() => void>()

try {
  targetUserId = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null
} catch {
  targetUserId = null
}

export function getViewAsTarget() {
  return targetUserId
}

export function isViewAsReadOnly() {
  return targetUserId !== null
}

export function setViewAsTarget(id: string | null) {
  targetUserId = id
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // stockage indisponible (navigation privée) : le mode reste actif pour l'onglet en cours
  }
  listeners.forEach((l) => l())
}

function subscribeViewAs(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useViewAsTargetId() {
  return useSyncExternalStore(subscribeViewAs, getViewAsTarget, () => null)
}
