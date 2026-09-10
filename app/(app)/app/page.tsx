'use client'

import { useMemo } from 'react'
import { useAssistants, useChannelAccounts } from '@/lib/queries'
import { Skeleton } from '@/components/ui/misc'
import { StatsContent } from '@/components/stats/stats-content'
import { OnboardingWidget } from '@/components/home/onboarding-widget'

export default function HomePage() {
  const { data: assistants, isLoading: loadingAssistants } = useAssistants()
  const { data: channels } = useChannelAccounts()

  const assistant = assistants?.[0]
  const channel = useMemo(
    () => channels?.find((c) => c.id === assistant?.channel_account_id) ?? channels?.[0],
    [channels, assistant],
  )

  const step1 = Boolean(channel && channel.status === 'connected')
  const step2 = Boolean(
    assistant?.settings?.product?.name?.trim() &&
      assistant?.settings?.context?.trim() &&
      assistant?.settings?.stop_condition?.text?.trim(),
  )
  const step3 = Boolean(assistant?.is_active)
  const onboarded = step1 && step2 && step3

  if (loadingAssistants) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      {!onboarded ? (
        <OnboardingWidget
          step1={step1}
          step2={step2}
          step3={step3}
          channelDisconnected={Boolean(channel && channel.status !== 'connected')}
        />
      ) : null}
      <StatsContent />
    </div>
  )
}
