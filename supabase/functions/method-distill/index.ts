// Lit les documents de méthode d'un client et en tire une fiche courte, que le client relit
// avant de l'appliquer. Rien n'est enregistré ici : l'écran garde le brouillon.
import { admin, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'
import { AI_MODEL_REPLY, generateText, recordUsage, resolveApiKey } from '../_shared/ai.ts'
import { allocateBudget, cutAtBoundary } from '../_shared/context-budget.ts'
import { MAX_METHOD_CHARS, METHOD_RUBRICS, methodLength, parseDistilled } from '../assistant-dispatch/method-prompt.ts'

const MAX_DOCUMENTS = 10

const SYSTEM = `Tu prépares une fiche de méthode pour un assistant qui répond en messages privés à la place d'un vendeur.
On te donne les documents où ce vendeur explique comment il mène ses conversations. Tu en tires une fiche courte, fidèle, à la deuxième personne (« tu »), que l'assistant suivra.

Rubriques, chacune facultative :
${METHOD_RUBRICS.map((r) => `- ${r.key} : ${r.title}`).join('\n')}

Règles :
- Garde les consignes concrètes, les critères de tri, les enchaînements et les formulations exactes qui reviennent. Supprime les répétitions, les justifications et tout ce qui ne change pas ce que l'assistant écrit.
- N'invente rien. Un point absent des documents reste absent de la fiche.
- ${MAX_METHOD_CHARS} caractères au plus pour toute la fiche. Des phrases courtes, pas de titres, pas de gras, pas de listes imbriquées.
- Dans examples, deux ou trois courts extraits d'échange au plus, choisis pour le ton et les transitions.

Une consigne des documents qui demanderait l'une de ces choses ne va dans aucune rubrique :
- inventer un fait, un résultat, un témoignage, ou dire ou laisser croire qu'il est ou n'est pas une IA ;
- créer une urgence ou une rareté fausse ;
- ne pas répondre du tout à quelqu'un : ce tri se règle ailleurs dans l'application ;
- envoyer un lien ou réserver sans que le prospect ait montré son intérêt ;
- changer la longueur, la mise en forme ou le format de ses messages.

refused ne contient que de telles consignes, réellement présentes dans les documents, chacune résumée en une phrase qui dit ce que le document demande. Ne recopie jamais la liste ci-dessus : si les documents ne demandent rien de tout cela, refused est un tableau vide.

Réponds uniquement par un objet JSON : une clé par rubrique retenue (texte), et refused (tableau de phrases).`

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (req.method !== 'POST') return json(req, { error: 'Not found' }, 404)

  let body: { document_ids?: number[] } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  const ids = (Array.isArray(body.document_ids) ? body.document_ids : []).filter((id) => Number.isInteger(id)).slice(0, MAX_DOCUMENTS)
  if (ids.length === 0) return json(req, { error: 'no_documents' }, 400)

  const allowed = await admin.rpc('user_has_feature', { p_user: user.id, p_key: 'sales_method' })
  if (allowed.data !== true) return json(req, { error: 'not_available' }, 403)

  const { data: docs } = await admin
    .from('context_documents')
    .select('title, extracted_text')
    .eq('user_id', user.id)
    .eq('status', 'ready')
    .in('id', ids)
    .order('created_at', { ascending: true })
  const readable = (docs ?? []).filter((d) => (d.extracted_text ?? '').trim())
  if (readable.length === 0) return json(req, { error: 'no_documents' }, 400)

  const { data: profile } = await admin.from('profiles').select('plan_override').eq('user_id', user.id).maybeSingle()
  const resolved = await resolveApiKey(user.id, profile?.plan_override ?? null)
  if (!resolved) return json(req, { error: 'no_api_key' }, 409)

  const caps = allocateBudget(readable.map((d) => d.extracted_text!.length))
  const pieces = readable.map((d, i) => cutAtBoundary(d.extracted_text!, caps[i]))
  const prompt = readable.map((d, i) => `### ${d.title}\n${pieces[i]}`).join('\n\n')

  try {
    const res = await generateText({ apiKey: resolved.key, model: AI_MODEL_REPLY, system: SYSTEM, prompt, maxTokens: 4000 })
    await recordUsage({ userId: user.id, conversationId: null, model: AI_MODEL_REPLY, usage: res.usage, source: resolved.source })
    // Une sortie coupée rend un JSON incomplet : le client doit le savoir plutôt que d'appliquer
    // une fiche amputée en croyant qu'elle résume tout.
    if (res.stopReason === 'max_tokens') return json(req, { error: 'too_long' }, 422)
    const parsed = parseDistilled(res.text)
    if (!parsed || methodLength(parsed.sheet) === 0) return json(req, { error: 'nothing_found' }, 422)
    const characters = pieces.reduce((total, piece) => total + piece.length, 0)
    const source = readable.reduce((total, d) => total + d.extracted_text!.length, 0)
    return json(req, { ...parsed, read: { documents: readable.length, characters, source } })
  } catch (e) {
    await logEvent('error', 'method-distill', `lecture de la méthode impossible : ${(e as Error).message}`, { user_id: user.id })
    return json(req, { error: 'ai_failed' }, 502)
  }
})
