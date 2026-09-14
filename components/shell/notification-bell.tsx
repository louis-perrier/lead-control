'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { useAvatarUrls } from '@/lib/avatars'
import { useInvalidate, useProfile } from '@/lib/queries'
import { markNotificationsRead, notificationTitle, useNotifications, usePushState } from '@/lib/notifications'
import type { AppNotification } from '@/lib/types'
import { cn, formatRelative } from '@/lib/utils'
import { Avatar, Skeleton } from '@/components/ui/misc'

export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter()
  const invalidate = useInvalidate()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { data: profile } = useProfile()
  const { data: notifications, isLoading, isError } = useNotifications(profile?.user_id)
  const [pushState] = usePushState()
  const avatars = useAvatarUrls((notifications ?? []).map((n) => n.conversations?.contact_avatar_path))
  const unread = (notifications ?? []).filter((n) => !n.read_at)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  async function openNotification(n: AppNotification) {
    setOpen(false)
    if (!n.read_at) {
      await markNotificationsRead([n.id])
      invalidate('notifications')
    }
    router.push(n.conversation_id ? `/app/inbox?c=${n.conversation_id}` : '/app/inbox')
  }

  async function markAllRead() {
    await markNotificationsRead(unread.map((n) => n.id))
    invalidate('notifications')
  }

  return (
    <div ref={panelRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} non lues` : 'Notifications'}
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-[10px] text-muted hover:bg-bg hover:text-ink"
      >
        <Bell size={18} />
        {unread.length > 0 ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-2 top-14 z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-soft md:absolute md:inset-x-auto md:left-0 md:top-11 md:w-96">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread.length > 0 ? (
              <button type="button" onClick={markAllRead} className="text-xs font-medium text-primary hover:underline">
                Tout marquer comme lu
              </button>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : isError ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Impossible de charger les notifications.</p>
            ) : (notifications ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Aucune notification pour le moment.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {notifications!.map((n) => {
                  const path = n.conversations?.contact_avatar_path
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(n)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-bg"
                      >
                        <Avatar
                          name={n.conversations?.contact_name ?? n.conversations?.contact_handle}
                          src={path ? avatars[path] : null}
                          className="size-8"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn('truncate text-sm', n.read_at ? 'font-medium text-muted' : 'font-semibold')}>
                              {notificationTitle(n)}
                            </span>
                            <span className="shrink-0 text-xs text-muted">{formatRelative(n.created_at)}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">{n.body}</span>
                        </span>
                        {!n.read_at ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Non lue" /> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {pushState !== 'on' && pushState !== 'loading' ? (
            <Link
              href="/app/settings#notifications"
              onClick={() => setOpen(false)}
              className="border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-bg"
            >
              Recevoir les notifications sur cet appareil
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
