import { describe, expect, it } from 'vitest'
import { isTokenRejected } from '../supabase/functions/_shared/instagram-errors'

const invalidated =
  'Error: graph_send_401:{"error":{"message":"Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.","type":"OAuthException","code":190,"error_subcode":0}}'

describe('isTokenRejected', () => {
  it('reconnaît une session invalidée par Meta', () => {
    expect(isTokenRejected(new Error(invalidated.replace('Error: ', '')))).toBe(true)
    expect(isTokenRejected('graph_react_401:{}')).toBe(true)
    expect(isTokenRejected('graph_send_audio_401:{"error":{"code":190}}')).toBe(true)
  })

  it('reconnaît un jeton expiré renvoyé en 400 avec le code 190', () => {
    expect(isTokenRejected('graph_send_400:{"error":{"message":"Session has expired","code":190}}')).toBe(true)
  })

  it('laisse passer les autres refus', () => {
    expect(isTokenRejected('graph_send_400:{"error":{"message":"outside window","code":10,"error_subcode":2534022}}')).toBe(false)
    expect(isTokenRejected('graph_send_500:{"error":{"message":"An unexpected error has occurred"}}')).toBe(false)
    expect(isTokenRejected(new Error('channel_tokens: timeout'))).toBe(false)
    expect(isTokenRejected(null)).toBe(false)
  })
})
