import { admin } from './core.ts'

export const GRAPH = 'https://graph.instagram.com/v25.0'

export async function getChannelToken(channelAccountId: string): Promise<string | null> {
  const { data, error } = await admin
    .schema('secrets')
    .from('channel_tokens')
    .select('long_lived_token, access_token')
    .eq('channel_account_id', channelAccountId)
    .maybeSingle()
  if (error) throw new Error(`channel_tokens: ${error.message}`)
  return data?.long_lived_token ?? data?.access_token ?? null
}

export async function sendInstagramText(
  token: string,
  igUserId: string,
  recipientId: string,
  text: string,
): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(igUserId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`graph_send_${res.status}:${JSON.stringify(body).slice(0, 300)}`)
  return body.message_id ?? null
}

// Meta va chercher le fichier lui-même à l'URL fournie : elle doit rester joignable
// le temps de l'appel. Formats acceptés côté Instagram : aac, m4a, wav, mp4.
export async function sendInstagramAudio(
  token: string,
  igUserId: string,
  recipientId: string,
  audioUrl: string,
): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(igUserId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { attachment: { type: 'audio', payload: { url: audioUrl, is_reusable: false } } },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`graph_send_audio_${res.status}:${JSON.stringify(body).slice(0, 300)}`)
  return body.message_id ?? null
}

export async function markSeen(token: string, igUserId: string, recipientId: string) {
  try {
    await fetch(`${GRAPH}/${encodeURIComponent(igUserId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'mark_seen',
        access_token: token,
      }),
    })
  } catch (_) {
    // le vu est un confort, jamais bloquant
  }
}

export async function fetchContactProfile(token: string, igScopedId: string) {
  try {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(igScopedId)}?fields=name,username&access_token=${encodeURIComponent(token)}`,
    )
    if (!res.ok) return null
    return (await res.json()) as { name?: string; username?: string }
  } catch (_) {
    return null
  }
}
