'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFlags, useInvalidate, useProfile } from '@/lib/queries'
import { canAdminister, groupFlags } from '@/lib/features'
import type { FeatureFlag, FlagStage } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'

const STAGES: { value: FlagStage; label: string }[] = [
  { value: 'hidden', label: 'Masqué' },
  { value: 'staff', label: 'Équipe' },
  { value: 'beta', label: 'Bêta' },
  { value: 'all', label: 'Tout le monde' },
]

// Deux modules portent le même nom en base : sans cette précision on ne sait pas lequel on règle.
const LABEL_HINTS: Record<string, string> = {
  calendly: 'connexion du compte et lien envoyé',
  calendly_booking: 'l’assistant réserve lui-même',
}

export default function AdminFlagsPage() {
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: profile } = useProfile()
  const { data: flags, isLoading } = useFlags()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const editable = canAdminister(profile)

  async function setStage(key: string, stage: FlagStage) {
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_set_flag', { p_key: key, p_stage: stage })
    if (error) {
      toast('Impossible de modifier ce module.', 'error')
      return
    }
    toast('Module mis à jour.')
    invalidate('flags')
  }

  async function saveNotes(key: string, stage: FlagStage) {
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_set_flag', {
      p_key: key,
      p_stage: stage,
      p_notes: notes[key] ?? '',
    })
    if (error) {
      toast('Impossible d’enregistrer la note.', 'error')
      return
    }
    toast('Note enregistrée.')
    invalidate('flags')
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  const groups = groupFlags(flags ?? [])
  const sections: { id: string; title: string; hint: string; flags: FeatureFlag[]; folded: boolean }[] = [
    { id: 'building', title: 'En préparation', hint: 'Écrits, à essayer puis à ouvrir.', flags: groups.building, folded: false },
    { id: 'open', title: 'Ouverts à tous', hint: 'En service chez tous les clients. À toucher seulement pour couper un module en urgence.', flags: groups.open, folded: true },
    { id: 'ideas', title: 'Idées, rien à régler', hint: 'Aucun code ne les lit encore : les ouvrir ne change rien.', flags: groups.ideas, folded: true },
  ]

  function row(flag: FeatureFlag) {
    const hint = LABEL_HINTS[flag.key]
    return (
      <div key={flag.key} className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {flag.label}
              {hint ? <span className="font-normal text-muted"> · {hint}</span> : null}
            </p>
            <p className="truncate text-xs text-muted">{flag.notes || flag.key}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNoteOpen(noteOpen === flag.key ? null : flag.key)}>
            {flag.notes ? 'Modifier la note' : 'Ajouter une note'}
          </Button>
          <select
            value={flag.stage}
            onChange={(e) => setStage(flag.key, e.target.value as FlagStage)}
            disabled={!editable}
            aria-label={`Visibilité de ${flag.label}`}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {noteOpen === flag.key ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              placeholder="Note interne (où on en est)"
              defaultValue={flag.notes ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [flag.key]: e.target.value }))}
              disabled={!editable}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await saveNotes(flag.key, flag.stage)
                setNoteOpen(null)
              }}
              disabled={!editable || notes[flag.key] === undefined}
            >
              Enregistrer la note
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Masqué = personne, Équipe = admins et lecteurs, Bêta = équipe et bêta-testeurs,
        Tout le monde = tous les clients.
      </p>
      {sections.map((section) => {
        const visible = !section.folded || shown[section.id]
        return (
          <section key={section.id} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {section.title} <span className="font-normal text-muted">({section.flags.length})</span>
                </h2>
                <p className="text-xs text-muted">{section.hint}</p>
              </div>
              {section.folded && section.flags.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setShown((v) => ({ ...v, [section.id]: !visible }))}>
                  {visible ? 'Replier' : 'Afficher'}
                </Button>
              ) : null}
            </div>
            {section.flags.length === 0 ? (
              <p className="text-sm text-muted">Aucun module ici pour le moment.</p>
            ) : visible ? (
              <Card className="divide-y divide-border">{section.flags.map(row)}</Card>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
