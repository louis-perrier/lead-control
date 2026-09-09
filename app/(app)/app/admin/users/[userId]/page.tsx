'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useFlags, useInvalidate, useProfile } from '@/lib/queries'
import { canAdminister } from '@/lib/features'
import type { Assistant, ChannelAccount, Profile } from '@/lib/types'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { Input, Label } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn, formatRelative } from '@/lib/utils'

function formatCents(euros: number) {
  return euros.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
}

const MESSAGE_COST_PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
] as const

type UsageRow = {
  id: number
  model: string
  input_tokens: number
  output_tokens: number
  key_source: string
  cost_estimate_usd: number | null
  created_at: string
}

type OverrideRow = { key: string; enabled: boolean }

const CHANNEL_STATUS: Record<ChannelAccount['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  connected: { label: 'Connecté', tone: 'success' },
  expired: { label: 'Expiré', tone: 'warning' },
  error: { label: 'En erreur', tone: 'danger' },
  disconnected: { label: 'Déconnecté', tone: 'muted' },
}

function MessageCostCard({ userId, assistants, editable }: { userId: string; assistants: Assistant[]; editable: boolean }) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [priceDraft, setPriceDraft] = useState('')
  const [saving, setSaving] = useState(false)

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
  const priceCents = priceDraft !== '' ? Number(priceDraft) : savedPrice ?? 0

  const messagesQuery = useQuery({
    queryKey: ['admin-user-messages', userId, days],
    queryFn: async () => {
      const supabase = createClient()
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const { data } = await supabase
        .from('conversation_messages')
        .select('id, conversations!inner(assistant_id, user_id)')
        .eq('author_type', 'agent')
        .gte('sent_at', since)
        .eq('conversations.user_id', userId)
      const counts = new Map<string, number>()
      for (const row of (data ?? []) as { conversations: { assistant_id: string | null } | { assistant_id: string | null }[] | null }[]) {
        const rel = row.conversations
        const assistantId = Array.isArray(rel) ? rel[0]?.assistant_id : rel?.assistant_id
        if (!assistantId) continue
        counts.set(assistantId, (counts.get(assistantId) ?? 0) + 1)
      }
      return counts
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

  const counts = messagesQuery.data
  const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0
  const estimatedEuros = (total * priceCents) / 100

  return (
    <Card>
      <CardHeader
        title="Coût par volume de messages"
        description="Nombre de réponses envoyées par l'assistant sur la période, avec un prix par message que vous fixez vous-même."
      />
      <CardBody className="space-y-4">
        <div className="flex gap-1.5">
          {MESSAGE_COST_PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
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

        {messagesQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : total === 0 ? (
          <EmptyState title="Aucune réponse envoyée sur cette période" />
        ) : (
          <div className="divide-y divide-border/60 rounded-[10px] border border-border">
            {assistants
              .filter((a) => counts?.has(a.id))
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{a.name}</span>
                  <span className="tabular-nums text-muted">{counts?.get(a.id) ?? 0}</span>
                </div>
              ))}
            <div className="flex items-center justify-between px-4 py-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{total}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2" title={editable ? undefined : 'Réservé aux admins'}>
          <div>
            <Label htmlFor="costPerMessage">Prix par message (centimes)</Label>
            <Input
              id="costPerMessage"
              type="number"
              step="0.1"
              min="0"
              value={priceDraft !== '' ? priceDraft : savedPrice != null ? String(savedPrice) : ''}
              onChange={(e) => setPriceDraft(e.target.value)}
              placeholder="3"
              disabled={!editable}
              className="w-28"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={savePrice} disabled={!editable || saving || priceDraft === ''}>
            {saving ? 'Enregistrement…' : 'Enregistrer ce prix'}
          </Button>
        </div>

        <div>
          <p className="text-sm">
            Coût estimé sur {days} jours : {total} × {priceCents.toLocaleString('fr-FR')}¢ ={' '}
            <span className="font-semibold">{formatCents(estimatedEuros)}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Estimation manuelle, à ne pas confondre avec le coût réel ci-dessus basé sur les tokens consommés.
          </p>
        </div>
      </CardBody>
    </Card>
  )
}

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>()
  const userId = params.userId
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: me } = useProfile()
  const { data: flags } = useFlags()
  const [creditsDelta, setCreditsDelta] = useState('')
  const editable = canAdminister(me)
  const lockHint = editable ? undefined : 'Réservé aux admins'

  const { data, isLoading } = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: async () => {
      const supabase = createClient()
      const [profile, channels, assistants, usage, overrides] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('channel_accounts').select('*').eq('user_id', userId),
        supabase.from('assistants').select('*').eq('user_id', userId),
        supabase
          .from('ai_usage')
          .select('id, model, input_tokens, output_tokens, key_source, cost_estimate_usd, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('user_feature_overrides').select('key, enabled').eq('user_id', userId),
      ])
      return {
        profile: profile.data as Profile | null,
        channels: (channels.data ?? []) as ChannelAccount[],
        assistants: (assistants.data ?? []) as Assistant[],
        usage: (usage.data ?? []) as UsageRow[],
        overrides: (overrides.data ?? []) as OverrideRow[],
      }
    },
  })

  async function rpc(name: string, args: Record<string, unknown>, success: string) {
    const supabase = createClient()
    const { error } = await supabase.rpc(name, args)
    if (error) {
      toast(error.message.includes('accès') ? 'Accès refusé.' : 'L’action a échoué.', 'error')
      return
    }
    toast(success)
    invalidate('admin-user', 'admin-users', 'admin-stats')
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />
  const profile = data?.profile
  if (!profile) {
    return <EmptyState title="Client introuvable" />
  }

  const overrideOf = (key: string) => data?.overrides.find((o) => o.key === key)

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold">{profile.email}</p>
            <p className="mt-0.5 text-sm text-muted">
              Inscrit le {new Date(profile.created_at).toLocaleDateString('fr-FR')} · rôle {profile.role} ·{' '}
              {profile.credits_consumed_in_period} crédits consommés
            </p>
          </div>
          <Badge tone={profile.plan_override ? 'primary' : 'muted'}>
            {profile.plan_override === 'free_unlimited'
              ? 'Accès libre'
              : profile.plan_override === 'beta_byok'
                ? 'Bêta clé perso'
                : 'Plan standard'}
          </Badge>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Accès" description="Override de plan et crédits" />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2" title={lockHint}>
            <span className="text-sm text-muted">Override :</span>
            <Button
              size="sm"
              variant={profile.plan_override === null ? 'primary' : 'secondary'}
              disabled={!editable}
              onClick={() => rpc('admin_set_plan_override', { p_user: userId, p_override: null }, 'Override retiré.')}
            >
              Aucun
            </Button>
            <Button
              size="sm"
              variant={profile.plan_override === 'free_unlimited' ? 'primary' : 'secondary'}
              disabled={!editable}
              onClick={() =>
                rpc('admin_set_plan_override', { p_user: userId, p_override: 'free_unlimited' }, 'Accès libre accordé.')
              }
            >
              Accès libre
            </Button>
            <Button
              size="sm"
              variant={profile.plan_override === 'beta_byok' ? 'primary' : 'secondary'}
              disabled={!editable}
              onClick={() =>
                rpc('admin_set_plan_override', { p_user: userId, p_override: 'beta_byok' }, 'Passé en bêta avec clé perso.')
              }
            >
              Bêta clé perso
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2" title={lockHint}>
            <span className="text-sm text-muted">Crédits :</span>
            <input
              type="number"
              value={creditsDelta}
              onChange={(e) => setCreditsDelta(e.target.value)}
              placeholder="50"
              className="h-9 w-24 rounded-md border border-border bg-surface px-2 text-sm"
              disabled={!editable}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!editable || !Number(creditsDelta)}
              onClick={() => {
                rpc('admin_adjust_credits', { p_user: userId, p_delta: Number(creditsDelta) }, 'Crédits ajustés.')
                setCreditsDelta('')
              }}
            >
              Rendre des crédits
            </Button>
          </div>
          {me?.role === 'owner' && profile.role !== 'owner' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Rôle :</span>
              {(['user', 'viewer', 'admin'] as const).map((role) => (
                <Button
                  key={role}
                  size="sm"
                  variant={profile.role === role ? 'primary' : 'secondary'}
                  onClick={() => rpc('admin_set_role', { p_user: userId, p_role: role }, 'Rôle mis à jour.')}
                >
                  {role === 'user' ? 'Client' : role === 'viewer' ? 'Lecture' : 'Admin'}
                </Button>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Comptes connectés" />
        {data.channels.length === 0 ? (
          <EmptyState title="Aucun compte connecté" />
        ) : (
          <div className="divide-y divide-border/60">
            {data.channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">
                  {c.provider} {c.handle ? `@${c.handle}` : ''}
                </span>
                <Badge tone={CHANNEL_STATUS[c.status].tone}>{CHANNEL_STATUS[c.status].label}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Assistants" />
        {data.assistants.length === 0 ? (
          <EmptyState title="Aucun assistant" />
        ) : (
          <div className="divide-y divide-border/60">
            {data.assistants.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium">{a.name}</span>
                  {!a.is_active && a.paused_reason ? (
                    <span className="ml-2 text-xs text-muted">({a.paused_reason})</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.is_active ? 'success' : 'muted'}>{a.is_active ? 'Actif' : 'En pause'}</Badge>
                  {a.is_active ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!editable}
                      title={lockHint}
                      onClick={() => rpc('admin_pause_assistant', { p_assistant: a.id }, 'Assistant mis en pause.')}
                    >
                      Mettre en pause
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Modules pour ce client" description="Hériter suit le réglage global du module" />
        <div className="divide-y divide-border/60">
          {(flags ?? []).map((flag) => {
            const ov = overrideOf(flag.key)
            return (
              <div key={flag.key} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm" title={lockHint}>
                <span>{flag.label}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={ov?.enabled === true ? 'primary' : 'ghost'}
                    disabled={!editable}
                    onClick={() => rpc('admin_set_user_flag', { p_user: userId, p_key: flag.key, p_enabled: true }, 'Module activé pour ce client.')}
                  >
                    Activer
                  </Button>
                  <Button
                    size="sm"
                    variant={ov?.enabled === false ? 'primary' : 'ghost'}
                    disabled={!editable}
                    onClick={() => rpc('admin_set_user_flag', { p_user: userId, p_key: flag.key, p_enabled: false }, 'Module désactivé pour ce client.')}
                  >
                    Désactiver
                  </Button>
                  <Button
                    size="sm"
                    variant={!ov ? 'primary' : 'ghost'}
                    disabled={!editable}
                    onClick={() => rpc('admin_set_user_flag', { p_user: userId, p_key: flag.key, p_enabled: null }, 'Ce client suit le réglage global.')}
                  >
                    Hériter
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Dernières réponses IA" />
        {data.usage.length === 0 ? (
          <EmptyState title="Aucune réponse IA" />
        ) : (
          <div className="divide-y divide-border/60">
            {data.usage.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-2.5 text-xs text-muted">
                <span>
                  {u.model} · {u.input_tokens + u.output_tokens} tokens ·{' '}
                  {u.key_source === 'byok' ? 'clé perso' : 'clé plateforme'}
                </span>
                <span>
                  {u.cost_estimate_usd != null ? `${Number(u.cost_estimate_usd).toFixed(4)} $` : ''} ·{' '}
                  {formatRelative(u.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <MessageCostCard userId={userId} assistants={data.assistants} editable={editable} />
    </div>
  )
}
