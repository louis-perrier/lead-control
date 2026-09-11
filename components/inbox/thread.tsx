'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Handshake,
  Image as ImageIcon,
  Info,
  Mic,
  Pause,
  Play,
  Send,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
import { useInvalidate, usePendingFollowup } from '@/lib/queries'
import type { Booking, Conversation, ConversationMessage } from '@/lib/types'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, ConfirmDialog } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Skeleton, Spinner } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { StateBadge } from './state-banner'

function useMessages(conversationId: number) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async (): Promise<ConversationMessage[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('id, conversation_id, direction, author_type, body_text, message_type, media_path, transcript, transcript_status, send_state, sent_at')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as ConversationMessage[]
    },
  })
}

function MediaBubble({ message }: { message: ConversationMessage }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const res = await callFunction<{ url: string }>('media-signed-url', {
        body: { message_id: message.id },
      })
      setUrl(res.url)
    } catch {
      setError(true)
    }
    setLoading(false)
  }

  if (message.message_type === 'image') {
    return (
      <div className="space-y-1.5">
        {url ? (
          <img src={url} alt="Photo reçue" className="max-h-64 rounded-lg" />
        ) : (
          <button onClick={load} className="flex items-center gap-1.5 text-sm underline" disabled={loading}>
            <ImageIcon size={15} />
            {loading ? 'Chargement…' : 'Voir la photo'}
          </button>
        )}
        {error ? <p className="text-xs text-danger">Photo indisponible.</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {url ? (
        <audio controls preload="none" src={url} className="max-w-full" />
      ) : (
        <button onClick={load} className="flex items-center gap-1.5 text-sm underline" disabled={loading}>
          <Mic size={15} />
          {loading ? 'Chargement…' : 'Écouter le vocal'}
        </button>
      )}
      {error ? <p className="text-xs text-danger">Vocal indisponible.</p> : null}
      {message.transcript_status === 'processing' ? (
        <p className="flex items-center gap-1.5 text-xs opacity-80">
          <Spinner className="size-3" />
          Transcription en cours…
        </p>
      ) : message.transcript ? (
        <div>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="flex items-center gap-1 text-xs underline opacity-80"
          >
            {showTranscript ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Transcription
          </button>
          {showTranscript ? <p className="mt-1 text-sm">{message.transcript}</p> : null}
        </div>
      ) : message.transcript_status === 'failed' ? (
        <p className="text-xs opacity-70">Transcription impossible.</p>
      ) : null}
    </div>
  )
}

function Bubble({ message }: { message: ConversationMessage }) {
  const mine = message.direction === 'out'
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm',
          mine
            ? message.author_type === 'agent'
              ? 'rounded-br-sm bg-primary text-white'
              : 'rounded-br-sm bg-ink text-white'
            : 'rounded-bl-sm border border-border bg-surface',
        )}
      >
        {message.message_type !== 'text' ? (
          <MediaBubble message={message} />
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body_text}</p>
        )}
        <p className={cn('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-muted')}>
          {message.author_type === 'agent' ? 'Assistant · ' : ''}
          {formatDateTime(message.sent_at)}
          {message.send_state === 'failed' ? ' · échec d’envoi' : ''}
        </p>
      </div>
    </div>
  )
}

function CloseDialog({
  conversation,
  open,
  onClose,
}: {
  conversation: Conversation
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  async function close(outcome: 'won' | 'lost') {
    setBusy(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    const value = outcome === 'won' ? Number(amount.replace(',', '.')) || 0 : null
    const { error } = await supabase
      .from('conversations')
      .update({ outcome, closed_at: now, automation_state: 'stopped', automation_reason: 'closed' })
      .eq('id', conversation.id)
    if (!error && outcome === 'won') {
      await supabase.from('deals').insert({
        user_id: conversation.user_id,
        conversation_id: conversation.id,
        amount: value,
        status: 'won',
        closed_at: now,
      })
    }
    setBusy(false)
    if (error) {
      toast('La clôture a échoué.', 'error')
      return
    }
    toast(outcome === 'won' ? 'Conversation clôturée : gagnée.' : 'Conversation clôturée : perdue.')
    invalidate('conversations')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Clôturer la conversation">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          La clôture arrête l'assistant sur cette conversation et alimente vos statistiques.
        </p>
        <div>
          <Label htmlFor="amount">Montant de la vente (si gagnée)</Label>
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="1500"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close('lost')} disabled={busy}>
            Perdue
          </Button>
          <Button onClick={() => close('won')} disabled={busy}>
            <Handshake size={15} />
            Gagnée
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function useBooking(conversationId: number) {
  return useQuery({
    queryKey: ['booking', conversationId],
    queryFn: async (): Promise<Booking | null> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('bookings')
        .select('id, conversation_id, event_type_name, invitee_email, invitee_name, event_start_at, event_end_at, status')
        .eq('conversation_id', conversationId)
        .order('event_start_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as Booking | null
    },
  })
}

function ContactPanel({ conversation, onClose }: { conversation: Conversation; onClose?: () => void }) {
  const { data: booking } = useBooking(conversation.id)
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Détails du prospect</h2>
        {onClose ? (
          <button onClick={onClose} aria-label="Fermer" className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="space-y-4 px-4 py-4 text-sm">
        <div>
          <p className="font-medium">{conversation.contact_name ?? 'Contact Instagram'}</p>
          {conversation.contact_handle ? (
            <a
              href={`https://instagram.com/${conversation.contact_handle}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              @{conversation.contact_handle}
            </a>
          ) : null}
        </div>
        {conversation.heat_tag !== 'unknown' ? (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Intérêt</p>
            <Badge tone={conversation.heat_tag === 'hot' ? 'danger' : conversation.heat_tag === 'warm' ? 'warning' : 'primary'}>
              {conversation.heat_tag === 'hot' ? 'Chaud' : conversation.heat_tag === 'warm' ? 'Tiède' : 'Froid'}
            </Badge>
            {conversation.heat_reason ? <p className="mt-1 text-muted">{conversation.heat_reason}</p> : null}
          </div>
        ) : null}
        {booking ? (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Rendez-vous</p>
            <div className="flex items-center gap-2">
              <span>{booking.event_type_name ?? 'Rendez-vous Calendly'}</span>
              <Badge tone={booking.status === 'active' ? 'success' : 'muted'}>
                {booking.status === 'active' ? 'Confirmé' : 'Annulé'}
              </Badge>
            </div>
            {booking.event_start_at ? (
              <p className="mt-1 text-muted">{formatDateTime(booking.event_start_at)}</p>
            ) : null}
            {conversation.outcome === 'won' ? <p className="mt-1 text-success">Conversation clôturée gagnée</p> : null}
          </div>
        ) : null}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Résumé</p>
          <p className="text-muted">{conversation.summary ?? 'Aucun résumé pour le moment.'}</p>
        </div>
        <div className="text-xs text-muted">
          {conversation.inbound_count} messages reçus · {conversation.agent_sent_count} réponses de
          l'assistant · {conversation.human_sent_count} réponses manuelles
        </div>
      </div>
    </div>
  )
}

export function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: messages, isLoading } = useMessages(conversation.id)
  const { data: followup } = usePendingFollowup(conversation.id)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const paused = ['stopped', 'error', 'condition_stop'].includes(conversation.automation_state)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  useEffect(() => {
    if (conversation.unread_count > 0) {
      createClient()
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversation.id)
        .then(() => invalidate('conversations'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id])

  const windowExpired = useMemo(() => {
    const lastInbound = [...(messages ?? [])].reverse().find((m) => m.author_type === 'customer')
    if (!lastInbound) return true
    return Date.now() - Date.parse(lastInbound.sent_at) > 24 * 3600 * 1000
  }, [messages])

  async function togglePause() {
    const supabase = createClient()
    if (paused && conversation.automation_state !== 'condition_stop') {
      const { error } = await supabase.rpc('resume_conversation', { p_conversation_id: conversation.id })
      if (error) {
        toast('Impossible de relancer l’assistant.', 'error')
      } else {
        toast('L’assistant reprend la main sur cette conversation.')
      }
    } else {
      const { error } = await supabase
        .from('conversations')
        .update({
          automation_state: 'stopped',
          automation_reason: 'human_takeover',
          next_reply_at: null,
          debounce_until: null,
        })
        .eq('id', conversation.id)
      if (error) {
        toast('Impossible de mettre en pause.', 'error')
      } else {
        toast('Assistant en pause : vous avez la main.')
      }
    }
    invalidate('conversations')
    setPauseOpen(false)
  }

  async function cancelFollowup() {
    const { error } = await createClient().rpc('cancel_conversation_followups', {
      p_conversation_id: conversation.id,
    })
    if (error) {
      toast('Impossible d’annuler la relance.', 'error')
      return
    }
    toast('Relance annulée.')
    invalidate('followup')
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setDraft('')
    try {
      await callFunction('messages-send', { body: { conversation_id: conversation.id, text } })
      invalidate('messages', 'conversations')
    } catch (err) {
      setDraft(text)
      if (err instanceof Error && err.message === 'window_expired') {
        toast('Envoi impossible : plus de 24 h depuis le dernier message du prospect (règle Instagram).', 'error')
      } else {
        toast('L’envoi a échoué. Réessayez.', 'error')
      }
    }
    setSending(false)
  }

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-bg">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5">
          <button onClick={onBack} aria-label="Retour à la liste" className="text-muted hover:text-ink md:hidden">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {conversation.contact_name ?? conversation.contact_handle ?? 'Contact Instagram'}
            </p>
            <div className="mt-0.5">
              <StateBadge conv={conversation} />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {conversation.automation_state !== 'condition_stop' && !conversation.outcome ? (
              <Button size="sm" variant="secondary" onClick={() => setPauseOpen(true)}>
                {paused ? <Play size={14} /> : <Pause size={14} />}
                <span className="hidden sm:inline">{paused ? 'Relancer l’assistant' : 'Mettre en pause'}</span>
              </Button>
            ) : null}
            {!conversation.outcome ? (
              <Button size="sm" variant="secondary" onClick={() => setCloseOpen(true)}>
                <Handshake size={14} />
                <span className="hidden sm:inline">Clôturer</span>
              </Button>
            ) : null}
            <button
              onClick={() => setPanelOpen(true)}
              aria-label="Détails du prospect"
              className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-ink xl:hidden"
            >
              <Info size={17} />
            </button>
          </div>
        </header>
        {followup ? (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 text-sm">
            <span className="text-muted">Relance prévue à {formatDateTime(followup.scheduled_at)}</span>
            <button type="button" onClick={cancelFollowup} className="text-primary hover:underline">
              Annuler la relance
            </button>
          </div>
        ) : null}

        <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-3/5" />
            </div>
          ) : (
            (messages ?? []).map((m) => <Bubble key={m.id} message={m} />)
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="border-t border-border bg-surface p-3">
          {windowExpired ? (
            <p className="mb-2 text-xs text-muted">
              Plus de 24 h depuis le dernier message du prospect : Instagram n'autorise plus l'envoi.
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(e)
                }
              }}
              rows={1}
              placeholder={windowExpired ? 'Envoi indisponible' : 'Écrire une réponse…'}
              disabled={windowExpired}
              className="max-h-32 min-h-[42px] flex-1 resize-y rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            />
            <Button type="submit" disabled={windowExpired || sending || !draft.trim()} aria-label="Envoyer">
              {sending ? <Spinner className="border-white/40 border-t-white" /> : <Send size={16} />}
            </Button>
          </div>
        </form>
      </div>

      <aside className="hidden w-72 shrink-0 border-l border-border bg-surface xl:block">
        <ContactPanel conversation={conversation} />
      </aside>

      {panelOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setPanelOpen(false)} aria-hidden />
          <div className="animate-in absolute inset-y-0 right-0 w-80 max-w-[85vw] bg-surface shadow-soft">
            <ContactPanel conversation={conversation} onClose={() => setPanelOpen(false)} />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pauseOpen}
        onClose={() => setPauseOpen(false)}
        onConfirm={togglePause}
        title={paused ? 'Relancer l’assistant' : 'Mettre l’assistant en pause'}
        message={
          paused
            ? 'L’assistant reprendra les réponses automatiques sur cette conversation.'
            : 'L’assistant ne répondra plus sur cette conversation tant que vous ne le relancez pas.'
        }
        confirmLabel={paused ? 'Relancer' : 'Mettre en pause'}
      />
      <CloseDialog conversation={conversation} open={closeOpen} onClose={() => setCloseOpen(false)} />
    </div>
  )
}
