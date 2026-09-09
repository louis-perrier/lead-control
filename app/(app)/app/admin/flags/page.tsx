'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFlags, useInvalidate, useProfile } from '@/lib/queries'
import { canAdminister } from '@/lib/features'
import type { FlagStage } from '@/lib/types'
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

export default function AdminFlagsPage() {
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: profile } = useProfile()
  const { data: flags, isLoading } = useFlags()
  const [notes, setNotes] = useState<Record<string, string>>({})
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Masqué = personne, Équipe = admins et lecteurs, Bêta = équipe et bêta-testeurs,
        Tout le monde = tous les clients.
      </p>
      <Card className="divide-y divide-border">
        {(flags ?? []).map((flag) => (
          <div key={flag.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{flag.label}</p>
              <p className="text-xs text-muted">{flag.key}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                placeholder="Note interne (où on en est)"
                defaultValue={flag.notes ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [flag.key]: e.target.value }))}
                disabled={!editable}
                className="h-8 w-52 rounded-md border border-border bg-surface px-2 text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => saveNotes(flag.key, flag.stage)}
                disabled={!editable || notes[flag.key] === undefined}
              >
                Noter
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
          </div>
        ))}
      </Card>
    </div>
  )
}
