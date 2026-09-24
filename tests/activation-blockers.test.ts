import { describe, expect, it } from 'vitest'
import { activationBlockers } from '../lib/activation-blockers'

const ready = {
  settings: {
    product: { name: 'Coaching' },
    context: 'Je vends du coaching.',
    stop_condition: { text: 'Réserver un appel' },
    booking: { mode: 'link' },
  },
} as Parameters<typeof activationBlockers>[0]['assistant']

const connected = { status: 'connected' as const }
const flags = { allowCalendar: true, allowCalendlyBooking: true, allowIclose: true }

function run(over: Partial<Parameters<typeof activationBlockers>[0]>) {
  return activationBlockers({ assistant: ready, channel: connected, accounts: [], ...flags, ...over })
}

describe('activationBlockers', () => {
  it('ne bloque rien quand tout est renseigné', () => {
    expect(run({})).toEqual([])
  })

  it('renvoie chaque manque vers son onglet', () => {
    const out = activationBlockers({
      assistant: { settings: {} },
      channel: undefined,
      accounts: [],
      ...flags,
    })
    expect(out.map((b) => [b.text, b.tab])).toEqual([
      ['relier un compte Instagram connecté', 'operation'],
      ['renseigner le produit ou service', 'offer'],
      ['renseigner le contexte de vente', 'offer'],
      ["définir l'objectif de la conversation", 'booking'],
    ])
  })

  it('bloque un compte Instagram expiré', () => {
    expect(run({ channel: { status: 'expired' } }).map((b) => b.tab)).toEqual(['operation'])
  })

  it('ne bloque pas un mode agenda sans compte relié', () => {
    const assistant = { settings: { ...ready.settings, booking: { mode: 'calendly' } } }
    expect(run({ assistant })).toEqual([])
  })

  it('demande de reconnecter un outil expiré, puis de choisir une page', () => {
    const assistant = { settings: { ...ready.settings, booking: { mode: 'calendly' } } }
    expect(run({ assistant, accounts: [{ provider: 'calendly', status: 'expired' }] })[0].text).toBe('reconnecter Calendly')
    expect(run({ assistant, accounts: [{ provider: 'calendly', status: 'connected' }] })[0]).toEqual({
      text: 'choisir une page de réservation Calendly',
      tab: 'booking',
    })
    const iclose = { settings: { ...ready.settings, booking: { mode: 'iclose' } } }
    expect(run({ assistant: iclose, accounts: [{ provider: 'iclose', status: 'error' }] })[0].text).toBe('refaire la clé iClose')
    expect(run({ assistant: iclose, accounts: [{ provider: 'iclose', status: 'connected' }] })[0].text).toBe(
      'choisir une page de réservation iClose',
    )
    const google = { settings: { ...ready.settings, booking: { mode: 'calendar' } } }
    expect(run({ assistant: google, accounts: [{ provider: 'google', status: 'expired' }] })[0].text).toBe('reconnecter Google Agenda')
  })

  it('ignore un outil dont le module est fermé', () => {
    const assistant = { settings: { ...ready.settings, booking: { mode: 'iclose' } } }
    expect(run({ assistant, accounts: [{ provider: 'iclose', status: 'error' }], allowIclose: false })).toEqual([])
  })
})
