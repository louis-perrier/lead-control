'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bot,
  CreditCard,
  Home,
  Inbox,
  LogOut,
  MessageSquareHeart,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBilling, useProfile, useRealProfile } from '@/lib/queries'
import { isStaff } from '@/lib/features'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ViewAsBanner } from '@/components/view-as/banner'

const NAV = [
  { href: '/app', label: 'Accueil', icon: Home, exact: true },
  { href: '/app/inbox', label: 'Boîte de réception', icon: Inbox },
  { href: '/app/contacts', label: 'Contacts', icon: Users },
  { href: '/app/assistant', label: 'Assistant', icon: Bot },
  { href: '/app/settings', label: 'Réglages', icon: Settings },
]

function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(0)
  const [sending, setSending] = useState(false)
  const toast = useToast()

  async function send() {
    if (!message.trim()) return
    setSending(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('feedback').insert({
      user_id: user?.id,
      rating: rating || null,
      message: message.trim(),
      page: window.location.pathname,
    })
    setSending(false)
    if (error) {
      toast('Impossible d’envoyer votre avis pour le moment.', 'error')
      return
    }
    toast('Merci pour votre avis.')
    setMessage('')
    setRating(0)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Donner mon avis"
      footer={
        <Button onClick={send} disabled={sending || !message.trim()}>
          {sending ? 'Envoi…' : 'Envoyer'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} sur 5`}
              onClick={() => setRating(n)}
              className={cn('text-xl', n <= rating ? 'text-warning' : 'text-border')}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ce qui vous plaît, ce qui manque, ce qui coince…"
          className="h-28 w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
    </Dialog>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: profile } = useProfile()
  const { data: realProfile } = useRealProfile()
  const { data: billing } = useBilling()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const staff = isStaff(realProfile)
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const creditsLabel =
    billing?.planOverride != null
      ? 'Accès illimité'
      : billing && billing.creditsRemaining != null && billing.creditsMonthly > 0
        ? `${billing.creditsRemaining.toLocaleString('fr-FR')} crédits restants`
        : null

  return (
    <div className="flex min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/app">
            <img src="/logoMarque@2x.png" alt="LeadControl" className="h-7 w-auto" />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium',
                isActive(href, exact)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-bg hover:text-ink',
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
          {staff ? (
            <Link
              href="/app/admin"
              className={cn(
                'flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium',
                isActive('/app/admin')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-bg hover:text-ink',
              )}
            >
              <ShieldCheck size={17} />
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="space-y-2 border-t border-border p-3">
          <Link
            href="/app/billing"
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium text-muted hover:bg-bg hover:text-ink"
          >
            <CreditCard size={17} />
            Facturation
          </Link>
          {creditsLabel ? <p className="px-3 text-xs text-muted">{creditsLabel}</p> : null}
          <button
            onClick={() => setFeedbackOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-muted hover:bg-bg hover:text-ink"
          >
            <MessageSquareHeart size={17} />
            Donner mon avis
          </button>
          <div className="flex items-center gap-2.5 px-3 py-1.5">
            <Avatar name={profile?.full_name ?? profile?.email} className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name || profile?.email}</p>
            </div>
            <button
              onClick={signOut}
              aria-label="Se déconnecter"
              className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-ink"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-16 md:ml-60 md:pb-0">
        <ViewAsBanner />
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
        {NAV.slice(0, 4).map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
              isActive(href, exact) ? 'text-primary' : 'text-muted',
            )}
          >
            <Icon size={19} />
            {label.split(' ')[0]}
          </Link>
        ))}
        <Link
          href="/app/settings"
          aria-label="Réglages"
          className={cn(
            'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
            isActive('/app/settings') ? 'text-primary' : 'text-muted',
          )}
        >
          <Settings size={19} />
          Réglages
        </Link>
      </nav>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
