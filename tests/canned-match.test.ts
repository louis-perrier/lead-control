import { describe, expect, it } from 'vitest'
import {
  bestKeywordMatch,
  isOnlyPoliteness,
  matchKeyword,
  normalizeWords,
  sameWord,
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
