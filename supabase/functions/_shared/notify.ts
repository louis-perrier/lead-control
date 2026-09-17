import { admin } from './core.ts'

// Même clé que le trigger des erreurs : une seule notification non lue par conversation,
// l'ancienne est close pour que le push reparte.
export async function notifyNeedsYou(userId: string, conversationId: number, body: string) {
  const key = `conv:${conversationId}`
  try {
    await admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('dedupe_key', key)
      .is('read_at', null)
    await admin.from('notifications').insert({
      user_id: userId,
      conversation_id: conversationId,
      kind: 'needs_you',
      body: body.slice(0, 120),
      dedupe_key: key,
    })
  } catch (_) {
    // une notification perdue ne doit pas bloquer le traitement du message
  }
}
