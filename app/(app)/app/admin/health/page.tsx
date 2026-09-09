'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { formatRelative } from '@/lib/utils'

type SystemEvent = {
  id: number
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
  created_at: string
}

type ExpiredChannel = { id: string; handle: string | null; user_id: string }

type FeedbackRow = {
  id: string
  rating: number | null
  message: string
  created_at: string
}

const LEVEL_TONE = { info: 'neutral', warn: 'warning', error: 'danger' } as const

export default function AdminHealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const supabase = createClient()
      const [events, channels, feedback] = await Promise.all([
        supabase
          .from('system_events')
          .select('id, level, source, message, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('channel_accounts').select('id, handle, user_id').eq('status', 'expired'),
        supabase
          .from('feedback')
          .select('id, rating, message, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      return {
        events: (events.data ?? []) as SystemEvent[],
        channels: (channels.data ?? []) as ExpiredChannel[],
        feedback: (feedback.data ?? []) as FeedbackRow[],
      }
    },
  })

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Événements système" description="Les 50 derniers, erreurs en premier lieu à surveiller" />
        {data.events.length === 0 ? (
          <EmptyState title="Aucun événement" description="Rien à signaler pour le moment." />
        ) : (
          <div className="divide-y divide-border/60">
            {data.events.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <Badge tone={LEVEL_TONE[e.level]}>{e.level}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="break-words">{e.message}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {e.source} · {formatRelative(e.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Comptes Instagram expirés" description="Ces clients doivent reconnecter leur compte" />
        {data.channels.length === 0 ? (
          <EmptyState title="Aucun compte expiré" />
        ) : (
          <div className="divide-y divide-border/60">
            {data.channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{c.handle ? `@${c.handle}` : c.id}</span>
                <span className="text-xs text-muted">{c.user_id}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Avis des utilisateurs" />
        {data.feedback.length === 0 ? (
          <EmptyState title="Aucun avis pour l'instant" />
        ) : (
          <div className="divide-y divide-border/60">
            {data.feedback.map((f) => (
              <div key={f.id} className="px-4 py-2.5 text-sm">
                {f.rating ? (
                  <span className="text-warning">
                    {'★'.repeat(f.rating)}
                    <span className="text-border">{'★'.repeat(5 - f.rating)}</span>
                  </span>
                ) : null}
                <p className="mt-0.5">{f.message}</p>
                <p className="mt-0.5 text-xs text-muted">{formatRelative(f.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
