'use client'

import { Eye } from 'lucide-react'
import { useProfile } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { useViewAs } from './provider'

export function ViewAsBanner() {
  const { active, exit } = useViewAs()
  const { data: profile } = useProfile()

  if (!active) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-warning/15 px-4 py-2 text-sm text-ink">
      <span className="flex items-center gap-2">
        <Eye size={15} className="shrink-0 text-warning" />
        Vous visualisez le compte de <strong>{profile?.full_name || profile?.email || '...'}</strong> en lecture seule.
      </span>
      <Button size="sm" variant="secondary" onClick={exit}>
        Quitter
      </Button>
    </div>
  )
}
