import type { Assistant, ChannelAccount } from './types'

export type AssistantTab = 'offer' | 'booking' | 'operation'

export const ASSISTANT_TABS: { key: AssistantTab; label: string }[] = [
  { key: 'offer', label: 'Votre offre' },
  { key: 'booking', label: 'Rendez-vous' },
  { key: 'operation', label: 'Fonctionnement' },
]

export type Blocker = { text: string; tab: AssistantTab }

type Account = Pick<ChannelAccount, 'provider' | 'status'>

export function activationBlockers({
  assistant,
  channel,
  accounts,
  allowCalendar,
  allowCalendlyBooking,
  allowIclose,
}: {
  assistant: Pick<Assistant, 'settings'>
  channel: Pick<ChannelAccount, 'status'> | undefined
  accounts: Account[]
  allowCalendar: boolean
  allowCalendlyBooking: boolean
  allowIclose: boolean
}): Blocker[] {
  const s = assistant.settings
  const out: Blocker[] = []
  if (!channel) out.push({ text: 'relier un compte Instagram', tab: 'operation' })
  else if (channel.status !== 'connected') out.push({ text: 'reconnecter Instagram', tab: 'operation' })
  if (!s.product?.name?.trim()) out.push({ text: 'renseigner le produit ou service', tab: 'offer' })
  if (!s.context?.trim()) out.push({ text: 'renseigner le contexte de vente', tab: 'offer' })
  if (!s.stop_condition?.text?.trim()) out.push({ text: "définir l'objectif de la conversation", tab: 'booking' })
  const mode = s.booking?.mode
  const google = accounts.find((c) => c.provider === 'google')
  // Sans compte relié, l'assistant envoie le lien : seul un compte expiré bloque le mode agenda.
  if (allowCalendar && mode === 'calendar' && google && google.status !== 'connected') {
    out.push({ text: 'reconnecter Google Agenda', tab: 'booking' })
  }
  const calendly = accounts.find((c) => c.provider === 'calendly')
  const iclose = accounts.find((c) => c.provider === 'iclose')
  if (allowCalendlyBooking && mode === 'calendly') {
    if (calendly && calendly.status !== 'connected') out.push({ text: 'reconnecter Calendly', tab: 'booking' })
    else if (calendly && !s.booking?.calendly?.event_type_uri) {
      out.push({ text: 'choisir une page de réservation Calendly', tab: 'booking' })
    }
  }
  if (allowIclose && mode === 'iclose') {
    if (iclose && iclose.status !== 'connected') out.push({ text: 'refaire la clé iClose', tab: 'booking' })
    else if (iclose && !s.booking?.iclose?.link_prefix) {
      out.push({ text: 'choisir une page de réservation iClose', tab: 'booking' })
    }
  }
  return out
}
