'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  DEFAULT_SEQUENCE,
  MAX_STEPS,
  MESSAGING_WINDOW_MINUTES,
  MIN_DELAY_MINUTES,
  SETTINGS_VERSION,
  followupSteps,
  stepDelayBounds,
  variantHasContent,
  type FollowupStep,
  type FollowupStepKind,
  type FollowupVariant,
} from '@/supabase/functions/_shared/followup-plan'
import { renderFollowupText } from '@/supabase/functions/_shared/followup-text'
import { isViewAsReadOnly } from '@/lib/view-as/state'
import { useFollowupVariantStats } from '@/lib/queries'
import type { Assistant, FollowupVariantStat } from '@/lib/types'
import { formatDuration } from '@/lib/audio'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label, FieldError } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { InfoTip, Switch } from '@/components/ui/misc'
import { useSaveSettings } from './use-save-settings'
import { StepTimeline, formatDelay, stepIcon } from './followup-fields'
import { FollowupStepEditor, newVariant, type StatsState } from './followup-step-editor'

const KIND_NAMES: Record<FollowupStepKind, string> = { like: 'Like', message: 'Message', notify: 'Vous prévenir' }

function cloneSequence(steps: FollowupStep[]): FollowupStep[] {
  return steps.map((step) => ({ ...step, variants: step.variants.map((v) => ({ ...v })) }))
}

function newStep(after: FollowupStep | undefined): FollowupStep {
  const at = after ? Number(after.at_minutes) + 120 : 120
  const kind: FollowupStepKind = at > MESSAGING_WINDOW_MINUTES ? 'notify' : 'message'
  return { id: crypto.randomUUID(), at_minutes: at, kind, variants: [newVariant()] }
}

function variantSummary(variant: FollowupVariant) {
  if (variant.kind === 'audio') {
    return variant.media_path ? `Vocal${variant.media_duration_ms ? ` · ${formatDuration(variant.media_duration_ms)}` : ''}` : 'Vocal à enregistrer'
  }
  if (variant.kind === 'image') return variant.media_path ? 'Image' : 'Image à importer'
  const text = (variant.text ?? '').trim()
  return text ? renderFollowupText(text, null) : 'Texte à écrire'
}

function stepSummary(step: FollowupStep) {
  if (step.kind === 'like') return 'Un cœur sur le dernier message du prospect'
  const variants = step.variants ?? []
  if (variants.length > 1) return `${variants.length} variantes · ${variants.map(variantSummary).join(' / ')}`
  return variants[0] ? variantSummary(variants[0]) : 'À compléter'
}

export function FollowupsCard({ assistant, humanAgent }: { assistant: Assistant; humanAgent: boolean }) {
  const { save, saving } = useSaveSettings(assistant)
  const initial = assistant.settings.followups
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [afterOwn, setAfterOwn] = useState(initial?.after_own_message ?? false)
  const [steps, setSteps] = useState<FollowupStep[]>(() => cloneSequence(followupSteps(initial)))
  const [converted] = useState(() => Boolean(initial) && initial?.version !== SETTINGS_VERSION && followupSteps(initial).length > 0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleteStep, setDeleteStep] = useState<FollowupStep | null>(null)
  const [deleteVariant, setDeleteVariant] = useState<{ step: FollowupStep; variant: FollowupVariant } | null>(null)
  const [confirmDefault, setConfirmDefault] = useState(false)
  const statsQuery = useFollowupVariantStats(assistant.id, 30)

  const stats = useMemo<StatsState>(() => {
    const byVariant = new Map<string, FollowupVariantStat>()
    for (const row of statsQuery.data ?? []) byVariant.set(`${row.step_id}|${row.variant_id}`, row)
    return {
      status: isViewAsReadOnly() || statsQuery.isError ? 'unavailable' : statsQuery.isLoading ? 'loading' : 'ready',
      byVariant,
    }
  }, [statsQuery.data, statsQuery.isError, statsQuery.isLoading])

  const ordered = useMemo(() => [...steps].sort((a, b) => Number(a.at_minutes) - Number(b.at_minutes)), [steps])

  function edit(id: string, patch: Partial<FollowupStep>) {
    setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  // Changer de type garde ce qui reste valable et remet le délai dans les bornes du nouveau type.
  function changeKind(step: FollowupStep, kind: FollowupStepKind) {
    if (step.kind === kind) return
    const at = Number(step.at_minutes) || 0
    if (kind === 'like') return edit(step.id, { kind, variants: [], at_minutes: Math.min(at, 23 * 60) })
    if (kind === 'notify') {
      const texts = step.variants.filter((v) => v.kind === 'text')
      return edit(step.id, { kind, variants: texts.length ? texts : [newVariant()], at_minutes: Math.max(at, 36 * 60) })
    }
    return edit(step.id, { kind, variants: step.variants.length ? step.variants : [newVariant()], at_minutes: Math.min(at, 23 * 60) })
  }

  function addStep() {
    const added = newStep(ordered[ordered.length - 1])
    setSteps((list) => [...list, added])
    setOpenId(added.id)
  }

  function applyDefault() {
    setSteps(cloneSequence(DEFAULT_SEQUENCE))
    setOpenId(null)
    setError('')
    setConfirmDefault(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned: FollowupStep[] = ordered.map((step) => ({
      ...step,
      at_minutes: Number(step.at_minutes) || 0,
      variants: step.kind === 'like' ? [] : step.variants.map((v) => (v.kind === 'text' ? { ...v, text: (v.text ?? '').trim() } : v)),
    }))
    if (enabled) {
      let previous: FollowupStep | null = null
      for (const [index, step] of cleaned.entries()) {
        const fail = (message: string) => {
          setOpenId(step.id)
          setError(`Étape ${index + 1} : ${message}`)
        }
        const bounds = stepDelayBounds(step.kind)
        if (step.at_minutes < bounds.min || step.at_minutes > bounds.max) {
          return fail(
            step.kind === 'notify'
              ? 'une étape « Vous prévenir » se règle entre 24 h 15 et 7 jours.'
              : 'un like ou un message se règle entre 15 minutes et 23 h 45.',
          )
        }
        if (previous && step.at_minutes < previous.at_minutes + MIN_DELAY_MINUTES) {
          return fail('laissez au moins 15 minutes avec l’étape précédente.')
        }
        previous = step
        if (step.kind === 'like') continue
        const empties = step.variants.filter((v) => !variantHasContent(v))
        if (empties.length === step.variants.length) {
          return fail(step.kind === 'notify' ? 'écrivez le message qui vous sera proposé.' : 'écrivez un message, enregistrez un vocal ou importez une image.')
        }
        const media = empties.find((v) => v.kind !== 'text')
        if (media) return fail(media.kind === 'audio' ? 'une variante attend son vocal.' : 'une variante attend son image.')
        step.variants = step.variants.filter(variantHasContent)
      }
      if (cleaned.length === 0) {
        setError('Ajoutez au moins une étape, ou utilisez la séquence conseillée.')
        return
      }
    }
    setError('')
    await save({ followups: { enabled, after_own_message: afterOwn, version: SETTINGS_VERSION, steps: cleaned } })
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Relances
            <InfoTip text="Jamais après une pause, une clôture, un appel réservé ou un message de votre main." />
          </span>
        }
        description="Quand le prospect ne répond plus : un like, un message, puis une notification pour vous."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label className="mb-0">Activer les relances</Label>
            <Switch checked={enabled} onChange={setEnabled} label="Activer les relances" />
          </div>

          {enabled ? (
            <>
              {converted ? (
                <p className="rounded-[10px] border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-ink">
                  Réglages convertis en séquence : relisez, puis enregistrez.
                </p>
              ) : null}

              {ordered.length ? <StepTimeline steps={ordered} /> : null}

              {ordered.length === 0 ? (
                <div className="space-y-2 rounded-[10px] border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted">Aucune étape pour l’instant.</p>
                  <Button type="button" size="sm" onClick={applyDefault}>
                    Utiliser la séquence conseillée
                  </Button>
                </div>
              ) : null}

              {ordered.map((step, index) =>
                openId === step.id ? (
                  <FollowupStepEditor
                    key={step.id}
                    step={step}
                    index={index}
                    assistant={assistant}
                    stats={stats}
                    humanAgent={humanAgent}
                    onChange={(patch) => edit(step.id, patch)}
                    onKindChange={(kind) => changeKind(step, kind)}
                    onDelete={() => setDeleteStep(step)}
                    onDeleteVariant={(variant) => {
                      const empty = !variantHasContent(variant)
                      if (empty) edit(step.id, { variants: step.variants.filter((v) => v.id !== variant.id) })
                      else setDeleteVariant({ step, variant })
                    }}
                  />
                ) : (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setOpenId(step.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5 text-left hover:bg-bg/60"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm">
                        <span className="text-muted">{stepIcon(step.kind, 14)}</span>
                        <span className="font-medium">Étape {index + 1}</span>
                        <span className="text-muted">
                          · Après {formatDelay(Number(step.at_minutes) || 0)} · {KIND_NAMES[step.kind]}
                        </span>
                      </span>
                      <span className="block truncate text-sm text-muted">{stepSummary(step)}</span>
                    </span>
                    <span className="shrink-0 text-sm text-primary">Modifier</span>
                  </button>
                ),
              )}

              {ordered.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={ordered.length >= MAX_STEPS} onClick={addStep}>
                    <Plus size={14} className="mr-1" />
                    {ordered.length >= MAX_STEPS ? 'Maximum atteint' : 'Ajouter une étape'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDefault(true)}>
                    Utiliser la séquence conseillée
                  </Button>
                </div>
              ) : null}

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="mb-0">Relancer aussi après un message que j’ai écrit moi-même</Label>
                  <Switch checked={afterOwn} onChange={setAfterOwn} label="Relancer après mes propres messages" />
                </div>
              </div>
            </>
          ) : null}
          <FieldError>{error}</FieldError>
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={deleteStep != null}
        onClose={() => setDeleteStep(null)}
        onConfirm={() => {
          setSteps((list) => list.filter((s) => s.id !== deleteStep?.id))
          setDeleteStep(null)
        }}
        title="Supprimer cette étape"
        message="Elle ne partira plus. Pensez à enregistrer ensuite."
        confirmLabel="Supprimer"
        danger
      />
      <ConfirmDialog
        open={deleteVariant != null}
        onClose={() => setDeleteVariant(null)}
        onConfirm={() => {
          if (deleteVariant) edit(deleteVariant.step.id, { variants: deleteVariant.step.variants.filter((v) => v.id !== deleteVariant.variant.id) })
          setDeleteVariant(null)
        }}
        title="Supprimer cette variante"
        message="Les autres variantes de l’étape se partageront les envois. Pensez à enregistrer ensuite."
        confirmLabel="Supprimer"
        danger
      />
      <ConfirmDialog
        open={confirmDefault}
        onClose={() => setConfirmDefault(false)}
        onConfirm={applyDefault}
        title="Remplacer par la séquence conseillée"
        message="Vos étapes actuelles seront remplacées. Rien n’est enregistré tant que vous ne cliquez pas sur Enregistrer."
        confirmLabel="Remplacer"
      />
    </Card>
  )
}
