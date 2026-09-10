import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  step1: boolean
  step2: boolean
  step3: boolean
  channelDisconnected: boolean
}

export function OnboardingWidget({ step1, step2, step3, channelDisconnected }: Props) {
  const done = [step1, step2, step3].filter(Boolean).length
  const steps = [
    { done: step1, label: 'Relier Instagram' },
    { done: step2, label: 'Décrire l’assistant' },
    { done: step3, label: 'Activer l’assistant' },
  ]

  return (
    <Card className="border-primary/20">
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm font-semibold">Configuration à terminer ({done}/3)</p>
          <div className="flex flex-wrap gap-3">
            {steps.map((s) => (
              <span
                key={s.label}
                className={cn('flex items-center gap-1.5 text-xs font-medium', s.done ? 'text-success' : 'text-muted')}
              >
                {s.done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                {s.label}
              </span>
            ))}
          </div>
          {channelDisconnected ? (
            <span className="text-xs font-medium text-warning">Instagram déconnecté : reconnectez-le.</span>
          ) : null}
        </div>
        <Link href="/app/assistant">
          <Button size="sm">Continuer la configuration</Button>
        </Link>
      </CardBody>
    </Card>
  )
}
