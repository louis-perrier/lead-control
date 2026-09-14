import { admin } from '../_shared/core.ts'

// Un message arrivé pendant la rédaction replanifie la conversation et une pause du coach doit
// tenir : l'état n'est posé que s'il n'a pas bougé, sinon seules les données communes le sont.
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
