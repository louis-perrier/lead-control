'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardBody } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { formatCurrency } from '@/lib/utils'

type AdminStats = {
  users: number
  active_subscriptions: number
  mrr_eur: number
  assistants_active: number
  conversations: number
  messages_24h: number
  agent_replies_24h: number
  errors_24h: number
  ai_cost_month_usd: number
  expired_channels: number
}

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <Card className={alert ? 'border-danger/40' : undefined}>
      <CardBody className="py-3.5">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${alert ? 'text-danger' : ''}`}>{value}</p>
      </CardBody>
    </Card>
  )
}

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async (): Promise<AdminStats> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('admin_dashboard_stats')
      if (error) throw error
      return data as AdminStats
    },
  })

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard label="Clients inscrits" value={String(data.users)} />
      <StatCard label="Abonnements actifs" value={String(data.active_subscriptions)} />
      <StatCard label="MRR" value={formatCurrency(data.mrr_eur)} />
      <StatCard label="Assistants actifs" value={String(data.assistants_active)} />
      <StatCard label="Conversations" value={String(data.conversations)} />
      <StatCard label="Messages sur 24 h" value={String(data.messages_24h)} />
      <StatCard label="Réponses IA sur 24 h" value={String(data.agent_replies_24h)} />
      <StatCard label="Coût IA du mois" value={`${Number(data.ai_cost_month_usd).toFixed(2)} $`} />
      <StatCard
        label="Erreurs sur 24 h"
        value={String(data.errors_24h)}
        alert={data.errors_24h > 0}
      />
      <StatCard
        label="Comptes Instagram expirés"
        value={String(data.expired_channels)}
        alert={data.expired_channels > 0}
      />
    </div>
  )
}
