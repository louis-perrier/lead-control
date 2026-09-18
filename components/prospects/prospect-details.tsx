'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Booking, Conversation } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function useBooking(conversationId: number) {
  return useQuery({
    queryKey: ['booking', conversationId],
    queryFn: async (): Promise<Booking | null> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('bookings')
        .select('id, provider, meet_link, conversation_id, event_type_name, invitee_email, invitee_name, event_start_at, event_end_at, status')
        .eq('conversation_id', conversationId)
        .order('status', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as Booking | null
    },
  })
}

const sectionTitle = 'mb-1 text-xs font-medium uppercase tracking-wide text-muted'

export function ProspectDetails({ conversation }: { conversation: Conversation }) {
  const { data: booking } = useBooking(conversation.id)
  return (
    <div className="space-y-4 text-sm">
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
          <p className={sectionTitle}>Intérêt</p>
          <Badge tone={conversation.heat_tag === 'hot' ? 'danger' : conversation.heat_tag === 'warm' ? 'warning' : 'primary'}>
            {conversation.heat_tag === 'hot' ? 'Chaud' : conversation.heat_tag === 'warm' ? 'Tiède' : 'Froid'}
          </Badge>
          {conversation.heat_reason ? <p className="mt-1 text-muted">{conversation.heat_reason}</p> : null}
        </div>
      ) : null}
      {booking ? (
        <div>
          <p className={sectionTitle}>Rendez-vous</p>
          <div className="flex items-center gap-2">
            <span>{booking.event_type_name ?? (booking.provider === 'google' ? 'Appel Google Meet' : 'Rendez-vous Calendly')}</span>
            <Badge tone={booking.status === 'active' ? 'success' : 'muted'}>
              {booking.status === 'active' ? 'Confirmé' : 'Annulé'}
            </Badge>
          </div>
          {booking.event_start_at ? <p className="mt-1 text-muted">{formatDateTime(booking.event_start_at)}</p> : null}
          {booking.meet_link && booking.status === 'active' ? (
            <a href={booking.meet_link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary hover:underline">
              {booking.provider === 'google' ? 'Rejoindre l’appel Meet' : 'Rejoindre la visio'}
            </a>
          ) : null}
        </div>
      ) : null}
      {conversation.outcome ? (
        <p className={conversation.outcome === 'won' ? 'text-success' : 'text-muted'}>
          {conversation.outcome === 'won' ? 'Conversation clôturée gagnée' : 'Conversation clôturée perdue'}
        </p>
      ) : null}
      <div>
        <p className={sectionTitle}>Résumé</p>
        <p className="text-muted">{conversation.summary ?? 'Aucun résumé pour le moment.'}</p>
      </div>
      <div className="text-xs text-muted">
        {conversation.inbound_count} messages reçus · {conversation.agent_sent_count} réponses de l'assistant ·{' '}
        {conversation.human_sent_count} réponses manuelles
      </div>
    </div>
  )
}
