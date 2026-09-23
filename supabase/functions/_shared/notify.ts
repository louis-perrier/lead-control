import { admin } from './core.ts'

// Même clé que le trigger des erreurs : une seule notification non lue par conversation.
// renew clôt l'ancienne pour que le push reparte ; sans lui, une notification non lue suffit.
export async function notifyNeedsYou(userId: string, conversationId: number, body: string, opts: { renew?: boolean } = {}) {
  const key = `conv:${conversationId}`
  try {
    if (opts.renew) {
      await admin
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('dedupe_key', key)
        .is('read_at', null)
    }
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

// Panne qui touche tout le compte et non une conversation : même clé que le trigger d'erreur,
// donc une seule notification non lue quel que soit le nombre de conversations concernées.
export async function notifyAccount(userId: string, dedupeKey: string, body: string) {
  try {
    await admin.from('notifications').insert({
      user_id: userId,
      conversation_id: null,
      kind: 'needs_you',
      body: body.slice(0, 120),
      dedupe_key: dedupeKey,
    })
  } catch (_) {
    // idem : une notification perdue ne bloque rien
  }
}

// Relance que le coach doit envoyer lui-même depuis Instagram, la fenêtre Meta étant fermée.
// Clé distincte de conv:<id> pour ne pas écraser une demande d'aide encore ouverte.
export async function notifyFollowupToSend(userId: string, conversationId: number, body: string) {
  const key = `conv:${conversationId}:followup`
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
      kind: 'followup',
      body: body.slice(0, 120),
      dedupe_key: key,
    })
  } catch (_) {
    // la relance reste visible dans la boîte même sans notification
  }
}
