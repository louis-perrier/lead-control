'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useEffectiveUserId } from '@/lib/queries'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import { RoiKpiCard } from './roi-kpi-card'

const PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
] as const

type ConversationRow = {
  id: number
  last_message_at: string | null
  heat_tag: string
}

type DailyRow = {
  day: string
  inbound: number
  agent_replies: number
  human_replies: number
}

type DealRow = {
  amount: number | null
  status: string
  closed_at: string | null
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardBody className="py-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </CardBody>
    </Card>
  )
}

export function StatsContent() {
  const [days, setDays] = useState<7 | 30 | 90>(7)
  const since = useMemo(() => new Date(Date.now() - days * 24 * 3600 * 1000), [days])
  const effectiveUserId = useEffectiveUserId()

  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ['stats-conversations', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<ConversationRow[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('conversations')
        .select('id, last_message_at, heat_tag')
        .eq('user_id', effectiveUserId!)
        .limit(2000)
      return (data ?? []) as ConversationRow[]
    },
  })

  const { data: daily, isLoading: loadingDaily } = useQuery({
    queryKey: ['stats-daily', days, effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<DailyRow[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('v_daily_message_counts')
        .select('day, inbound, agent_replies, human_replies')
        .eq('user_id', effectiveUserId!)
        .gte('day', since.toISOString())
        .order('day', { ascending: true })
      return (data ?? []) as DailyRow[]
    },
  })

  const { data: deals, isLoading: loadingDeals } = useQuery({
    queryKey: ['stats-deals', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<DealRow[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('deals')
        .select('amount, status, closed_at')
        .eq('user_id', effectiveUserId!)
        .limit(2000)
      return (data ?? []) as DealRow[]
    },
  })

  const loading = loadingConvs || loadingDaily || loadingDeals

  const stats = useMemo(() => {
    const sinceMs = since.getTime()
    const active = (conversations ?? []).filter(
      (c) => c.last_message_at && Date.parse(c.last_message_at) >= sinceMs,
    ).length
    const hot = (conversations ?? []).filter((c) => c.heat_tag === 'hot').length
    const inbound = (daily ?? []).reduce((sum, d) => sum + Number(d.inbound ?? 0), 0)
    const replies = (daily ?? []).reduce((sum, d) => sum + Number(d.agent_replies ?? 0), 0)
    const closedInWindow = (deals ?? []).filter((d) => d.closed_at && Date.parse(d.closed_at) >= sinceMs)
    const revenue = closedInWindow
      .filter((d) => d.status === 'won')
      .reduce((sum, d) => sum + Number(d.amount ?? 0), 0)
    const wonCount = closedInWindow.filter((d) => d.status === 'won').length
    const lostCount = closedInWindow.filter((d) => d.status === 'lost').length
    const closeRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0
    return { active, hot, inbound, replies, revenue, closeRate }
  }, [conversations, daily, deals, since])

  const chartData = useMemo(
    () =>
      (daily ?? []).map((d) => ({
        day: new Date(d.day).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        recus: Number(d.inbound ?? 0),
        reponses: Number(d.agent_replies ?? 0),
      })),
    [daily],
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if ((conversations?.length ?? 0) === 0) {
    return (
      <Card>
        <EmptyState
          title="Aucune donnée pour l'instant"
          description="Les statistiques apparaissent dès que votre assistant reçoit ses premiers messages."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium',
              days === p.days ? 'bg-primary text-white' : 'bg-surface text-muted border border-border hover:text-ink',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RoiKpiCard label="Taux de close" value={stats.closeRate} format="percent" percentDecimals={1} hint={`sur ${days} jours`} />
        <RoiKpiCard label="CA généré" value={stats.revenue} format="currency" highlight hint={`sur ${days} jours`} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Conversations" value={String(conversations?.length ?? 0)} hint="au total" />
        <StatCard label="Conversations actives" value={String(stats.active)} hint={`sur ${days} jours`} />
        <StatCard label="Messages reçus" value={stats.inbound.toLocaleString('fr-FR')} hint={`sur ${days} jours`} />
        <StatCard label="Réponses de l'assistant" value={stats.replies.toLocaleString('fr-FR')} hint={`sur ${days} jours`} />
        <StatCard label="Prospects chauds" value={String(stats.hot)} hint="détectés par l'assistant" />
      </div>

      <Card>
        <CardHeader title="Messages par jour" description="Reçus et réponses de l'assistant" />
        <CardBody>
          {chartData.length === 0 ? (
            <EmptyState title="Aucun message sur la période" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#e6ebf2" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#5b667a' }}
                    axisLine={{ stroke: '#e6ebf2' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#5b667a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      String(value ?? 0),
                      name === 'recus' ? 'Reçus' : 'Réponses',
                    ]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e6ebf2', fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="recus" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="reponses" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
