import { describe, expect, it } from 'vitest'
import { slackBookingText } from '../supabase/functions/slack-notify/message'

const booking = {
  conversation_id: 42,
  invitee_name: 'Julie Martin',
  invitee_email: 'julie@exemple.fr',
  event_start_at: '2026-09-23T12:30:00Z',
  raw_payload: null,
}
const conv = { provider: 'instagram', contact_name: 'Julie', contact_handle: 'julie.coach', summary: 'Budget 2000 €, manque de temps.' }

describe('slackBookingText', () => {
  it('donne le nom, le profil, la date, le résumé et le lien vers la conversation', () => {
    expect(slackBookingText(booking, conv, 'Europe/Paris')).toBe(
      [
        'Appel réservé avec *Julie Martin* (<https://www.instagram.com/julie.coach/|@julie.coach>)',
        'Quand : mercredi 23 septembre à 14:30',
        'E-mail : julie@exemple.fr',
        '',
        '> Budget 2000 €, manque de temps.',
        '',
        '<https://leadcontrol.fr/app/inbox?c=42|Ouvrir la conversation>',
      ].join('\n'),
    )
  })

  it('ne dit plus ni l’outil, ni le fuseau, ni la page, ni la visio', () => {
    const out = slackBookingText(booking, conv, 'Europe/Paris')
    expect(out).not.toMatch(/Outil|Europe\/Paris|Page :|Visio/)
  })

  it('ne répète pas le pseudo quand il sert déjà de nom', () => {
    const out = slackBookingText({ ...booking, invitee_name: 'julie.coach' }, conv, 'Europe/Paris')
    expect(out.split('\n')[0]).toBe('Appel réservé avec <https://www.instagram.com/julie.coach/|@julie.coach>')
  })

  it('reprend les réponses de l’assistant et le formulaire Calendly du mode lien', () => {
    const own = slackBookingText({ ...booking, raw_payload: { answers: [{ label: 'Téléphone', value: '06 12 34 56 78' }] } }, conv, 'Europe/Paris')
    expect(own).toContain('Téléphone : 06 12 34 56 78')

    const link = slackBookingText(
      {
        ...booking,
        raw_payload: {
          payload: {
            text_reminder_number: '+33 6 12 34 56 78',
            questions_and_answers: [{ question: 'Votre budget ?', answer: '2000 €', position: 0 }],
          },
        },
      },
      conv,
      'Europe/Paris',
    )
    expect(link).toContain('Téléphone : +33 6 12 34 56 78')
    expect(link).toContain('Votre budget ? : 2000 €')
  })

  it('échappe ce qui casserait le texte Slack', () => {
    const out = slackBookingText(booking, { ...conv, summary: 'Veut <plus> de clients & de temps' }, 'Europe/Paris')
    expect(out).toContain('> Veut &lt;plus&gt; de clients &amp; de temps')
  })

  it('reste lisible sans conversation ni nom', () => {
    const out = slackBookingText({ ...booking, conversation_id: null, invitee_name: null, invitee_email: null }, null, 'Europe/Paris')
    expect(out).toBe('Appel réservé avec un prospect\nQuand : mercredi 23 septembre à 14:30')
  })
})
