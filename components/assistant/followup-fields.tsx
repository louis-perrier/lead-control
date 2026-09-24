'use client'

import { useRef } from 'react'
import { Bell, Heart, MessageCircle } from 'lucide-react'
import { MAX_NOTIFY_MINUTES, MESSAGING_WINDOW_MINUTES, type FollowupStep } from '@/supabase/functions/_shared/followup-plan'
import { NAME_VARIABLE_TEMPLATE, hasNameVariable, renderFollowupText } from '@/supabase/functions/_shared/followup-text'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const pillClass = (active: boolean) =>
  active
    ? 'rounded-full bg-primary px-3 py-1 text-sm text-white'
    : 'rounded-full border border-border px-3 py-1 text-sm text-muted'

export function formatDelay(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

// 60 minutes saisies basculent sur l'heure suivante, la valeur stockée restant un nombre
// de minutes. Rien à corriger à la saisie, l'affichage se renormalise au rendu.
export function DelaySelect({ value, maxHours, onChange }: { value: number; maxHours: number; onChange: (minutes: number) => void }) {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  const inputClass =
    'h-10 w-16 rounded-[10px] border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'
  const part = (raw: string) => Math.max(0, Math.floor(Number(raw) || 0))
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={maxHours}
        aria-label="Heures"
        value={hour}
        onChange={(e) => onChange(part(e.target.value) * 60 + minute)}
        className={inputClass}
      />
      <span className="text-sm text-muted">h</span>
      <input
        type="number"
        min={0}
        max={59}
        aria-label="Minutes"
        value={minute}
        onChange={(e) => onChange(hour * 60 + part(e.target.value))}
        className={inputClass}
      />
      <span className="text-sm text-muted">min</span>
    </div>
  )
}

export function VariantField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function insertName() {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + NAME_VARIABLE_TEMPLATE + value.slice(end))
    requestAnimationFrame(() => {
      const position = start + NAME_VARIABLE_TEMPLATE.length
      el?.focus()
      el?.setSelectionRange(position, position)
    })
  }

  return (
    <div className="space-y-1">
      <Textarea ref={ref} rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        {hasNameVariable(value) ? (
          <p className="min-w-0 flex-1 text-xs text-muted">
            Avec un prénom : « {renderFollowupText(value, 'Julien')} ». Sans : « {renderFollowupText(value, null)} ».
          </p>
        ) : (
          <span />
        )}
        <button type="button" onClick={insertName} className="shrink-0 text-xs text-primary hover:underline">
          Insérer le prénom
        </button>
      </div>
    </div>
  )
}

// Les 24 premières heures occupent les deux tiers de la frise : c'est là que tout se joue,
// les étapes suivantes ne font que prévenir le coach.
function position(minutes: number) {
  if (minutes <= MESSAGING_WINDOW_MINUTES) return (minutes / MESSAGING_WINDOW_MINUTES) * 66
  return 66 + Math.min(1, (minutes - MESSAGING_WINDOW_MINUTES) / (MAX_NOTIFY_MINUTES - MESSAGING_WINDOW_MINUTES)) * 34
}

export function stepIcon(kind: FollowupStep['kind'], size = 12) {
  if (kind === 'like') return <Heart size={size} />
  if (kind === 'notify') return <Bell size={size} />
  return <MessageCircle size={size} />
}

export function StepTimeline({ steps }: { steps: FollowupStep[] }) {
  const late = steps.find((s) => s.kind !== 'notify' && Number(s.at_minutes) > MESSAGING_WINDOW_MINUTES)
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted">Quand partent vos étapes</p>
      <div className="relative ml-1 mr-2 h-10">
        <div className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-primary/15" />
        <div className="absolute top-[11px] h-1 rounded-full bg-primary/30" style={{ left: 0, width: '66%' }} />
        <span className="absolute top-4 -translate-x-1/2 text-[10px] tabular-nums text-muted" style={{ left: '66%' }}>
          24 h
        </span>
        <span className="absolute right-0 top-4 text-[10px] tabular-nums text-muted">7 j</span>
        {steps.map((step) => (
          <span
            key={step.id}
            className={cn(
              'absolute top-0 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-surface text-white',
              step === late ? 'bg-warning' : step.kind === 'notify' ? 'bg-ink/70' : 'bg-primary',
            )}
            style={{ left: `${position(Number(step.at_minutes) || 0)}%` }}
            title={`${formatDelay(Number(step.at_minutes) || 0)} après votre dernier message`}
          >
            {stepIcon(step.kind)}
          </span>
        ))}
      </div>
      {late ? (
        <p className="text-xs text-amber-700">
          Une étape tomberait plus de 24 h après votre message : Instagram ne la laissera pas partir. Passez-la en « Vous prévenir ».
        </p>
      ) : null}
    </div>
  )
}
