'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { MAX_RESOURCES, isResourceUrl } from '@/supabase/functions/assistant-dispatch/discovery-prompt'
import type { Assistant } from '@/lib/types'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, FieldError } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { InfoTip } from '@/components/ui/misc'
import { useSaveSettings } from './use-save-settings'
import { pillClass } from './followup-fields'

const MAX_SECONDARY_LINKS = 4

type Role = 'link' | 'resource'
type Row = { id: string; role: Role; title: string; url: string; when: string }

const ROLES: { key: Role; label: string }[] = [
  { key: 'link', label: 'Remplace le lien principal' },
  { key: 'resource', label: 'À envoyer pendant la découverte' },
]

function rowsFrom(assistant: Assistant): Row[] {
  const links = (assistant.settings.stop_condition?.secondary_links ?? []).map((l) => ({
    id: l.id,
    role: 'link' as const,
    title: '',
    url: l.link ?? '',
    when: l.condition ?? '',
  }))
  const resources = (assistant.settings.resources ?? []).map((r) => ({
    id: r.id,
    role: 'resource' as const,
    title: r.title ?? '',
    url: r.url ?? '',
    when: r.when ?? '',
  }))
  return [...links, ...resources]
}

function hasContent(r: Row) {
  return Boolean(r.title.trim() || r.url.trim() || r.when.trim())
}

export function LinksCard({ assistant, allowDiscovery }: { assistant: Assistant; allowDiscovery: boolean }) {
  const { save, saving } = useSaveSettings(assistant)
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(assistant))
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)

  // Sans le module découverte, les ressources restent en base mais ne s'affichent pas.
  const visible = allowDiscovery ? rows : rows.filter((r) => r.role === 'link')
  const count = (role: Role) => rows.filter((r) => r.role === role).length
  const nextRole: Role = count('link') < MAX_SECONDARY_LINKS || !allowDiscovery ? 'link' : 'resource'
  const full = count('link') >= MAX_SECONDARY_LINKS && (!allowDiscovery || count('resource') >= MAX_RESOURCES)

  function edit(id: string, patch: Partial<Row>) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function add() {
    setRows((list) => [...list, { id: crypto.randomUUID(), role: nextRole, title: '', url: '', when: '' }])
  }

  function remove(r: Row) {
    if (hasContent(r)) setDeleteTarget(r)
    else setRows((list) => list.filter((x) => x.id !== r.id))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = rows.map((r) => ({ ...r, title: r.title.trim(), url: r.url.trim(), when: r.when.trim() })).filter(hasContent)
    for (const r of cleaned) {
      const index = visible.findIndex((x) => x.id === r.id)
      if (index < 0) continue
      const label = `Ligne ${index + 1}`
      if (!isResourceUrl(r.url)) return setError(`${label} : le lien doit commencer par http:// ou https://`)
      if (r.role === 'resource' && !r.title) return setError(`${label} : donnez un titre à cette ressource.`)
    }
    if (cleaned.filter((r) => r.role === 'link').length > MAX_SECONDARY_LINKS) {
      return setError(`${MAX_SECONDARY_LINKS} liens au plus peuvent remplacer le lien principal.`)
    }
    if (cleaned.filter((r) => r.role === 'resource').length > MAX_RESOURCES) {
      return setError(`${MAX_RESOURCES} ressources au plus.`)
    }
    setError('')
    await save((fresh) => ({
      stop_condition: {
        ...fresh.stop_condition,
        secondary_links: cleaned.filter((r) => r.role === 'link').map((r) => ({ id: r.id, condition: r.when, link: r.url })),
      },
      resources: cleaned.filter((r) => r.role === 'resource').map((r) => ({ id: r.id, title: r.title, url: r.url, when: r.when })),
    }))
  }

  return (
    <Card>
      <CardHeader title="Liens et ressources" description="Ce que l’assistant peut envoyer en plus de votre lien principal." />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          {visible.length === 0 ? <p className="text-sm text-muted">Aucun lien pour l’instant.</p> : null}
          {visible.map((r, index) => (
            <div key={r.id} className="space-y-2 rounded-[10px] border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Ligne {index + 1}</span>
                <button type="button" className="text-xs text-muted hover:text-ink hover:underline" onClick={() => remove(r)}>
                  Supprimer
                </button>
              </div>
              {allowDiscovery ? (
                <div className="flex flex-wrap items-center gap-2">
                  {ROLES.map((role) => (
                    <button key={role.key} type="button" className={pillClass(r.role === role.key)} onClick={() => edit(r.id, { role: role.key })}>
                      {role.label}
                    </button>
                  ))}
                  <InfoTip text="Une ressource part une fois par conversation, après avoir cerné ce qui bloque." />
                </div>
              ) : null}
              {r.role === 'resource' ? (
                <div>
                  <Label htmlFor={`row-title-${r.id}`}>Titre</Label>
                  <Input
                    id={`row-title-${r.id}`}
                    value={r.title}
                    maxLength={80}
                    placeholder="Vidéo, comment faire plus de vues"
                    onChange={(e) => edit(r.id, { title: e.target.value })}
                  />
                </div>
              ) : null}
              <div>
                <Label htmlFor={`row-url-${r.id}`}>Lien</Label>
                <Input id={`row-url-${r.id}`} value={r.url} placeholder="https://..." onChange={(e) => edit(r.id, { url: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`row-when-${r.id}`}>{r.role === 'resource' ? 'Quand l’envoyer' : 'Quand le proposer'}</Label>
                <Input
                  id={`row-when-${r.id}`}
                  value={r.when}
                  maxLength={160}
                  placeholder={r.role === 'resource' ? 'quand ses vidéos ne font pas de vues' : 'quand le prospect demande le prix'}
                  onChange={(e) => edit(r.id, { when: e.target.value })}
                />
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" disabled={full} onClick={add}>
            <Plus size={14} className="mr-1" />
            {full ? 'Maximum atteint' : nextRole === 'resource' ? 'Ajouter une ressource' : 'Ajouter un lien'}
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
          setRows((list) => list.filter((x) => x.id !== deleteTarget?.id))
          setDeleteTarget(null)
        }}
        title="Supprimer cette ligne"
        message="L’assistant ne l’enverra plus. Pensez à enregistrer ensuite."
        confirmLabel="Supprimer"
        danger
      />
    </Card>
  )
}
