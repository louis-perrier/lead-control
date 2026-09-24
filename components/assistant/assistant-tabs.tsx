'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ASSISTANT_TABS, type AssistantTab } from '@/lib/activation-blockers'

const DEFAULT_TAB: AssistantTab = 'offer'

function isTab(value: unknown): value is AssistantTab {
  return ASSISTANT_TABS.some((t) => t.key === value)
}

// L'onglet vit en localStorage, pas dans l'adresse : le retour OAuth efface la query.
export function useAssistantTab(assistantId: string | undefined) {
  const key = assistantId ? `assistant-tab:${assistantId}` : null
  const [tab, setTabState] = useState<AssistantTab>(DEFAULT_TAB)
  // Un onglet forcé avant que l'assistant soit chargé (retour OAuth) prime sur celui mémorisé.
  const pending = useRef<AssistantTab | null>(null)

  useEffect(() => {
    if (!key) return
    try {
      if (pending.current) {
        window.localStorage.setItem(key, pending.current)
        pending.current = null
        return
      }
      const stored = window.localStorage.getItem(key)
      if (isTab(stored)) setTabState(stored)
    } catch {
      // stockage indisponible : on garde l'onglet par défaut
    }
  }, [key])

  const setTab = useCallback(
    (next: AssistantTab) => {
      setTabState(next)
      if (!key) {
        pending.current = next
        return
      }
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // rien à faire
      }
    },
    [key],
  )

  return [tab, setTab] as const
}

export function AssistantTabs({
  value,
  onChange,
  flagged,
}: {
  value: AssistantTab
  onChange: (tab: AssistantTab) => void
  flagged: Set<AssistantTab>
}) {
  return (
    <div role="tablist" aria-label="Sections de l’assistant" className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-border pb-px">
      {ASSISTANT_TABS.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active}
            aria-controls={`panel-${t.key}`}
            onClick={() => onChange(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {flagged.has(t.key) ? <span aria-label="à compléter" className="size-1.5 rounded-full bg-danger" /> : null}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ tab, active, children }: { tab: AssistantTab; active: boolean; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} hidden={!active} className="space-y-3">
      {children}
    </div>
  )
}
