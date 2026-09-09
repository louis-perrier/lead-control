// Transforme 6 réponses libres du coach en un court bloc de style injectable dans
// le prompt de l'assistant (BLOC 5B). N'extrait que la forme (rythme, longueur,
// ouvertures, niveau de langage), jamais le fond commercial des réponses.
// Double vérification comme l'original n8n : un appel génère, un second juge et
// peut demander une reformulation avant d'activer le bloc.
import { admin, getUser, handleOptions, json } from '../_shared/core.ts'
import { generateText, recordUsage, resolveApiKey } from '../_shared/ai.ts'

const QUESTIONS: Record<string, string> = {
  q1: 'Salut, je suis tombé sur ton contenu, tu proposes quoi exactement ?',
  q2: 'Honnêtement je galère depuis un moment et je ne sais pas par où commencer.',
  q3: 'Ça a l’air bien, mais je ne sais pas si c’est vraiment pour moi.',
  q4: 'Ça coûte combien ? Et est-ce que ça vaut vraiment le coup ?',
  q5: 'Vas droit au but, c’est quoi l’intérêt concret pour moi ?',
  q6: 'Ok, ça me parle, comment je fais pour rejoindre ?',
}

const DEFAULT_TONE =
  '- **Registre** : chaleureux, humain, direct. Tu parles comme quelqu’un qui comprend vraiment la situation de l’autre.'

const GENERATE_SYSTEM = `Tu es un extracteur de style d'écriture, pas un rédacteur.
Un coach répond à des messages types de prospects avec ses propres mots. Ta mission :
repérer uniquement des marqueurs stables et observables de SA façon de formuler
(longueur des phrases, ouvertures, niveau de langage, ponctuation, tics de langage
récurrents), jamais le fond commercial de ce qu'il dit.
Ignore le contenu métier, les fautes, les maladresses. Si les réponses sont trop
courtes ou trop pauvres en signal pour être fiables, reste proche du socle par
défaut plutôt que d'inventer un style.
Réponds UNIQUEMENT avec un court bloc de 3 à 6 lignes, au format de consignes de
style (comme un paragraphe "Registre : ..."), directement injectable dans le
prompt d'un autre agent. N'ajoute aucune explication autour, aucun exemple, aucun
titre. Ne mentionne jamais le contenu des réponses elles-mêmes.`

const VALIDATE_SYSTEM = `Tu es un garde-fou contre le faux personnalisé.
Tu ne juges pas la qualité rédactionnelle d'un bloc de style, tu juges sa valeur
d'imitation réelle : aidera-t-il vraiment un agent à écrire comme CETTE personne,
ou produit-il un ton générique quelconque ? Vérifie aussi qu'il ne reprend aucun
contenu commercial des réponses (produit, prix, promesse), seulement la forme.
Réponds UNIQUEMENT avec un JSON valide : {"decision":"approve"|"retry","issues":["..."]}.
"issues" liste, en français, ce qui doit être corrigé si decision vaut "retry" (vide sinon).`

async function callClaude(apiKey: string, system: string, prompt: string, userId: string, source: 'platform' | 'byok') {
  const res = await generateText({ apiKey, model: 'claude-sonnet-5', system, prompt, maxTokens: 300 })
  await recordUsage({ userId, conversationId: null, model: 'claude-sonnet-5', usage: res.usage, source })
  return res.text.trim()
}

function parseValidation(text: string): { decision: 'approve' | 'retry'; issues: string[] } {
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    const parsed = JSON.parse(text.slice(start, end + 1))
    return {
      decision: parsed.decision === 'retry' ? 'retry' : 'approve',
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((i: unknown) => typeof i === 'string') : [],
    }
  } catch {
    return { decision: 'approve', issues: [] }
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (req.method !== 'POST') return json(req, { error: 'Not found' }, 404)

  let body: { assistant_id?: string; answers?: Record<string, string> } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  const answers = body.answers ?? {}
  const assistantId = body.assistant_id
  if (!assistantId) return json(req, { error: 'missing_assistant' }, 400)

  const { data: assistant } = await admin
    .from('assistants')
    .select('id, user_id')
    .eq('id', assistantId)
    .maybeSingle()
  if (!assistant || assistant.user_id !== user.id) return json(req, { error: 'not_found' }, 404)

  const { data: profile } = await admin.from('profiles').select('plan_override').eq('user_id', user.id).maybeSingle()
  const resolved = await resolveApiKey(user.id, profile?.plan_override ?? null)
  if (!resolved) return json(req, { error: 'no_api_key' }, 409)

  const answered = Object.entries(QUESTIONS).filter(([key]) => (answers[key] ?? '').trim().length > 0)
  if (answered.length < 3) {
    return json(req, { error: 'not_enough_answers' }, 400)
  }

  const transcript = answered
    .map(([key, question]) => `Question : "${question}"\nRéponse du coach : ${answers[key].trim()}`)
    .join('\n\n')

  try {
    let candidate = ''
    let feedback = ''
    let attempt = 0
    const maxAttempts = 2
    while (attempt < maxAttempts) {
      attempt += 1
      candidate = await callClaude(
        resolved.key,
        GENERATE_SYSTEM,
        `Socle de ton par défaut, à utiliser comme référence si le signal est faible :\n${DEFAULT_TONE}\n\n${transcript}${
          feedback ? `\n\nÀ corriger par rapport à la tentative précédente :\n${feedback}` : ''
        }`,
        user.id,
        resolved.source,
      )
      const verdictText = await callClaude(
        resolved.key,
        VALIDATE_SYSTEM,
        `Socle par défaut :\n${DEFAULT_TONE}\n\nBloc candidat à juger :\n${candidate}`,
        user.id,
        resolved.source,
      )
      const verdict = parseValidation(verdictText)
      if (verdict.decision === 'approve' || attempt >= maxAttempts) break
      feedback = verdict.issues.join('\n- ')
    }
    const block = candidate || DEFAULT_TONE
    await admin.from('assistants').update({ custom_tone: block, updated_at: new Date().toISOString() }).eq('id', assistantId)
    return json(req, { ok: true, tone: block })
  } catch (e) {
    return json(req, { error: 'generation_failed', message: String(e).slice(0, 200) }, 500)
  }
})
