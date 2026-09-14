'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, MessageCircle, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEffectiveUserId, useFlags, useInvalidate, useMyOverrides, useProfile } from '@/lib/queries'
import { hasFeature } from '@/lib/features'
import { useAvatarUrls } from '@/lib/avatars'
import { PROSPECT_STAGES, nextAction, prospectStage } from '@/lib/prospects'
import type { NextAction, ProspectStage } from '@/lib/prospects'
import type { Conversation } from '@/lib/types'
import { cn, formatDateTime, formatRelative } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Avatar, EmptyState, Skeleton } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { HeatBadge } from '@/components/inbox/state-banner'
import { ProspectDetails } from '@/components/prospects/prospect-details'

type Row = { conv: Conversation; stage: ProspectStage; action: NextAction | null }

const STAGE_TONE: Record<ProspectStage, 'muted' | 'neutral' | 'primary' | 'warning' | 'success' | 'danger'> = {
  new: 'muted',
  talking: 'neutral',
  qualified: 'primary',
  booked: 'warning',
  won: 'success',
  lost: 'danger',
  unqualified: 'muted',
}

function stageLabel(stage: ProspectStage) {
  return PROSPECT_STAGES.find((s) => s.key === stage)?.label ?? stage
}

function actionText(action: NextAction | null) {
  switch (action?.key) {
    case 'error':
      return 'Erreur à traiter'
    case 'awaiting_reply':
      return 'Attend votre réponse'
    case 'manual_followup':
      return 'À relancer'
    case 'followup_planned':
      return `Relance prévue ${formatDateTime(action.at)}`
    case 'assistant_replying':
      return 'L’assistant répond'
    case 'goal_reached':
      return 'Objectif atteint'
    case 'paused':
      return 'En pause'
    default:
      return 'Rien à faire'
  }
}

function ActionLabel({ action }: { action: NextAction | null }) {
  return (
    <span
      className={cn(
        'text-sm',
        action?.key === 'error'
          ? 'font-medium text-danger'
          : action?.needsCoach
            ? 'font-medium text-amber-700'
            : action?.key === 'goal_reached'
              ? 'text-success'
              : 'text-muted',
      )}
    >
      {actionText(action)}
    </span>
  )
}

function displayName(conv: Conversation) {
  return conv.contact_name ?? (conv.contact_handle ? `@${conv.contact_handle}` : 'Contact Instagram')
}

function useProspects() {
  const effectiveUserId = useEffectiveUserId()
  return useQuery({
    queryKey: ['prospects', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async () => {
      const supabase = createClient()
      const [convs, bookings, followups] = await Promise.all([
        supabase
          .from('conversations')
          .select('*')
          .eq('user_id', effectiveUserId!)
          .not('last_customer_message_at', 'is', null)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(500),
        supabase.from('bookings').select('conversation_id').eq('user_id', effectiveUserId!).eq('status', 'active'),
        supabase
          .from('followups')
          .select('conversation_id, scheduled_at')
          .eq('user_id', effectiveUserId!)
          .eq('status', 'pending')
          .order('scheduled_at', { ascending: true }),
      ])
      if (convs.error) throw convs.error
      const booked = new Set((bookings.data ?? []).map((b) => b.conversation_id as number))
      const followupAt = new Map<number, string>()
      for (const f of followups.data ?? []) {
        if (!followupAt.has(f.conversation_id)) followupAt.set(f.conversation_id, f.scheduled_at)
      }
      return { conversations: (convs.data ?? []) as Conversation[], booked, followupAt }
    },
  })
}

function exportCsv(rows: Row[]) {
  const cell = (v: string | null | undefined) => `"${(v ?? '').replaceAll('"', '""')}"`
  const header = 'nom;instagram;etape;temperature;dernier_echange;prochaine_action;resume;notes'
  const heat = { hot: 'chaud', warm: 'tiède', cold: 'froid', unknown: '' }
  const lines = rows.map(({ conv, stage, action }) =>
    [
      conv.contact_name,
      conv.contact_handle,
      stageLabel(stage),
      heat[conv.heat_tag],
      conv.last_message_at ? formatDateTime(conv.last_message_at) : '',
      actionText(action),
      conv.summary,
      conv.notes,
    ]
      .map(cell)
      .join(';'),
  )
  const blob = new Blob([`﻿${[header, ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'prospects-leadcontrol.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function ProspectDrawer({ row, onClose }: { row: Row; onClose: () => void }) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const [notes, setNotes] = useState(row.conv.notes ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = notes.trim() !== (row.conv.notes ?? '').trim()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function saveNotes() {
    setSaving(true)
    const { error } = await createClient()
      .from('conversations')
      .update({ notes: notes.trim() || null })
      .eq('id', row.conv.id)
    setSaving(false)
    if (error) {
      toast('Les notes n’ont pas pu être enregistrées.', 'error')
      return
    }
    toast('Notes enregistrées.')
    invalidate('prospects', 'conversations')
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`Fiche de ${displayName(row.conv)}`}
        className="animate-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-soft"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{displayName(row.conv)}</h2>
            <Badge tone={STAGE_TONE[row.stage]}>{stageLabel(row.stage)}</Badge>
          </div>
          <button onClick={onClose} aria-label="Fermer la fiche" className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="rounded-[10px] bg-bg px-3 py-2">
            <p className="text-xs text-muted">Prochaine action</p>
            <ActionLabel action={row.action} />
          </div>
          <ProspectDetails conversation={row.conv} />
          <div>
            <Label htmlFor="prospect-notes">Notes privées</Label>
            <Textarea
              id="prospect-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ce que vous voulez retenir sur ce prospect. L’assistant ne les lit pas."
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={saveNotes} disabled={!dirty || saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer les notes'}
              </Button>
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 py-3">
          <Link
            href={`/app/inbox?c=${row.conv.id}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            <MessageCircle size={15} />
            Ouvrir la conversation
          </Link>
        </div>
      </aside>
    </div>
  )
}

export default function ProspectsPage() {
  const { data, isLoading, isError, refetch } = useProspects()
  const { data: flags } = useFlags()
  const { data: profile } = useProfile()
  const { data: overrides } = useMyOverrides()
  const humanAgent = hasFeature('human_agent', flags, profile, overrides)
  const canExport = hasFeature('contacts_import', flags, profile, overrides)
  const [stageFilter, setStageFilter] = useState<ProspectStage | 'all'>('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [now] = useState(() => Date.now())

  const rows = useMemo<Row[]>(
    () =>
      (data?.conversations ?? []).map((conv) => ({
        conv,
        stage: prospectStage(conv, data!.booked.has(conv.id)),
        action: nextAction(conv, { followupAt: data!.followupAt.get(conv.id) ?? null, humanAgent, now }),
      })),
    [data, humanAgent, now],
  )

  const counts = useMemo(() => {
    const map = new Map<ProspectStage, number>()
    for (const row of rows) map.set(row.stage, (map.get(row.stage) ?? 0) + 1)
    return map
  }, [rows])

  const avatars = useAvatarUrls(rows.map((row) => row.conv.contact_avatar_path))

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(
      (row) =>
        (stageFilter === 'all' || row.stage === stageFilter) &&
        (!term ||
          (row.conv.contact_name ?? '').toLowerCase().includes(term) ||
          (row.conv.contact_handle ?? '').toLowerCase().includes(term)),
    )
  }, [rows, stageFilter, search])

  const toHandle = rows.filter((row) => row.action?.needsCoach).length
  const openRow = rows.find((row) => row.conv.id === openId) ?? null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Prospects</h1>
          <p className="mt-1 text-sm text-muted">
            Tous les prospects qui vous ont écrit sur Instagram, leur étape et ce qu’il reste à faire.
            {toHandle > 0 ? ` ${toHandle} demande${toHandle > 1 ? 'nt' : ''} votre attention.` : ''}
          </p>
        </div>
        {canExport ? (
          <Button variant="secondary" size="sm" onClick={() => exportCsv(visible)} disabled={visible.length === 0}>
            <Download size={15} />
            Exporter
          </Button>
        ) : null}
      </div>

      <div className="scrollbar-hide mt-5 flex gap-1.5 overflow-x-auto pb-0.5">
        {[{ key: 'all' as const, plural: 'Tous' }, ...PROSPECT_STAGES].map((stage) => {
          const count = stage.key === 'all' ? rows.length : counts.get(stage.key) ?? 0
          return (
            <button
              key={stage.key}
              onClick={() => setStageFilter(stage.key)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium',
                stageFilter === stage.key ? 'bg-primary text-white' : 'bg-surface text-muted ring-1 ring-border hover:text-ink',
              )}
            >
              {stage.plural}
              <span className="ml-1 tabular-nums opacity-80">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="relative mt-3 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom ou un pseudo"
          className="pl-9"
          aria-label="Rechercher un prospect"
        />
      </div>

      <Card className="mt-4 overflow-hidden hover:translate-y-0 hover:shadow-soft">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            title="Les prospects n’ont pas pu être chargés"
            description="Vérifiez votre connexion puis réessayez."
            action={
              <Button size="sm" variant="secondary" onClick={() => refetch()}>
                Réessayer
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'Aucun prospect pour l’instant' : 'Aucun prospect ne correspond'}
            description={
              rows.length === 0
                ? 'Chaque personne qui vous écrit sur Instagram apparaît ici automatiquement.'
                : 'Changez de filtre ou de recherche.'
            }
          />
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Prospect</th>
                  <th className="px-4 py-2.5 font-medium">Étape</th>
                  <th className="px-4 py-2.5 font-medium">Température</th>
                  <th className="px-4 py-2.5 font-medium">Dernier échange</th>
                  <th className="px-4 py-2.5 font-medium">Prochaine action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.conv.id}
                    tabIndex={0}
                    onClick={() => setOpenId(row.conv.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenId(row.conv.id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-bg/60 focus-visible:bg-bg focus-visible:outline-none"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.conv.contact_name ?? row.conv.contact_handle} src={row.conv.contact_avatar_path ? avatars[row.conv.contact_avatar_path] : null} className="size-8" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{displayName(row.conv)}</p>
                          {row.conv.contact_name && row.conv.contact_handle ? (
                            <p className="truncate text-xs text-muted">@{row.conv.contact_handle}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STAGE_TONE[row.stage]}>{stageLabel(row.stage)}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <HeatBadge conv={row.conv} />
                    </td>
                    <td className="px-4 py-2.5 text-muted">{formatRelative(row.conv.last_message_at)}</td>
                    <td className="px-4 py-2.5">
                      <ActionLabel action={row.action} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border/60 md:hidden">
              {visible.map((row) => (
                <li key={row.conv.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(row.conv.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg/60"
                  >
                    <Avatar name={row.conv.contact_name ?? row.conv.contact_handle} src={row.conv.contact_avatar_path ? avatars[row.conv.contact_avatar_path] : null} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{displayName(row.conv)}</span>
                        <Badge tone={STAGE_TONE[row.stage]}>{stageLabel(row.stage)}</Badge>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <ActionLabel action={row.action} />
                        <span className="shrink-0 text-xs text-muted">{formatRelative(row.conv.last_message_at)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {openRow ? <ProspectDrawer key={openRow.conv.id} row={openRow} onClose={() => setOpenId(null)} /> : null}
    </div>
  )
}
