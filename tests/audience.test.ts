import { describe, expect, it } from 'vitest'
import { audienceBlocks } from '../supabase/functions/_shared/audience'

const liste = { audience: { mode: 'blocklist', handles: ['@Marceau_Kesh', 'noah_visual'] } }
const blanche = { audience: { mode: 'allowlist', handles: ['ami_test'] } }

describe('audienceBlocks', () => {
  it('laisse passer quand aucun filtre n’est réglé', () => {
    expect(audienceBlocks(null, 'marceau_kesh')).toBe(false)
    expect(audienceBlocks({ audience: { mode: 'all' } }, 'marceau_kesh')).toBe(false)
  })

  it('bloque un compte exclu quels que soient l’arobase et la casse', () => {
    expect(audienceBlocks(liste, 'marceau_kesh')).toBe(true)
    expect(audienceBlocks(liste, '@Marceau_Kesh')).toBe(true)
    expect(audienceBlocks(liste, ' noah_visual ')).toBe(true)
  })

  it('laisse passer un compte absent de la liste d’exclusion', () => {
    expect(audienceBlocks(liste, 'wael.49.11')).toBe(false)
  })

  it('en liste blanche, ne laisse passer que les comptes autorisés', () => {
    expect(audienceBlocks(blanche, 'ami_test')).toBe(false)
    expect(audienceBlocks(blanche, 'inconnu')).toBe(true)
  })

  it('en liste blanche, bloque un compte dont le pseudo est encore inconnu', () => {
    expect(audienceBlocks(blanche, null)).toBe(true)
    expect(audienceBlocks(liste, null)).toBe(false)
  })
})
