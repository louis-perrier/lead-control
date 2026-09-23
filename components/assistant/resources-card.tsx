'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { MAX_RESOURCES, isResourceUrl, type Resource } from '@/supabase/functions/assistant-dispatch/discovery-prompt'
import type { Assistant } from '@/lib/types'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, FieldHint, FieldError } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useSaveSettings } from './use-save-settings'

function newResource(): Resource {
  return { id: crypto.randomUUID(), title: '', url: '', when: '' }
}

export function ResourcesCard({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const [resources, setResources] = useState<Resource[]>(() =>
    (assistant.settings.resources ?? []).map((r) => ({ id: r.id, title: r.title ?? '', url: r.url ?? '', when: r.when ?? '' })),
  )
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null)

  function edit(id: string, patch: Partial<Resource>) {
    setResources((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = resources
      .map((r) => ({ ...r, title: r.title.trim(), url: r.url.trim(), when: r.when.trim() }))
      .filter((r) => r.title || r.url || r.when)
    for (const [index, r] of cleaned.entries()) {
      if (!r.title) return setError(`Ressource ${index + 1} : donnez-lui un titre.`)
      if (!isResourceUrl(r.url)) return setError(`Ressource ${index + 1} : le lien doit commencer par http:// ou https://`)
    }
    setError('')
    await save({ resources: cleaned })
  }

  return (
    <Card>
      <CardHeader
        title="Ressources à partager"
        description="Une vidéo ou une page que l’assistant peut envoyer quand il a compris ce qui bloque le prospect, avant de proposer l’appel."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          {resources.length === 0 ? <FieldHint>Aucune ressource. Sans ressource, l’assistant cherche la douleur puis propose l’appel.</FieldHint> : null}
          {resources.map((r, index) => (
            <div key={r.id} className="space-y-2 rounded-[10px] border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Ressource {index + 1}</span>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-ink hover:underline"
                  onClick={() => (r.title.trim() || r.url.trim() ? setDeleteTarget(r) : setResources((list) => list.filter((x) => x.id !== r.id)))}
                >
                  Supprimer
                </button>
              </div>
              <div>
                <Label htmlFor={`res-title-${r.id}`}>Titre</Label>
                <Input
                  id={`res-title-${r.id}`}
                  value={r.title}
                  maxLength={80}
                  placeholder="Ex. : Vidéo, comment faire plus de vues"
                  onChange={(e) => edit(r.id, { title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`res-url-${r.id}`}>Lien</Label>
                <Input id={`res-url-${r.id}`} value={r.url} placeholder="https://youtu.be/..." onChange={(e) => edit(r.id, { url: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`res-when-${r.id}`}>Quand l’envoyer</Label>
                <Input
                  id={`res-when-${r.id}`}
                  value={r.when}
                  maxLength={160}
                  placeholder="Ex. : le prospect dit que ses vidéos ne font pas de vues"
                  onChange={(e) => edit(r.id, { when: e.target.value })}
                />
                <FieldHint>Une phrase, comme vous l’expliqueriez à un setter. Une seule ressource part par conversation.</FieldHint>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={resources.length >= MAX_RESOURCES}
            onClick={() => setResources((list) => [...list, newResource()])}
          >
            <Plus size={14} className="mr-1" />
            {resources.length >= MAX_RESOURCES ? 'Maximum atteint' : 'Ajouter une ressource'}
          </Button>
          <FieldError>{error}</FieldError>
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          setResources((list) => list.filter((x) => x.id !== deleteTarget?.id))
          setDeleteTarget(null)
        }}
        title="Supprimer cette ressource"
        message="L’assistant ne l’enverra plus. Pensez à enregistrer ensuite."
        confirmLabel="Supprimer"
        danger
      />
    </Card>
  )
}
