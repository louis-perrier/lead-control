'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Skeleton } from '@/components/ui/misc'

type SubRow = { user_id: string; status: string; agents_settings_qty: number }

const ROLE_LABEL: Record<Profile['role'], string> = {
  user: 'Client',
  viewer: 'Lecture',
  admin: 'Admin',
  owner: 'Propriétaire',
}

function planLabel(profile: Profile, sub: SubRow | undefined) {
  if (sub) return `Basic x${sub.agents_settings_qty}`
  if (profile.plan_override === 'free_unlimited') return 'Accès libre'
  if (profile.plan_override === 'beta_byok') return 'Bêta BYOK'
  return 'Aucun'
}

export default function AdminUsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const supabase = createClient()
      const [profilesRes, subsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase
          .from('paiement_subscriptions')
          .select('user_id, status, agents_settings_qty')
          .in('status', ['active', 'trialing']),
      ])
      return {
        profiles: (profilesRes.data ?? []) as Profile[],
        subs: (subsRes.data ?? []) as SubRow[],
      }
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }

  const profiles = data?.profiles ?? []
  if (profiles.length === 0) {
    return (
      <Card>
        <EmptyState title="Aucun client inscrit" />
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Rôle</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 font-medium">Crédits consommés</th>
              <th className="px-4 py-2.5 font-medium">Inscrit le</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const sub = data?.subs.find((s) => s.user_id === p.user_id)
              return (
                <tr key={p.user_id} className="border-b border-border/60 last:border-0 hover:bg-bg/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/app/admin/users/${p.user_id}`} className="font-medium text-primary hover:text-primary-hover">
                      {p.email}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={p.role === 'user' ? 'muted' : 'primary'}>{ROLE_LABEL[p.role]}</Badge>
                  </td>
                  <td className="px-4 py-2.5">{planLabel(p, sub)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{p.credits_consumed_in_period}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {new Date(p.created_at).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
