'use client'

import { Plus } from 'lucide-react'
import {
  MAX_VARIANTS,
  type FollowupStep,
  type FollowupStepKind,
  type FollowupVariant,
  type FollowupVariantKind,
} from '@/supabase/functions/_shared/followup-plan'
import type { Assistant, FollowupVariantStat } from '@/lib/types'
import { AudioField } from '@/components/ui/audio-field'
import { ImageField } from '@/components/ui/image-field'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { InfoTip } from '@/components/ui/misc'
import { DelaySelect, VariantField, pillClass } from './followup-fields'

export type StatsState = { status: 'loading' | 'ready' | 'unavailable'; byVariant: Map<string, FollowupVariantStat> }

export function newVariant(kind: FollowupVariantKind = 'text'): FollowupVariant {
  return { id: crypto.randomUUID(), kind, text: kind === 'text' ? '' : undefined }
}

const KIND_LABELS: { key: FollowupStepKind; label: string }[] = [
  { key: 'like', label: 'Like' },
  { key: 'message', label: 'Message' },
  { key: 'notify', label: 'Vous prévenir' },
]

function VariantStats({ step, variant, stats }: { step: FollowupStep; variant: FollowupVariant; stats: StatsState }) {
  if (stats.status === 'loading') return null
  if (stats.status === 'unavailable') return <p className="text-xs text-muted">Statistiques indisponibles dans ce mode.</p>
  const stat = stats.byVariant.get(`${step.id}|${variant.id}`)
  if (!stat || !stat.sent) return <p className="text-xs text-muted">Pas encore d’envoi.</p>
  const rate = Math.round((stat.replied / stat.sent) * 100)
  return (
    <p className="text-xs text-muted">
      {stat.sent} envoi{stat.sent > 1 ? 's' : ''} · {stat.replied} réponse{stat.replied > 1 ? 's' : ''} ·{' '}
      <span className="font-medium text-ink">{rate} %</span>
    </p>
  )
}

export function FollowupStepEditor({
  step,
  index,
  assistant,
  stats,
  humanAgent,
  onChange,
  onKindChange,
  onDelete,
  onDeleteVariant,
}: {
  step: FollowupStep
  index: number
  assistant: Assistant
  stats: StatsState
  humanAgent: boolean
  onChange: (patch: Partial<FollowupStep>) => void
  onKindChange: (kind: FollowupStepKind) => void
  onDelete: () => void
  onDeleteVariant: (variant: FollowupVariant) => void
}) {
  const variants = step.variants ?? []
  const share = variants.length ? Math.round(100 / variants.length) : 0
  const folder = `${assistant.user_id}/${assistant.id}/followup-${step.id}`

  function editVariant(id: string, patch: Partial<FollowupVariant>) {
    onChange({ variants: variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) })
  }

  function setVariantKind(variant: FollowupVariant, kind: FollowupVariantKind) {
    if (variant.kind === kind) return
    editVariant(variant.id, {
      kind,
      text: kind === 'text' ? variant.text ?? '' : undefined,
      media_path: undefined,
      media_mime: undefined,
      media_duration_ms: undefined,
      transcript: undefined,
    })
  }

  return (
    <div className="space-y-3 rounded-[10px] border border-primary/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="mb-0">Étape {index + 1}</Label>
          <DelaySelect
            value={Number(step.at_minutes) || 0}
            maxHours={step.kind === 'notify' ? 168 : 23}
            onChange={(minutes) => onChange({ at_minutes: minutes })}
          />
          <span className="text-sm text-muted">après votre dernier message</span>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
          Supprimer
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {KIND_LABELS.map((k) => (
          <button key={k.key} type="button" className={pillClass(step.kind === k.key)} onClick={() => onKindChange(k.key)}>
            {k.label}
          </button>
        ))}
        <InfoTip
          text={
            humanAgent
              ? 'Vous prévenir : passé 24 h, vous recevez le texte prêt, à envoyer depuis Instagram ou la boîte.'
              : 'Vous prévenir : passé 24 h, Instagram interdit l’envoi automatique, vous recevez le texte prêt.'
          }
        />
      </div>

      {step.kind !== 'like' ? (
        <div className="space-y-3">
          {variants.map((variant, vIndex) => (
            <div key={variant.id} className="space-y-2 rounded-[10px] border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Variante {String.fromCharCode(65 + vIndex)}</span>
                  {variants.length > 1 ? <span className="text-xs text-muted">{share} % des envois</span> : null}
                </div>
                {variants.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-ink hover:underline"
                    onClick={() => onDeleteVariant(variant)}
                  >
                    Supprimer
                  </button>
                ) : null}
              </div>
              {step.kind === 'message' ? (
                <div className="flex gap-2">
                  <button type="button" className={pillClass(variant.kind === 'text')} onClick={() => setVariantKind(variant, 'text')}>
                    Texte
                  </button>
                  <button type="button" className={pillClass(variant.kind === 'audio')} onClick={() => setVariantKind(variant, 'audio')}>
                    Vocal
                  </button>
                  <button type="button" className={pillClass(variant.kind === 'image')} onClick={() => setVariantKind(variant, 'image')}>
                    Image
                  </button>
                </div>
              ) : null}
              {variant.kind === 'audio' ? (
                <AudioField
                  value={
                    variant.media_path
                      ? { path: variant.media_path, mime: variant.media_mime ?? 'audio/wav', durationMs: variant.media_duration_ms }
                      : null
                  }
                  onChange={(value) =>
                    editVariant(variant.id, {
                      media_path: value?.path,
                      media_mime: value?.mime,
                      media_duration_ms: value?.durationMs,
                      transcript: value?.transcript,
                    })
                  }
                  folder={folder}
                />
              ) : variant.kind === 'image' ? (
                <div className="space-y-2">
                  <ImageField
                    value={variant.media_path ? { path: variant.media_path, mime: variant.media_mime ?? 'image/jpeg' } : null}
                    onChange={(value) => editVariant(variant.id, { media_path: value?.path, media_mime: value?.mime })}
                    folder={folder}
                  />
                  <div>
                    <Label htmlFor={`caption-${variant.id}`}>Ce que montre l’image</Label>
                    <Input
                      id={`caption-${variant.id}`}
                      value={variant.transcript ?? ''}
                      maxLength={120}
                      placeholder="Ex. : un mème « toujours là ? »"
                      onChange={(e) => editVariant(variant.id, { transcript: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <VariantField
                  value={variant.text ?? ''}
                  placeholder={step.kind === 'notify' ? 'Le message qui vous sera proposé' : 'Votre message de relance'}
                  onChange={(text) => editVariant(variant.id, { text })}
                />
              )}
              {step.kind === 'message' ? <VariantStats step={step} variant={variant} stats={stats} /> : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={variants.length >= MAX_VARIANTS}
              onClick={() => onChange({ variants: [...variants, newVariant()] })}
            >
              <Plus size={14} className="mr-1" />
              {variants.length >= MAX_VARIANTS ? 'Maximum atteint' : 'Ajouter une variante'}
            </Button>
            <InfoTip text="Tirée au hasard à parts égales, jamais deux fois au même prospect." />
          </div>
        </div>
      ) : null}
    </div>
  )
}
