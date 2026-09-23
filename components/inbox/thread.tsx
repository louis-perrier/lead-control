'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
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
import { useAssistants, useFlags, useFollowupToSend, useInvalidate, useMyOverrides, usePendingFollowup, useProfile } from '@/lib/queries'
import { hasFeature } from '@/lib/features'
import { useAvatarUrls } from '@/lib/avatars'
import { markConversationNotificationsRead, useNotificationsEnabled } from '@/lib/notifications'
import type { Conversation, ConversationMessage } from '@/lib/types'
import {
  assistedSuggestion,
  formatRemaining,
  humanAgentRemainingMs,
  manualSendMode,
  needsManualFollowup,
} from '@/supabase/functions/_shared/messaging-window'
import { renderFollowupText, usableDisplayName } from '@/supabase/functions/_shared/followup-text'
import { followupSteps, notifyTemplates } from '@/supabase/functions/_shared/followup-plan'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, ConfirmDialog } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Avatar, Skeleton, Spinner } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'
import { StateBadge } from './state-banner'
import { ProspectDetails } from '@/components/prospects/prospect-details'

function useMessages(conversationId: number) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async (): Promise<ConversationMessage[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('id, conversation_id, direction, author_type, body_text, message_type, media_path, transcript, transcript_status, send_state, sent_at, reaction')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)
      if (error) throw error
      // Les 200 plus récents, remis dans l'ordre de lecture : un long fil affichait les plus anciens.
      return ((data ?? []) as ConversationMessage[]).reverse()
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
    const sent = message.direction === 'out'
    return (
      <div className="space-y-1.5">
        {url ? (
          <img src={url} alt={sent ? 'Image envoyée' : 'Photo reçue'} className="max-h-64 rounded-lg" />
        ) : (
          <button onClick={load} className="flex items-center gap-1.5 text-sm underline" disabled={loading}>
            <ImageIcon size={15} />
            {loading ? 'Chargement…' : sent ? 'Voir l’image envoyée' : 'Voir la photo'}
          </button>
        )}
        {sent && message.transcript ? <p className="text-xs opacity-80">{message.transcript}</p> : null}
        {error ? <p className="text-xs text-danger">{sent ? 'Image indisponible.' : 'Photo indisponible.'}</p> : null}
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
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start', message.reaction && 'pb-2.5')}>
      <div
        className={cn(
          'relative max-w-[78%] rounded-2xl px-3.5 py-2 text-sm',
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
        {message.reaction ? (
          <span
            className="absolute -bottom-2.5 right-2 rounded-full border border-border bg-surface px-1 text-xs leading-5"
            title="Réaction envoyée par l’assistant"
          >
            {message.reaction}
          </span>
        ) : null}
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

function ContactPanel({ conversation, onClose }: { conversation: Conversation; onClose?: () => void }) {
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
      <div className="px-4 py-4">
        <ProspectDetails conversation={conversation} />
      </div>
    </div>
  )
}

export function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: messages, isLoading } = useMessages(conversation.id)
  const { data: followup } = usePendingFollowup(conversation.id)
  const avatars = useAvatarUrls([conversation.contact_avatar_path])
  const notificationsEnabled = useNotificationsEnabled()

  useEffect(() => {
    if (!notificationsEnabled) return
    markConversationNotificationsRead(conversation.id).then((changed) => changed && invalidate('notifications'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.automation_state, notificationsEnabled])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [pauseOpen, setPauseOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { data: flags } = useFlags()
  const { data: profile } = useProfile()
  const { data: overrides } = useMyOverrides()
  const { data: assistants } = useAssistants()
  const humanAgent = hasFeature('human_agent', flags, profile, overrides)
  const [now, setNow] = useState(() => Date.now())
  const prefilledFor = useRef<number | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

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

  const lastCustomerAt = useMemo(
    () =>
      conversation.last_customer_message_at ??
      [...(messages ?? [])].reverse().find((m) => m.author_type === 'customer')?.sent_at ??
      null,
    [conversation.last_customer_message_at, messages],
  )
  const sendMode = manualSendMode(lastCustomerAt, now, humanAgent)
  const windowExpired = sendMode === 'expired' || sendMode === 'closed'
  const followupDue = humanAgent && needsManualFollowup(conversation, now)
  const assistant = assistants?.find((a) => a.id === conversation.assistant_id)
  const suggestion = followupDue
    ? assistedSuggestion(notifyTemplates(followupSteps(assistant?.settings.followups)), conversation.last_message_at, now)
    : null
  const { data: toSend } = useFollowupToSend(conversation.id)

  useEffect(() => {
    if (!suggestion || prefilledFor.current === conversation.id) return
    prefilledFor.current = conversation.id
    const known = conversation.metadata?.first_name
    const firstName = typeof known === 'string' && known ? known : usableDisplayName(conversation.contact_name, conversation.contact_handle)
    setDraft((current) => current || renderFollowupText(suggestion.text, firstName))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, suggestion?.id])

  async function dismissFollowup() {
    const { error } = await createClient()
      .from('conversations')
      .update({ metadata: { ...(conversation.metadata ?? {}), assisted_dismissed_at: new Date().toISOString() } })
      .eq('id', conversation.id)
    if (error) {
      toast('Impossible d’écarter ce prospect des relances.', 'error')
      return
    }
    setDraft('')
    toast('Ce prospect ne vous sera plus proposé, sauf s’il vous réécrit.')
    invalidate('conversations')
  }

  async function copyToSend() {
    if (!toSend?.message_body) return
    try {
      await navigator.clipboard.writeText(toSend.message_body)
      toast('Texte copié. Collez-le dans Instagram.')
    } catch {
      toast('Impossible de copier : sélectionnez le texte à la main.', 'error')
    }
  }

  // Écarte ce prospect des relances : la suite de la séquence est annulée et l'encart disparaît.
  async function dismissToSend() {
    const supabase = createClient()
    const { error } = await supabase
      .from('conversations')
      .update({ metadata: { ...(conversation.metadata ?? {}), assisted_dismissed_at: new Date().toISOString() } })
      .eq('id', conversation.id)
    if (error) {
      toast('Impossible d’écarter cette relance.', 'error')
      return
    }
    await supabase.rpc('cancel_conversation_followups', { p_conversation_id: conversation.id })
    toast('Relance écartée. Ce prospect ne sera plus relancé, sauf s’il vous réécrit.')
    invalidate('conversations', 'followup', 'followup-to-send', 'followups-to-send')
  }

  async function togglePause() {
    const supabase = createClient()
    if (paused) {
      const { error } = await supabase.rpc('resume_conversation', { p_conversation_id: conversation.id })
      if (error) {
        toast('Impossible de reprendre l’assistant.', 'error')
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
    setSendError('')
    setDraft('')
    try {
      await callFunction('messages-send', { body: { conversation_id: conversation.id, text } })
      invalidate('messages', 'conversations')
    } catch (err) {
      setDraft(text)
      const code = err instanceof Error ? err.message : ''
      const message =
        code === 'window_expired'
          ? 'Envoi impossible : plus de 24 h depuis le dernier message du prospect (règle Instagram).'
          : code === 'window_closed'
            ? 'Envoi impossible : le prospect doit vous réécrire pour rouvrir la conversation (règle Instagram).'
            : code === 'human_agent_refused'
              ? 'Instagram a refusé cet envoi hors de la fenêtre de 24 h : la fonctionnalité Human Agent n’est pas encore validée par Meta pour cette application.'
              : 'L’envoi a échoué. Réessayez.'
      setSendError(message)
      toast(message, 'error')
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
          <Avatar
            name={conversation.contact_name ?? conversation.contact_handle}
            src={conversation.contact_avatar_path ? avatars[conversation.contact_avatar_path] : null}
            className="size-8"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {conversation.contact_name ?? conversation.contact_handle ?? 'Contact Instagram'}
            </p>
            <div className="mt-0.5">
              <StateBadge conv={conversation} />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!conversation.outcome ? (
              <Button size="sm" variant="secondary" onClick={() => setPauseOpen(true)}>
                {paused ? <Play size={14} /> : <Pause size={14} />}
                <span className="hidden sm:inline">{paused ? 'Reprendre l’assistant' : 'Mettre en pause'}</span>
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
        {toSend?.message_body ? (
          <div className="space-y-2 border-b border-border bg-primary/5 px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-medium text-ink">Relance à envoyer depuis Instagram</span>
              <button type="button" onClick={dismissToSend} className="text-muted hover:text-ink hover:underline">
                Ne pas relancer
              </button>
            </div>
            <p className="whitespace-pre-wrap rounded-[8px] border border-border bg-surface px-2.5 py-2 text-ink">{toSend.message_body}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={copyToSend}>
                <Copy size={14} />
                Copier le texte
              </Button>
              {conversation.contact_handle ? (
                <a
                  href={`https://ig.me/m/${conversation.contact_handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink size={14} />
                  Ouvrir la conversation dans Instagram
                </a>
              ) : null}
              <span className="text-xs text-muted">
                {sendMode === 'human_agent'
                  ? 'Plus de 24 h : envoyez-la depuis Instagram, ou depuis la boîte ci-dessous grâce à Human Agent. Votre envoi apparaîtra ici de lui-même.'
                  : 'Plus de 24 h : Instagram n’autorise plus l’envoi depuis LeadControl. Votre envoi apparaîtra ici de lui-même.'}
              </span>
            </div>
          </div>
        ) : null}
        {followupDue && !toSend ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-primary/5 px-3 py-2 text-sm">
            <span className="text-ink">
              Plus de réponse depuis {formatRemaining(now - Date.parse(conversation.last_message_at!))}.
              {suggestion ? ' Une relance est prête ci-dessous : relisez, puis envoyez.' : ' Vous pouvez encore le relancer à la main.'}
            </span>
            <button type="button" onClick={dismissFollowup} className="text-muted hover:text-ink hover:underline">
              Ne pas relancer
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
          {sendMode === 'human_agent' ? (
            <p className="mb-2 text-xs text-muted">
              Réponse à la main possible encore{' '}
              <span className="font-medium tabular-nums text-ink">{formatRemaining(humanAgentRemainingMs(lastCustomerAt, now))}</span>.
            </p>
          ) : windowExpired ? (
            <p className="mb-2 text-xs text-muted">
              {humanAgent
                ? 'Plus de 7 jours depuis le dernier message du prospect : Instagram n’autorise plus l’envoi tant qu’il n’a pas réécrit.'
                : 'Plus de 24 h depuis le dernier message du prospect : Instagram n’autorise plus l’envoi.'}
            </p>
          ) : null}
          {sendError ? (
            <p className="mb-2 rounded-[8px] border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-xs text-danger">{sendError}</p>
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
        title={paused ? 'Reprendre l’assistant' : 'Mettre l’assistant en pause'}
        message={
          conversation.automation_state === 'condition_stop'
            ? 'L’objectif était marqué atteint. L’assistant répondra de nouveau aux prochains messages de ce prospect.'
            : paused
              ? 'L’assistant reprendra les réponses automatiques sur cette conversation.'
              : 'L’assistant ne répondra plus sur cette conversation tant que vous ne le reprenez pas.'
        }
        confirmLabel={paused ? 'Reprendre' : 'Mettre en pause'}
      />
      <CloseDialog conversation={conversation} open={closeOpen} onClose={() => setCloseOpen(false)} />
    </div>
  )
}
