'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useInvalidate, useRealProfile } from '@/lib/queries'
import { canAdminister } from '@/lib/features'
import type { Assistant } from '@/lib/types'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const PRESETS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
  { days: 365, label: '1 an' },
] as const

function formatCents(euros: number) {
  return euros.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10)
}

type ByClientRow = { user_id: string; email: string; count: number }
type ByAssistantRow = { assistant_id: string | null; count: number }
type UsageReport = { total: number; by_client?: ByClientRow[]; by_assistant?: ByAssistantRow[] }

function AnalyticsContent() {
  const searchParams = useSearchParams()
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: me } = useRealProfile()
  const editable = canAdminister(me)

  const [userId, setUserId] = useState<string>(searchParams.get('user') ?? '')
  const [since, setSince] = useState(() => toDateInput(new Date(Date.now() - 30 * 86400000)))
  const [until, setUntil] = useState(() => toDateInput(new Date()))
  const [priceDraft, setPriceDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function applyPreset(days: number) {
    setSince(toDateInput(new Date(Date.now() - days * 86400000)))
    setUntil(toDateInput(new Date()))
  }

  const { data: clients } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('user_id, email').eq('role', 'user').order('email')
      return (data ?? []) as { user_id: string; email: string }[]
    },
  })

  const priceQuery = useQuery({
    queryKey: ['platform-setting', 'cost_per_message_cents'],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'cost_per_message_cents')
        .maybeSingle()
      return data?.value ?? null
    },
  })
  const savedPrice = priceQuery.data != null ? Number(priceQuery.data) : null
  const priceCents = priceDraft !== '' ? Number(priceDraft) : (savedPrice ?? 0)

  const sinceIso = useMemo(() => new Date(`${since}T00:00:00`).toISOString(), [since])
  const untilIso = useMemo(() => new Date(`${until}T23:59:59`).toISOString(), [until])

  const reportQuery = useQuery({
    queryKey: ['admin-message-usage-report', userId || null, sinceIso, untilIso],
    queryFn: async (): Promise<UsageReport> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('admin_message_usage_report', {
        p_user: userId || null,
        p_since: sinceIso,
        p_until: untilIso,
      })
      if (error) throw error
      return data as UsageReport
    },
  })

  const { data: assistants } = useQuery({
    queryKey: ['admin-analytics-assistants', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Assistant[]> => {
      const supabase = createClient()
      const { data } = await supabase.from('assistants').select('*').eq('user_id', userId)
      return (data ?? []) as Assistant[]
    },
  })

  async function savePrice() {
    const value = Number(priceDraft)
    if (!Number.isFinite(value) || value < 0) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('platform_settings')
      .upsert({ key: 'cost_per_message_cents', value: String(value), updated_at: new Date().toISOString() })
    setSaving(false)
    if (error) {
      toast('Impossible d’enregistrer ce prix.', 'error')
      return
    }
    toast('Prix par message enregistré.')
    setPriceDraft('')
    invalidate('platform-setting')
  }

  const total = reportQuery.data?.total ?? 0
  const estimatedEuros = (total * priceCents) / 100

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Analyse des messages"
          description="Volume de réponses envoyées par l'assistant sur une période, et coût estimé."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="client">Client</Label>
              <select
                id="client"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">Tous les clients</option>
                {(clients ?? []).map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="costPerMessage">Prix par message (centimes)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="costPerMessage"
                  type="number"
                  step="0.1"
                  min="0"
                  value={priceDraft !== '' ? priceDraft : (savedPrice != null ? String(savedPrice) : '')}
                  onChange={(e) => setPriceDraft(e.target.value)}
                  placeholder="3"
                  disabled={!editable}
                  className="w-28"
                />
                <Button size="sm" variant="secondary" onClick={savePrice} disabled={!editable || saving || priceDraft === ''}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => applyPreset(p.days)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="since">Du</Label>
              <Input id="since" type="date" value={since} onChange={(e) => setSince(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label htmlFor="until">Au</Label>
              <Input id="until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="w-40" />
            </div>
          </div>

          {reportQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : reportQuery.isError ? (
            <p className="text-sm text-danger">Impossible de charger ce rapport.</p>
          ) : total === 0 ? (
            <EmptyState title="Aucune réponse envoyée sur cette période" />
          ) : (
            <>
              <div>
                <p className="text-sm">
                  Coût estimé du {new Date(since).toLocaleDateString('fr-FR')} au {new Date(until).toLocaleDateString('fr-FR')} :{' '}
                  {total.toLocaleString('fr-FR')} × {priceCents.toLocaleString('fr-FR')}¢ ={' '}
                  <span className="font-semibold">{formatCents(estimatedEuros)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Estimation manuelle, à ne pas confondre avec le coût réel basé sur les tokens consommés.
                </p>
              </div>

              {userId ? (
                <div className="divide-y divide-border/60 rounded-[10px] border border-border">
                  {(reportQuery.data?.by_assistant ?? []).map((row) => {
                    const assistant = assistants?.find((a) => a.id === row.assistant_id)
                    return (
                      <div key={row.assistant_id ?? 'sans-assistant'} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span>{assistant?.name ?? 'Assistant supprimé'}</span>
                        <span className="tabular-nums text-muted">{row.count}</span>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between px-4 py-2 text-sm font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{total}</span>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/60 rounded-[10px] border border-border">
                  {(reportQuery.data?.by_client ?? []).map((row) => (
                    <div key={row.user_id} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span>{row.email}</span>
                      <span className={cn('tabular-nums text-muted')}>{row.count}</span>
                    </div>
                  ))}
                  {(reportQuery.data?.by_client?.length ?? 0) >= 200 ? (
                    <p className="px-4 py-2 text-xs text-muted">Classement limité aux 200 plus gros clients.</p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

export default function AdminAnalyticsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AnalyticsContent />
    </Suspense>
  )
}
