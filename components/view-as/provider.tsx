'use client'

import { createContext, useCallback, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { setViewAsTarget, useViewAsTargetId } from '@/lib/view-as/state'
import { useInvalidate } from '@/lib/queries'

type ViewAsContextValue = {
  active: boolean
  targetUserId: string | null
  enter: (userId: string) => Promise<{ ok: boolean; error?: string }>
  exit: () => void
}

const ViewAsContext = createContext<ViewAsContextValue>({
  active: false,
  targetUserId: null,
  enter: async () => ({ ok: false }),
  exit: () => {},
})

export function useViewAs() {
  return useContext(ViewAsContext)
}

export function ViewAsProvider({ children }: { children: React.ReactNode }) {
  const targetUserId = useViewAsTargetId()
  const invalidate = useInvalidate()

  const refreshEffectiveData = useCallback(() => {
    invalidate('profile', 'assistants', 'channel-accounts', 'my-overrides')
  }, [invalidate])

  const enter = useCallback(
    async (userId: string) => {
      const { error } = await createClient().rpc('admin_enter_view_as', { p_user: userId })
      if (error) return { ok: false, error: error.message }
      setViewAsTarget(userId)
      refreshEffectiveData()
      return { ok: true }
    },
    [refreshEffectiveData],
  )

  const exit = useCallback(() => {
    setViewAsTarget(null)
    refreshEffectiveData()
  }, [refreshEffectiveData])

  return (
    <ViewAsContext.Provider value={{ active: targetUserId !== null, targetUserId, enter, exit }}>
      {children}
    </ViewAsContext.Provider>
  )
}
