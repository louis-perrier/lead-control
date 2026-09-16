import { describe, expect, it } from 'vitest'
import {
  bestKeywordMatch,
  cannedPreview,
  firstJsonObject,
  isOnlyPoliteness,
  keywordCheckInput,
  matchKeyword,
  normalizeWords,
  sameWord,
  sendsWithoutCheck,
  situationList,
  triggerKind,
} from '../supabase/functions/_shared/canned-match'

describe('triggerKind', () => {
  it('reconnaît un mot-clé court', () => {
    expect(triggerKind('Vidéo ia')).toBe('keyword')
    expect(triggerKind('Prix')).toBe('keyword')
  })

  it('reconnaît une situation', () => {
    expect(triggerKind('Tu fais des vidéos depuis combien de temps ?')).toBe('situation')
    expect(triggerKind('Le prospect demande ce que je fais dans la vie')).toBe('situation')
    expect(triggerKind('Tu fais quoi ?')).toBe('situation')
  })
})

describe('matchKeyword', () => {
  it('les messages réels « Vidéo IA » correspondent exactement', () => {
    for (const message of ['Video IA', 'vidéo ia', 'video ia', 'Vidéo IA 🙏', 'VIDÉOS IA', 'salut vidéo ia', 'Vidéo IA stp']) {
      expect(matchKeyword(message, 'Vidéo ia')).toBe('exact')
    }
  })

  it('tolère une lettre inversée sur un mot long', () => {
    expect(matchKeyword('vidoé ia', 'Vidéo ia')).toBe('exact')
  })

  it('reste strict sur les mots courts', () => {
    expect(matchKeyword('vidéo ai', 'Vidéo ia')).toBe('none')
  })

  it('repère le mot-clé au milieu d’un message plus long', () => {
    expect(matchKeyword('Oui de vidéo IA', 'Vidéo ia')).toBe('contains')
    expect(matchKeyword('Salut pour crée des vidéo ia de fruit', 'Vidéo ia')).toBe('contains')
  })

  it('ne confond pas deux sujets', () => {
    expect(matchKeyword('Je veux faire des vidéos TikTok', 'Vidéo ia')).toBe('none')
  })

  it('ignore les marqueurs de vocal', () => {
    expect(matchKeyword('[Vocal] vidéo IA', 'Vidéo ia')).toBe('exact')
  })

  it('garde un mot de politesse quand il est le mot-clé', () => {
    expect(matchKeyword('Merci !', 'merci')).toBe('exact')
  })
})

describe('outils', () => {
  it('normalise accents, emojis et apostrophes', () => {
    expect(normalizeWords("C'est quoi ta vidéo ? 🙏")).toEqual(['c', 'est', 'quoi', 'ta', 'video'])
  })

  it('compare singulier et pluriel', () => {
    expect(sameWord('videos', 'video')).toBe(true)
    expect(sameWord('ia', 'ai')).toBe(false)
  })

  it('repère un message fait seulement de politesse', () => {
    expect(isOnlyPoliteness('Bonjour 👋')).toBe(true)
    expect(isOnlyPoliteness('🙏')).toBe(true)
    expect(isOnlyPoliteness('Bonjour, vidéo IA')).toBe(false)
  })

  it('préfère une correspondance exacte, puis le mot-clé le plus long', () => {
    const entries = [{ trigger: 'vidéo' }, { trigger: 'vidéo ia' }, { trigger: 'Tu fais quoi ?' }]
    expect(bestKeywordMatch('vidéo ia', entries)).toEqual({ entry: entries[1], match: 'exact' })
    expect(bestKeywordMatch('je veux des vidéos ia', entries)).toEqual({ entry: entries[1], match: 'contains' })
    expect(bestKeywordMatch('tu fais quoi ?', entries)).toBeNull()
  })
})

describe('firstJsonObject', () => {
  it('lit le JSON même suivi d’une explication', () => {
    expect(firstJsonObject('{"situation": 1, "reste": false}\n\nLe prospect demande {vraiment} ça.')).toEqual({ situation: 1, reste: false })
    expect(firstJsonObject('```json\n{"envoyer": true, "reste": true}\n```')).toEqual({ envoyer: true, reste: true })
  })

  it('renvoie null sans JSON lisible', () => {
    expect(firstJsonObject('{"situation": 1, "res')).toBeNull()
    expect(firstJsonObject('aucune')).toBeNull()
  })
})

describe('texte soumis au petit modèle', () => {
  const vocal = {
    trigger: 'Tu fais des vidéos depuis combien de temps ?',
    kind: 'audio' as const,
    transcript: '  Moi ça fait trois ans que je fais des vidéos.  ',
  }

  it('montre ce que dit un vocal quand il est transcrit', () => {
    expect(cannedPreview(vocal)).toBe('(message vocal) Moi ça fait trois ans que je fais des vidéos.')
    expect(cannedPreview({ kind: 'audio' })).toBe('(message vocal)')
    expect(cannedPreview({ kind: 'audio', transcript: 'x'.repeat(900) })).toHaveLength(616)
    expect(cannedPreview({ kind: 'text', text: 'Salut' })).toBe('Salut')
  })

  it('garde le format d’origine sans moment', () => {
    const entry = { trigger: 'Vidéo ia', kind: 'text' as const, text: 'Tu débutes ?' }
    expect(situationList([entry])).toBe('1. Vidéo ia\n   Réponse associée : Tu débutes ?')
    expect(keywordCheckInput(entry)).toBe('Mot-clé : Vidéo ia\nRéponse préenregistrée : Tu débutes ?')
  })

  it('ajoute le moment quand il est précisé', () => {
    const entry = { ...vocal, moment: ' il vient de dire qu’il débute ' }
    expect(situationList([{ trigger: 'Prix', text: 'Gratuit' }, entry])).toBe(
      '1. Prix\n   Réponse associée : Gratuit\n' +
        '2. Tu fais des vidéos depuis combien de temps ?\n   Moment : il vient de dire qu’il débute\n' +
        '   Réponse associée : (message vocal) Moi ça fait trois ans que je fais des vidéos.',
    )
    expect(keywordCheckInput({ trigger: 'Vidéo ia', text: 'Ok', moment: 'il débute' })).toBe(
      'Mot-clé : Vidéo ia\nMoment : il débute\nRéponse préenregistrée : Ok',
    )
  })

  it('vérifie un mot-clé exact dès qu’un moment est précisé', () => {
    expect(sendsWithoutCheck({ entry: { trigger: 'Vidéo ia' }, match: 'exact' })).toBe(true)
    expect(sendsWithoutCheck({ entry: { trigger: 'Vidéo ia', moment: '  ' }, match: 'exact' })).toBe(true)
    expect(sendsWithoutCheck({ entry: { trigger: 'Vidéo ia', moment: 'il débute' }, match: 'exact' })).toBe(false)
    expect(sendsWithoutCheck({ entry: { trigger: 'Vidéo ia' }, match: 'contains' })).toBe(false)
  })
})
