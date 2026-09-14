import { admin } from '../_shared/core.ts'

// L'état de fin n'est posé que si la conversation est toujours dans l'état réservé :
// un message arrivé pendant la rédaction l'a replanifiée, une pause du coach doit tenir.
// Renvoie false quand l'état a changé entre-temps, seules les données communes sont écrites.
export async function finalizeConversation(
  convId: number,
  statePatch: Record<string, unknown>,
  commonPatch: Record<string, unknown>,
) {
  const common = {
    ...commonPatch,
    is_processing: false,
    processing_started_at: null,
    updated_at: new Date().toISOString(),
  }
  const { data } = await admin
    .from('conversations')
    .update({ ...common, ...statePatch })
    .eq('id', convId)
    .eq('automation_state', 'pending')
    .select('id')
  if (data && data.length > 0) return true
  await admin.from('conversations').update(common).eq('id', convId)
  return false
}
