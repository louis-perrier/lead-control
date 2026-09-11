'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
import { useViewAsTargetId } from '@/lib/view-as/state'
import type { Assistant, BillingInfo, ChannelAccount, FeatureFlag, Followup, Profile } from '@/lib/types'

function useAuthUserId() {
  return useQuery({
    queryKey: ['auth-user-id'],
    queryFn: async (): Promise<string | null> => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user?.id ?? null
    },
    staleTime: Infinity,
  })
}

// Utilisateur réellement connecté OU utilisateur "vu comme" par un admin.
// À utiliser pour tout ce qui doit refléter ce que verrait ce compte : profil,
// assistants, canaux, drapeaux personnalisés, données de stats/inbox/contacts.
export function useEffectiveUserId() {
  const viewAsId = useViewAsTargetId()
  const { data: authId } = useAuthUserId()
  return viewAsId ?? authId ?? null
}

export function useProfile() {
  const effectiveUserId = useEffectiveUserId()
  return useQuery({
    queryKey: ['profile', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<Profile | null> => {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('*').eq('user_id', effectiveUserId!).single()
      return data as Profile
    },
  })
}

// Profil réel de la personne connectée, jamais celui d'un compte "vu comme".
// Réservé aux décisions d'accès admin (lien Admin, garde de /app/admin).
export function useRealProfile() {
  const { data: authId } = useAuthUserId()
  return useQuery({
    queryKey: ['profile-real', authId],
    enabled: Boolean(authId),
    queryFn: async (): Promise<Profile | null> => {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('*').eq('user_id', authId!).single()
      return data as Profile
    },
  })
}

export function useFlags() {
  return useQuery({
    queryKey: ['flags'],
    queryFn: async (): Promise<FeatureFlag[]> => {
      const supabase = createClient()
      const { data } = await supabase.from('feature_flags').select('*')
      return (data ?? []) as FeatureFlag[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useBilling() {
  return useQuery({
    queryKey: ['billing'],
    queryFn: () => callFunction<BillingInfo & { cycle: string | null }>('billing/info', { method: 'GET' }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

export function useAssistants() {
  const effectiveUserId = useEffectiveUserId()
  return useQuery({
    queryKey: ['assistants', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<Assistant[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('assistants')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .order('created_at')
      return (data ?? []) as Assistant[]
    },
  })
}

export function useChannelAccounts() {
  const effectiveUserId = useEffectiveUserId()
  return useQuery({
    queryKey: ['channel-accounts', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<ChannelAccount[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('channel_accounts')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .neq('status', 'disconnected')
        .order('connected_at', { ascending: false })
      return (data ?? []) as ChannelAccount[]
    },
  })
}

export function useMyOverrides() {
  const effectiveUserId = useEffectiveUserId()
  return useQuery({
    queryKey: ['my-overrides', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<{ key: string; enabled: boolean }[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('user_feature_overrides')
        .select('key, enabled')
        .eq('user_id', effectiveUserId!)
      return (data ?? []) as { key: string; enabled: boolean }[]
    },
    staleTime: 5 * 60_000,
  })
}

export function usePendingFollowup(conversationId: number) {
  return useQuery({
    queryKey: ['followup', conversationId],
    queryFn: async (): Promise<Followup | null> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('followups')
        .select('id, conversation_id, slot_index, scheduled_at, status')
        .eq('conversation_id', conversationId)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(1)
      return (data?.[0] ?? null) as Followup | null
    },
  })
}

export function useInvalidate() {
  const queryClient = useQueryClient()
  return (...keys: string[]) => {
    for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] })
  }
}
