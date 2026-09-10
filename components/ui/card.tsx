import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-border bg-surface shadow-soft transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3.5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3.5', className)} {...props} />
}
