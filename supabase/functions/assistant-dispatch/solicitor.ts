// Aucun import : testé sous Vitest. Quelqu'un qui écrit pour vendre sa propre offre n'est pas un
// prospect : on ne lui répond pas, le client verra lui-même s'il veut donner suite.

type Message = { author_type: string; body_text?: string | null; transcript?: string | null }

// Une seule vérification par conversation, avant toute réponse du compte. Après, la conversation
// est engagée et se taire d'un coup serait pire que répondre.
export function shouldCheckSolicitor(enabled: unknown, metadata: Record<string, unknown>, messages: Message[]) {
  if (enabled !== true || metadata.solicitor_checked === true) return false
  return messages.length > 0 && messages.every((m) => m.author_type === 'customer')
}

export const SOLICITOR_SYSTEM = `Tu tries les premiers messages reçus en privé par un compte Instagram qui vend un accompagnement ou un produit.
Réponds {"demarchage": true} seulement si la personne écrit clairement pour vendre ou proposer SA propre offre au compte : prestation, produit, partenariat payant, agence, logiciel, recrutement commercial.
Réponds {"demarchage": false} dans tous les autres cas : question, mot-clé, remerciement, réaction à un contenu, salut, message flou, personne qui parle de son activité sans rien proposer. Dans le doute, false.
Uniquement le JSON.`

export function solicitorInput(messages: Message[]) {
  return messages
    .map((m) => (m.body_text ?? m.transcript ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 1500)
}

export function readSolicitorVerdict(text: string) {
  return /"demarchage"\s*:\s*true/.test(text)
}
