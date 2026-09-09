'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, CheckCircle2, Circle, Instagram } from 'lucide-react'
import { useAssistants, useChannelAccounts, useProfile } from '@/lib/queries'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { StatsContent } from '@/components/stats/stats-content'
import { cn } from '@/lib/utils'

function Step({
  done,
  index,
  title,
  description,
  action,
}: {
  done: boolean
  index: number
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      {done ? (
        <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={20} />
      ) : (
        <Circle className="mt-0.5 shrink-0 text-border" size={20} />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', done && 'text-muted line-through')}>
          {index}. {title}
        </p>
        {!done ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {!done ? action : null}
    </div>
  )
}

export default function HomePage() {
  const { data: profile, isLoading: loadingProfile } = useProfile()
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

  if (loadingProfile || loadingAssistants) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-52 w-full" />
      </div>
    )
  }

  if (onboarded) {
    return <StatsContent />
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold">
        Bienvenue{profile?.full_name ? `, ${profile.full_name}` : ''}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Trois étapes et votre assistant répond à vos DM Instagram à votre place.
      </p>

      <Card className="mt-6 divide-y divide-border">
        <Step
          done={step1}
          index={1}
          title="Relier votre compte Instagram"
          description="Autorisez LeadControl à lire et envoyer vos messages privés."
          action={
            <Link href="/app/assistant">
              <Button size="sm">
                <Instagram size={15} />
                Relier
              </Button>
            </Link>
          }
        />
        <Step
          done={step2}
          index={2}
          title="Décrire votre assistant"
          description="Votre offre, votre contexte de vente et l'objectif de la conversation."
          action={
            <Link href="/app/assistant">
              <Button size="sm" variant={step1 ? 'primary' : 'secondary'}>
                Configurer
                <ArrowRight size={15} />
              </Button>
            </Link>
          }
        />
        <Step
          done={step3}
          index={3}
          title="Activer l'assistant"
          description="Il répond automatiquement aux nouveaux messages, selon vos horaires."
          action={
            <Link href="/app/assistant">
              <Button size="sm" variant={step1 && step2 ? 'primary' : 'secondary'} disabled={!step1 || !step2}>
                Activer
              </Button>
            </Link>
          }
        />
      </Card>

      {channel && channel.status !== 'connected' ? (
        <CardNotice>
          Votre compte Instagram {channel.handle ? `@${channel.handle}` : ''} doit être reconnecté :
          la connexion a expiré. Rendez-vous dans l'onglet Assistant.
        </CardNotice>
      ) : null}
    </div>
  )
}

function CardNotice({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-4 border-warning/40">
      <CardBody className="text-sm text-ink">{children}</CardBody>
    </Card>
  )
}
