'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useProfile } from '@/lib/queries'
import { isStaff } from '@/lib/features'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/app/admin', label: "Vue d'ensemble", exact: true },
  { href: '/app/admin/users', label: 'Clients' },
  { href: '/app/admin/flags', label: 'Modules' },
  { href: '/app/admin/health', label: 'Santé' },
  { href: '/app/admin/team', label: 'Équipe' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-52 w-full" />
      </div>
    )
  }

  if (!isStaff(profile)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Accès réservé à l'équipe"
          description="Cette section est visible uniquement par les administrateurs de LeadControl."
          action={
            <Link href="/app">
              <Button variant="secondary">Retour à l'accueil</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold">Administration</h1>
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-border pb-px">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  )
}
