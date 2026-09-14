import { redirect } from 'next/navigation'

// Les contacts vivent désormais dans la page Prospects, alimentée par les conversations.
export default function ContactsPage() {
  redirect('/app/prospects')
}
