import { describe, expect, it } from 'vitest'
import {
  hasMissingFallback,
  hasNameVariable,
  renderFollowupText,
  usableDisplayName,
} from '../supabase/functions/_shared/followup-text'

describe('renderFollowupText', () => {
  it('écrit le prénom quand il est connu', () => {
    expect(renderFollowupText('Hey {prénom|toi}, t’as pu regarder ?', 'Julien')).toBe('Hey Julien, t’as pu regarder ?')
  })

  it('écrit le texte de secours sinon', () => {
    expect(renderFollowupText('Hey {prénom|toi}, t’as pu regarder ?', null)).toBe('Hey toi, t’as pu regarder ?')
  })

  it('accepte la variable sans accent et avec espaces', () => {
    expect(renderFollowupText('Salut { prenom | champion } !', null)).toBe('Salut champion !')
  })

  it('ne laisse pas d’espace orphelin quand le secours est vide', () => {
    expect(renderFollowupText('Salut {prénom}, ça va ?', null)).toBe('Salut, ça va ?')
  })
})

describe('contrôles de l’écran', () => {
  it('repère la variable', () => {
    expect(hasNameVariable('Hey {prénom|toi}')).toBe(true)
    expect(hasNameVariable('Hey toi')).toBe(false)
  })

  it('refuse une variable sans texte de secours', () => {
    expect(hasMissingFallback('Hey {prénom}')).toBe(true)
    expect(hasMissingFallback('Hey {prénom| }')).toBe(true)
    expect(hasMissingFallback('Hey {prénom|toi}')).toBe(false)
  })
})

describe('usableDisplayName', () => {
  it('garde un vrai prénom', () => {
    expect(usableDisplayName('Julien', 'julien.fit')).toBe('Julien')
    expect(usableDisplayName('julien martin', 'jm_93')).toBe('Julien')
    expect(usableDisplayName('Anne-Sophie', 'as.run')).toBe('Anne-Sophie')
  })

  it('écarte les pseudos, les chiffres et les mots de marque', () => {
    expect(usableDisplayName('coach_fit_93', 'coach_fit_93')).toBeNull()
    expect(usableDisplayName('Karim 93', 'karim93')).toBeNull()
    expect(usableDisplayName('Coach Karim', 'coachkarim')).toBeNull()
    expect(usableDisplayName('marceaukesh', 'marceaukesh')).toBeNull()
    expect(usableDisplayName('', 'x')).toBeNull()
  })
})
