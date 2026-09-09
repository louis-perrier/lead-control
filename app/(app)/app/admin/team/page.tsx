'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useInvalidate, useProfile } from '@/lib/queries'
import type { Profile } from '@/lib/types'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label } from '@/components/ui/input'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'

export default function AdminTeamPage() {
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: me } = useProfile()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'admin'>('viewer')
  const [adding, setAdding] = useState(false)

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['admin-team'],
    queryFn: async (): Promise<Profile[]> => {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('*').order('created_at')
      return (data ?? []) as Profile[]
    },
  })

  if (me && me.role !== 'owner') {
    return <EmptyState title="Réservé au propriétaire" description="Seul le propriétaire du compte gère les rôles de l'équipe." />
  }

  async function setUserRole(userId: string, newRole: 'user' | 'viewer' | 'admin') {
    const supabase = createClient()
    const { error } = await supabase.rpc('admin_set_role', { p_user: userId, p_role: newRole })
    if (error) {
      toast('Impossible de modifier ce rôle.', 'error')
      return
    }
    toast('Rôle mis à jour.')
    invalidate('admin-team', 'admin-users')
  }

  async function addByEmail() {
    const target = (profiles ?? []).find((p) => p.email.toLowerCase() === email.trim().toLowerCase())
    if (!target) {
      toast('Aucun compte avec cet email. La personne doit d’abord créer son compte.', 'error')
      return
    }
    setAdding(true)
    await setUserRole(target.user_id, role)
    setAdding(false)
    setEmail('')
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  const sorted = [...(profiles ?? [])].sort((a, b) => {
    const weight = (p: Profile) => (p.role === 'owner' ? 0 : p.role === 'admin' ? 1 : p.role === 'viewer' ? 2 : 3)
    return weight(a) - weight(b)
  })

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Ajouter un membre" description="Le compte doit déjà exister sur LeadControl" />
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Label htmlFor="team-email">Email du compte</Label>
            <Input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="team-role">Rôle</Label>
            <select
              id="team-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'viewer' | 'admin')}
              className="h-10 rounded-[10px] border border-border bg-surface px-3 text-sm"
            >
              <option value="viewer">Lecture seule</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button onClick={addByEmail} disabled={adding || !email.trim()}>
            {adding ? 'Ajout…' : 'Ajouter'}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Membres" />
        <div className="divide-y divide-border/60">
          {sorted.map((p) => (
            <div key={p.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{p.email}</span>
                <Badge tone={p.role === 'user' ? 'muted' : 'primary'} className="ml-2">
                  {p.role === 'owner'
                    ? 'Propriétaire'
                    : p.role === 'admin'
                      ? 'Admin'
                      : p.role === 'viewer'
                        ? 'Lecture'
                        : 'Client'}
                </Badge>
              </div>
              {p.role !== 'owner' ? (
                <div className="flex gap-1">
                  <Button size="sm" variant={p.role === 'viewer' ? 'primary' : 'ghost'} onClick={() => setUserRole(p.user_id, 'viewer')}>
                    Lecture
                  </Button>
                  <Button size="sm" variant={p.role === 'admin' ? 'primary' : 'ghost'} onClick={() => setUserRole(p.user_id, 'admin')}>
                    Admin
                  </Button>
                  {p.role !== 'user' ? (
                    <Button size="sm" variant="ghost" onClick={() => setUserRole(p.user_id, 'user')}>
                      Retirer
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
