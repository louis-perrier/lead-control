import { Card, CardBody } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useCountUp } from './use-count-up'

type Props = {
  label: string
  value: number
  format: 'number' | 'currency' | 'percent'
  highlight?: boolean
  percentDecimals?: number
  hint?: string
}

export function RoiKpiCard({ label, value, format, highlight, percentDecimals = 0, hint }: Props) {
  const animated = useCountUp(value, 1100, format === 'percent' ? percentDecimals : 0)
  const display =
    format === 'currency'
      ? `${animated.toLocaleString('fr-FR')} €`
      : format === 'percent'
        ? `${animated.toLocaleString('fr-FR', {
            minimumFractionDigits: percentDecimals,
            maximumFractionDigits: percentDecimals,
          })} %`
        : animated.toLocaleString('fr-FR')

  return (
    <Card className={cn(highlight && 'border-primary/30 bg-gradient-to-b from-primary/[0.06] to-transparent')}>
      <CardBody className="flex flex-col items-center justify-center gap-1 py-4 text-center">
        <p className={cn('tabular-nums font-bold', highlight ? 'text-[28px] text-primary' : 'text-xl text-ink')}>
          {display}
        </p>
        <p className={cn('text-xs font-medium uppercase tracking-wide', highlight ? 'text-primary/80' : 'text-muted')}>
          {label}
        </p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </CardBody>
    </Card>
  )
}
