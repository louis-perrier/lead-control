import { describe, expect, it } from 'vitest'
import { downsample, encodeWav, formatDuration } from '@/lib/audio'

function readAscii(view: DataView, offset: number, length: number) {
  let out = ''
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i))
  return out
}

describe('downsample', () => {
  it('réduit la longueur selon le rapport des fréquences', () => {
    const input = new Float32Array(4800).fill(0.5)
    expect(downsample(input, 48000, 16000).length).toBe(1600)
  })

  it('laisse le signal intact si la cible est plus haute', () => {
    const input = new Float32Array([0.1, 0.2, 0.3])
    expect(downsample(input, 8000, 16000)).toBe(input)
  })
})

describe('encodeWav', () => {
  it('écrit un en-tête RIFF/WAVE mono 16 bits à la bonne fréquence', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1]), 16000)
    const view = new DataView(await blob.arrayBuffer())
    expect(readAscii(view, 0, 4)).toBe('RIFF')
    expect(readAscii(view, 8, 4)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(6)
  })

  it('borne les échantillons hors plage au maximum signé', async () => {
    const view = new DataView(await encodeWav(new Float32Array([2, -2])).arrayBuffer())
    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
  })
})

describe('formatDuration', () => {
  it('affiche minutes et secondes', () => {
    expect(formatDuration(5000)).toBe('0:05')
    expect(formatDuration(65000)).toBe('1:05')
  })
})
