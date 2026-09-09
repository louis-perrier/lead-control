'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { Download, MessageCircle, Plus, Upload } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useInvalidate } from '@/lib/queries'
import type { Contact } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { formatRelative } from '@/lib/utils'

const STATUS: Record<Contact['status'], { label: string; tone: 'muted' | 'neutral' | 'primary' | 'warning' | 'success' | 'danger' }> = {
  new: { label: 'Nouveau', tone: 'muted' },
  contacted: { label: 'Contacté', tone: 'neutral' },
  replied: { label: 'A répondu', tone: 'primary' },
  booked: { label: 'RDV pris', tone: 'warning' },
  won: { label: 'Gagné', tone: 'success' },
  lost: { label: 'Perdu', tone: 'danger' },
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase())
  const col = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)))
  const iName = col(['nom', 'name'])
  const iHandle = col(['instagram', 'handle'])
  const iPhone = col(['telephone', 'téléphone', 'phone'])
  const iEmail = col(['email', 'mail'])
  const rows: { full_name: string | null; instagram_handle: string | null; phone_e164: string | null; email: string | null }[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((c) => c.trim())
    const row = {
      full_name: iName >= 0 ? cells[iName] || null : null,
      instagram_handle: iHandle >= 0 ? cells[iHandle]?.replace(/^@/, '') || null : null,
      phone_e164: iPhone >= 0 ? cells[iPhone] || null : null,
      email: iEmail >= 0 ? cells[iEmail] || null : null,
    }
    if (row.full_name || row.instagram_handle || row.phone_e164 || row.email) rows.push(row)
  }
  return rows
}

export default function ContactsPage() {
  const toast = useToast()
  const invalidate = useInvalidate()
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', instagram_handle: '', phone_e164: '', email: '', notes: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(500)
      return (data ?? []) as Contact[]
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts ?? []
    return (contacts ?? []).filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.instagram_handle?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    )
  }, [contacts, search])

  async function addContact() {
    if (!form.full_name.trim() && !form.instagram_handle.trim()) {
      toast('Renseignez au moins un nom ou un handle Instagram.', 'error')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('contacts').insert({
      user_id: user?.id,
      full_name: form.full_name.trim() || null,
      instagram_handle: form.instagram_handle.trim().replace(/^@/, '') || null,
      phone_e164: form.phone_e164.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      source: 'manual',
    })
    setSaving(false)
    if (error) {
      toast('Impossible d’ajouter ce contact.', 'error')
      return
    }
    toast('Contact ajouté.')
    setForm({ full_name: '', instagram_handle: '', phone_e164: '', email: '', notes: '' })
    setAddOpen(false)
    invalidate('contacts')
  }

  function exportCsv() {
    const header = 'nom;instagram;telephone;email;statut;notes'
    const lines = (contacts ?? []).map((c) =>
      [c.full_name, c.instagram_handle, c.phone_e164, c.email, STATUS[c.status]?.label, c.notes]
        .map((v) => (v ?? '').replaceAll(';', ','))
        .join(';'),
    )
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts-leadcontrol.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importCsv(file: File) {
    const rows = parseCsv(await file.text())
    if (!rows.length) {
      toast('Aucun contact reconnu dans ce fichier.', 'error')
      return
    }
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    let imported = 0
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50).map((r) => ({ ...r, user_id: user?.id, source: 'csv_import' }))
      const { error } = await supabase.from('contacts').insert(batch)
      if (!error) imported += batch.length
    }
    toast(`${imported} contact${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''}.`)
    invalidate('contacts')
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="mt-1 text-sm text-muted">
            Vos prospects, synchronisés depuis vos conversations Instagram.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={15} />
            Importer CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!contacts?.length}>
            <Download size={15} />
            Exporter
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={15} />
            Ajouter
          </Button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importCsv(f)
          e.target.value = ''
        }}
      />

      <div className="mt-5">
        <Input
          placeholder="Rechercher un nom, un handle ou un email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card className="mt-4 overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Aucun contact ne correspond' : 'Aucun contact pour l’instant'}
            description={
              search
                ? 'Essayez une autre recherche.'
                : 'Les contacts se créent automatiquement quand un prospect vous écrit, ou ajoutez-les à la main.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Nom</th>
                  <th className="px-4 py-2.5 font-medium">Instagram</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 font-medium">Dernière interaction</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-bg/60">
                    <td className="px-4 py-2.5 font-medium">{c.full_name || 'Sans nom'}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {c.instagram_handle ? `@${c.instagram_handle}` : ''}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS[c.status]?.tone ?? 'neutral'}>
                        {STATUS[c.status]?.label ?? c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{formatRelative(c.last_interaction_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {c.conversation_id ? (
                        <Link
                          href={`/app/inbox?c=${c.conversation_id}`}
                          className="inline-flex items-center gap-1 text-primary hover:text-primary-hover"
                        >
                          <MessageCircle size={15} />
                          Conversation
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Ajouter un contact"
        footer={
          <Button onClick={addContact} disabled={saving}>
            {saving ? 'Ajout…' : 'Ajouter'}
          </Button>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="c-name">Nom complet</Label>
            <Input id="c-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="c-handle">Handle Instagram</Label>
            <Input id="c-handle" placeholder="@prospect" value={form.instagram_handle} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-phone">Téléphone</Label>
              <Input id="c-phone" value={form.phone_e164} onChange={(e) => setForm({ ...form, phone_e164: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Dialog>
    </div>
  )
}
