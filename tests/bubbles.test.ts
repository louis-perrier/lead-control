import { describe, expect, it } from 'vitest'
import { LONG_BUBBLE, MAX_BUBBLES, splitReply, splitReplyPieces, typingPauses } from '../supabase/functions/assistant-dispatch/bubbles'

const SPLIT = () => 0
const KEEP = () => 0.99

// Réponses réellement envoyées par l'agent d'un client.
const REAL = {
  context: "Ça se comprend, viser les vues c'est logique pour démarrer. Toi de ton côté t'es plutôt sur un travail à côté en ce moment, ou t'as du temps à consacrer à ça ?",
  long: "Ouais exactement, c'est clairement plus dur de percer avec un sujet random généré par IA que sur un truc où t'as une vraie expertise ou passion derrière, parce que ça se sent dans le contenu et ça crée une vraie connexion avec l'audience. Entre la lutte et la plomberie/clim, y'a lequel des deux qui te motiverait le plus à en parler au quotidien ?",
  link: "C'est logique avec ce que tu démarres, le temps c'est la ressource la plus dure à trouver en ce moment. Vu que c'est encore une passion et pas une priorité pour l'instant, je te partage juste mon Skool où tu peux avancer à ton rythme sans pression : https://www.skool.com/the-expansion-build-6110/about?utm_source=leadcontrol&utm_content=69",
  skool: "OK je comprends, du coup c'est clair que investir maintenant c'est pas le bon moment pour toi et c'est totalement logique vu ta situation. Par contre j'ai un Skool gratuit avec pas mal de valeur dessus sur la création de contenu, ça peut déjà t'aider à avancer et voir si ça matche avec ce que tu veux faire, je t'envoie le lien ?",
  figures: "Y a pas de chiffre fixe pour ça, ça dépend surtout de la stratégie mise en place et de la régularité, donc difficile de te donner un temps ou un revenu universel. Toi t'en es où sur ce projet de vidéos IA, tu as déjà commencé à poster ou c'est encore une idée ?",
}

describe('splitReply', () => {
  it('ne réécrit jamais le texte', () => {
    const samples = [...Object.values(REAL), 'Bulle 1\n\nBulle 2\n\nBulle 3\n\nBulle 4', 'Salut ! 🙂 Tu fais quoi ?', 'Ok']
    for (const text of samples) {
      for (const random of [SPLIT, KEEP]) {
        const pieces = splitReplyPieces(text, random)
        expect(pieces.map((p) => p.sep + p.text).join('')).toBe(text.trim())
        expect(pieces.length).toBeLessThanOrEqual(MAX_BUBBLES)
      }
    }
  })

  it('envoie la question à part huit fois sur dix', () => {
    expect(splitReply(REAL.context, SPLIT)).toEqual([
      "Ça se comprend, viser les vues c'est logique pour démarrer.",
      "Toi de ton côté t'es plutôt sur un travail à côté en ce moment, ou t'as du temps à consacrer à ça ?",
    ])
  })

  it('garde un message court entier les autres fois', () => {
    expect(splitReply(REAL.context, KEEP)).toEqual([REAL.context])
  })

  it('coupe toujours un bloc long, avant un mot de liaison si la phrase est unique', () => {
    const bubbles = splitReply(REAL.long, KEEP)
    expect(bubbles).toHaveLength(3)
    expect(bubbles[0]).toMatch(/passion derrière$/)
    expect(bubbles[1]).toMatch(/^parce que ça se sent/)
    expect(bubbles[2]).toMatch(/^Entre la lutte/)
    const elided = `${'a'.repeat(120)}, parce qu'il faut du temps pour ${'b'.repeat(80)}`
    expect(splitReply(elided, KEEP)[1]).toMatch(/^parce qu'il/)
  })

  it('ne coupe jamais un lien', () => {
    const bubbles = splitReply(REAL.link, SPLIT)
    expect(bubbles.some((b) => b.includes('https://www.skool.com/the-expansion-build-6110/about?utm_source=leadcontrol&utm_content=69'))).toBe(true)
  })

  it('coupe les bulles longues au plus près du milieu, entre deux phrases', () => {
    for (const random of [SPLIT, KEEP]) {
      expect(splitReply(REAL.figures, random)).toEqual([
        "Y a pas de chiffre fixe pour ça, ça dépend surtout de la stratégie mise en place et de la régularité, donc difficile de te donner un temps ou un revenu universel.",
        "Toi t'en es où sur ce projet de vidéos IA, tu as déjà commencé à poster ou c'est encore une idée ?",
      ])
    }
    expect(splitReply(REAL.skool, SPLIT)[0].length).toBeLessThanOrEqual(LONG_BUBBLE)
  })

  it('ne laisse jamais un emoji seul dans une bulle', () => {
    expect(splitReply('Tu fais quoi dans la vie ? 🙂', SPLIT)).toEqual(['Tu fais quoi dans la vie ? 🙂'])
  })

  it('garde toutes les bulles du modèle, trois au plus', () => {
    expect(splitReply('Un\n\nDeux\n\nTrois', KEEP)).toEqual(['Un', 'Deux', 'Trois'])
    expect(splitReply('Un\n\nDeux\n\nTrois\n\nQuatre', KEEP)).toHaveLength(3)
  })
})

describe('typingPauses', () => {
  it('reste sous dix secondes au total', () => {
    const pauses = typingPauses(['a'.repeat(170), 'b'.repeat(170), 'c'.repeat(170)])
    expect(pauses[0]).toBe(1500)
    expect(pauses.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10_000)
  })
})
