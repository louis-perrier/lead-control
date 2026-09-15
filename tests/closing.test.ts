import { describe, expect, it } from 'vitest'
import { closingCheck, isFarewell } from '../supabase/functions/assistant-dispatch/closing'

let nextId = 1
const agent = (body: string) => ({ id: nextId++, author_type: 'agent', message_type: 'text', body_text: body, send_state: 'sent' })
const human = (body: string) => ({ id: nextId++, author_type: 'human', message_type: 'text', body_text: body, send_state: 'sent' })
const prospect = (body: string) => ({ id: nextId++, author_type: 'customer', message_type: 'text', body_text: body, send_state: 'received' })

describe('closingCheck, fins réelles', () => {
  it('« À bientôt » après « Avec plaisir, à bientôt ! » : like sans appel IA', () => {
    const r = closingCheck([prospect('Oui tkt merci'), agent('Avec plaisir, à bientôt !'), prospect('À bientôt')])
    expect(r?.verdict).toBe('like')
  })

  it('« Ok merci » après une invitation à revenir : like', () => {
    const r = closingCheck([
      prospect('Merci beaucoup mec ça remotive bien'),
      agent("Avec plaisir, hésite pas si t'as des questions en regardant le Skool ce soir."),
      prospect('Ok merci'),
    ])
    expect(r?.verdict).toBe('like')
  })

  it('« Merci 🙏 » après « courage pour la suite » : like', () => {
    const r = closingCheck([prospect('Merci'), agent('Avec plaisir, courage pour la suite 🙂'), prospect('Merci 🙏')])
    expect(r?.verdict).toBe('like')
  })

  it('un remerciement plus personnel se confirme par le petit modèle', () => {
    const r = closingCheck([
      prospect('Merci beaucoup pour votre aide'),
      agent('Avec plaisir, prends soin de toi et à bientôt sur la communauté 🙂'),
      prospect('Merci beaucoup encore une fois \nVous avez un bon coeur'),
    ])
    expect(r?.verdict).toBe('ask')
  })

  it('plusieurs messages courts d’affilée comptent ensemble, le like vise le dernier', () => {
    const turn = agent('Voilà le lien, à bientôt sur le groupe : https://www.skool.com/groupe')
    const first = prospect('Merci 🙏')
    const last = prospect('Merci de ton aide')
    const r = closingCheck([turn, first, last])
    expect(r?.verdict).toBe('like')
    expect(r?.targetId).toBe(last.id)
  })
})

describe('closingCheck, l’agent doit répondre', () => {
  it('le compte venait de poser une question', () => {
    expect(closingCheck([agent('Je t’envoie le lien ?'), prospect('ok')])).toBeNull()
    expect(closingCheck([human('Salut, tu as pu recevoir la ressource ?'), prospect('Ok merci')])).toBeNull()
  })

  it('après un lien, l’agent garde son au revoir', () => {
    // Conversation réelle : le « bon courage pour le lancement » qui a suivi est apprécié.
    const r = closingCheck([
      prospect('Oui sa serait intéressant'),
      agent('Nickel, tiens voilà le lien : https://www.skool.com/the-expansion-build-6110/about'),
      agent("Tu vas y trouver de quoi bien démarrer sur la moto, et si jamais t'as un budget plus tard on pourra en reparler."),
      prospect('Ok merci tu gères'),
    ])
    expect(r).toBeNull()
    expect(closingCheck([agent('Yes avec plaisir, voilà le lien : https://www.skool.com/groupe'), prospect('merci')])).toBeNull()
  })

  it('« Oui tkt merci » après l’au revoir de l’agent : like au lieu d’un second au revoir', () => {
    const r = closingCheck([
      prospect('Ok merci tu gères'),
      agent("Avec plaisir, bon courage pour le lancement, et n'hésite pas à revenir vers moi si t'as des questions."),
      prospect('Oui tkt merci'),
    ])
    expect(r?.verdict).toBe('like')
  })

  it('le compte n’avait pas conclu, la qualification continue', () => {
    expect(closingCheck([agent("Ok ça se comprend, c'est normal en démarrage."), prospect('merci')])).toBeNull()
    expect(closingCheck([agent('Il y a plus de monde qui regarde des vidéos courtes aujourd’hui.'), prospect('ok')])).toBeNull()
    expect(closingCheck([agent('N’hésite pas à me dire ce qui te bloque le plus.'), prospect('ok')])?.verdict).toBe('ask')
  })

  it('le prospect relance ou dit autre chose', () => {
    const turn = agent('Avec plaisir, à bientôt !')
    expect(closingCheck([turn, prospect('Et toi ça va ?')])).toBeNull()
    expect(closingCheck([turn, prospect('Pas compris')])?.verdict).toBe('ask')
    expect(closingCheck([turn, prospect('Merci, mais du coup combien coûte l’accompagnement exactement pour moi')])?.verdict).toBe('ask')
    expect(closingCheck([turn, prospect('Merci, mais du coup ça coûte combien exactement l’accompagnement dont tu parlais hier soir ?')])).toBeNull()
    expect(closingCheck([turn, prospect('🤔')])?.verdict).toBe('ask')
  })

  it('un vocal ou une photo passe toujours par une vraie réponse', () => {
    const vocal = { id: nextId++, author_type: 'customer', message_type: 'audio', body_text: null, send_state: 'received' }
    expect(closingCheck([agent('Avec plaisir, à bientôt !'), vocal])).toBeNull()
  })

  it('rien à liker si le dernier message vient du compte', () => {
    expect(closingCheck([prospect('Merci'), agent('Avec plaisir, à bientôt !')])).toBeNull()
  })
})

describe('isFarewell, pour ne pas relancer après un au revoir', () => {
  it('reconnaît un au revoir', () => {
    expect(isFarewell('avec plaisir')).toBe(true)
    expect(isFarewell('Avec plaisir, à bientôt !')).toBe(true)
    expect(isFarewell("Avec plaisir, hésite pas si t'as des questions en regardant le Skool ce soir.")).toBe(true)
  })

  it('garde la relance après une question, un lien ou un message en cours de discussion', () => {
    expect(isFarewell('T’as déjà une idée du sujet ?')).toBe(false)
    expect(isFarewell('Yes avec plaisir, voilà le lien : https://www.skool.com/groupe')).toBe(false)
    expect(isFarewell("Tu vas y trouver de quoi bien démarrer sur la moto.")).toBe(false)
    expect(isFarewell(null)).toBe(false)
  })
})
