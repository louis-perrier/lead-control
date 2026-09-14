'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { hasFeature } from '@/lib/features'
import { useFlags, useInvalidate, useMyOverrides, useProfile } from '@/lib/queries'
import { useViewAsTargetId } from '@/lib/view-as/state'
import type { AppNotification } from '@/lib/types'

// Masquée en mode « voir comme » : la RLS ne montre que les notifications du compte connecté.
export function useNotificationsEnabled() {
  const viewAs = useViewAsTargetId()
  const { data: profile } = useProfile()
  const { data: flags } = useFlags()
  const { data: overrides } = useMyOverrides()
  return !viewAs && hasFeature('notifications', flags, profile, overrides)
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications'],
    enabled,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await createClient()
        .from('notifications')
        .select('id, user_id, conversation_id, kind, body, created_at, read_at, conversations(contact_name, contact_handle, contact_avatar_path)')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as AppNotification[]
    },
  })
}

// Un seul abonnement temps réel pour toute l'application, les cloches ne font que lire.
export function useNotificationsLive(enabled: boolean, userId: string | null | undefined) {
  const invalidate = useInvalidate()
  useEffect(() => {
    if (!enabled || !userId) return
    const supabase = createClient()
    const channel = supabase
      .channel('notifications-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => invalidate('notifications'),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId])
}

export async function markNotificationsRead(ids: number[]) {
  if (ids.length === 0) return
  await createClient().from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
}

export function notificationTitle(n: AppNotification) {
  if (n.kind === 'blocked') return 'Assistant bloqué'
  const contact = n.conversations
  const who = contact?.contact_name || (contact?.contact_handle ? `@${contact.contact_handle}` : 'Un prospect')
  return `${who} a besoin de vous`
}

export type PushState = 'loading' | 'unsupported' | 'ios_install' | 'denied' | 'off' | 'on'

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  const { error } = await createClient().rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

async function detectPushState(resave: boolean): Promise<PushState> {
  // Sur iPhone, le push n'existe que dans l'application ajoutée à l'écran d'accueil.
  if (isIos() && !isStandalone()) return 'ios_install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const subscription = await currentSubscription()
  if (!subscription) return 'off'
  // Rattache l'appareil au compte connecté, le navigateur a pu servir à un autre compte.
  if (resave) await saveSubscription(subscription).catch(() => {})
  return 'on'
}

export function usePushState({ resave = false }: { resave?: boolean } = {}) {
  const [state, setState] = useState<PushState>('loading')
  useEffect(() => {
    let cancelled = false
    detectPushState(resave)
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState('unsupported'))
    return () => {
      cancelled = true
    }
  }, [resave])
  return [state, setState] as const
}

function base64UrlToBytes(value: string) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

// La permission se demande en premier : Safari la refuse si d'autres attentes la précèdent.
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notifications-push/public-key`)
  const { publicKey } = (await res.json()) as { publicKey?: string }
  if (!publicKey) throw new Error('push_not_configured')
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }))
  await saveSubscription(subscription)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription()
  if (subscription) {
    await createClient().rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  }
  return 'off'
}
