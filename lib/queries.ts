'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
import type { Assistant, BillingInfo, ChannelAccount, FeatureFlag, Profile } from '@/lib/types'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async (): Promise<Profile | null> => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
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
  return useQuery({
    queryKey: ['assistants'],
    queryFn: async (): Promise<Assistant[]> => {
      const supabase = createClient()
      const { data } = await supabase.from('assistants').select('*').order('created_at')
      return (data ?? []) as Assistant[]
    },
  })
}

export function useChannelAccounts() {
  return useQuery({
    queryKey: ['channel-accounts'],
    queryFn: async (): Promise<ChannelAccount[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('channel_accounts')
        .select('*')
        .neq('status', 'disconnected')
        .order('connected_at', { ascending: false })
      return (data ?? []) as ChannelAccount[]
    },
  })
}

export function useInvalidate() {
  const queryClient = useQueryClient()
  return (...keys: string[]) => {
    for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] })
  }
}
