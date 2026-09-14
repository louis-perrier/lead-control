'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Inbox as InboxIcon, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEffectiveUserId, useFlags, useInvalidate, useMyOverrides, useProfile } from '@/lib/queries'
import { hasFeature } from '@/lib/features'
import { useAvatarUrls } from '@/lib/avatars'
import { useNotificationsEnabled } from '@/lib/notifications'
import type { Conversation } from '@/lib/types'
import { needsManualFollowup } from '@/supabase/functions/_shared/messaging-window'
import { cn, formatRelative } from '@/lib/utils'
import { Avatar, EmptyState, Skeleton } from '@/components/ui/misc'
import { Input } from '@/components/ui/input'
import { HeatBadge } from '@/components/inbox/state-banner'
import { Thread } from '@/components/inbox/thread'

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'unread', label: 'Non lues' },
  { key: 'followup', label: 'À relancer' },
  { key: 'hot', label: 'Chaudes' },
  { key: 'paused', label: 'En pause' },
  { key: 'error', label: 'Erreurs' },
  { key: 'closed', label: 'Clôturées' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function matchesFilter(conv: Conversation, filter: FilterKey, now: number) {
  switch (filter) {
    case 'unread':
      return conv.unread_count > 0
    case 'followup':
      return needsManualFollowup(conv, now)
    case 'hot':
      return conv.heat_tag === 'hot'
    case 'paused':
      return conv.automation_state === 'stopped'
    case 'error':
      return conv.automation_state === 'error'
    case 'closed':
      return conv.outcome != null || conv.automation_state === 'condition_stop'
    default:
      return true
  }
}

function useConversations() {
  const effectiveUserId = useEffectiveUserId()
  return useQuery({
    queryKey: ['conversations', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<Conversation[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as Conversation[]
    },
  })
}

function InboxContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: profile } = useProfile()
  const { data: conversations, isLoading } = useConversations()
  const invalidate = useInvalidate()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const { data: flags } = useFlags()
  const { data: overrides } = useMyOverrides()
  const humanAgent = hasFeature('human_agent', flags, profile, overrides)
  const notificationsEnabled = useNotificationsEnabled()
  const filters = FILTERS.filter((f) => f.key !== 'followup' || humanAgent)

  const selectedId = Number(searchParams.get('c')) || null
  const selected = conversations?.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (!profile?.user_id) return
    const supabase = createClient()
    const channel = supabase
      .channel('inbox-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${profile.user_id}` },
        // Un envoi ou une annulation de relance change toujours la conversation : le bandeau suit.
        () => invalidate('conversations', 'followup'),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_messages' },
        () => invalidate('conversations', 'messages', 'followup'),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id])

  const avatars = useAvatarUrls((conversations ?? []).map((c) => c.contact_avatar_path))

  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (conversations ?? [])
      .filter((c) => matchesFilter(c, filter, Date.now()))
      .filter(
        (c) =>
          !term ||
          (c.contact_name ?? '').toLowerCase().includes(term) ||
          (c.contact_handle ?? '').toLowerCase().includes(term),
      )
  }, [conversations, filter, search])

  const followupCount = useMemo(
    () => (humanAgent ? (conversations ?? []).filter((c) => needsManualFollowup(c, Date.now())).length : 0),
    [conversations, humanAgent],
  )

  function open(conv: Conversation) {
    router.replace(`/app/inbox?c=${conv.id}`, { scroll: false })
  }

  return (
    // La barre du haut (cloche) n'existe sur mobile qu'avec les notifications activées.
    <div className={cn('flex md:h-dvh', notificationsEnabled ? 'h-[calc(100dvh-7rem)]' : 'h-[calc(100dvh-4rem)]')}>
      {/* Liste */}
      <section
        className={cn(
          'flex w-full flex-col border-r border-border bg-surface md:w-80 lg:w-96',
          selected ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="space-y-2.5 border-b border-border p-3">
          <h1 className="px-1 text-lg font-semibold">Boîte de réception</h1>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un contact"
              className="h-9 pl-9"
            />
          </div>
          <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                  filter === f.key ? 'bg-primary text-white' : 'bg-bg text-muted hover:text-ink',
                )}
              >
                {f.label}
                {f.key === 'followup' && followupCount > 0 ? <span className="ml-1 tabular-nums opacity-80">{followupCount}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<InboxIcon size={28} />}
              title={
                filter === 'all'
                  ? 'Aucune conversation pour le moment'
                  : 'Aucune conversation pour ce filtre'
              }
              description={
                filter === 'all'
                  ? 'Dès qu’un prospect vous écrit sur Instagram, la conversation apparaît ici.'
                  : undefined
              }
            />
          ) : (
            list.map((conv) => (
              <button
                key={conv.id}
                onClick={() => open(conv)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left hover:bg-bg',
                  selected?.id === conv.id && 'bg-primary/5',
                )}
              >
                <Avatar name={conv.contact_name ?? conv.contact_handle} src={conv.contact_avatar_path ? avatars[conv.contact_avatar_path] : null} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn('truncate text-sm', conv.unread_count > 0 ? 'font-semibold' : 'font-medium')}>
                      {conv.contact_name ?? conv.contact_handle ?? 'Contact Instagram'}
                    </p>
                    <span className="shrink-0 text-xs text-muted">{formatRelative(conv.last_message_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-xs text-muted">
                      {conv.last_message_preview ?? ''}
                    </p>
                    <HeatBadge conv={conv} />
                    {conv.automation_state === 'error' ? (
                      <span className="size-2 shrink-0 rounded-full bg-danger" aria-label="Erreur" />
                    ) : null}
                    {conv.unread_count > 0 ? (
                      <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                        {conv.unread_count}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Fil */}
      <section className={cn('min-w-0 flex-1', selected ? 'flex' : 'hidden md:flex')}>
        {selected ? (
          <Thread key={selected.id} conversation={selected} onBack={() => router.replace('/app/inbox', { scroll: false })} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<InboxIcon size={28} />}
              title="Sélectionnez une conversation"
              description="Choisissez une conversation dans la liste pour lire les échanges et répondre."
            />
          </div>
        )}
      </section>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxContent />
    </Suspense>
  )
}
