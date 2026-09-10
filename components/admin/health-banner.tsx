'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

async function fetchRecentErrorCount() {
  const supabase = createClient()
  const { data: seenRow } = await supabase.from('admin_health_seen').select('seen_at').maybeSingle()
  const dayAgo = Date.now() - 24 * 3600 * 1000
  const seenAt = seenRow?.seen_at ? new Date(seenRow.seen_at).getTime() : 0
  const cutoff = new Date(Math.max(seenAt, dayAgo)).toISOString()
  const { count } = await supabase
    .from('system_events')
    .select('id', { count: 'exact', head: true })
    .eq('level', 'error')
    .gt('created_at', cutoff)
  return count ?? 0
}

export function AdminHealthBanner() {
  const { data } = useQuery({
    queryKey: ['admin-health-banner'],
    queryFn: fetchRecentErrorCount,
    refetchInterval: 60_000,
  })

  if (!data) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-danger/15 px-4 py-2 text-sm text-ink">
      <span className="flex items-center gap-2">
        <AlertTriangle size={15} className="shrink-0 text-danger" />
        {data} erreur{data > 1 ? 's' : ''} plateforme récente{data > 1 ? 's' : ''}.
      </span>
      <Link href="/app/admin/health" className="text-sm font-medium text-primary underline">
        Voir Santé
      </Link>
    </div>
  )
}
