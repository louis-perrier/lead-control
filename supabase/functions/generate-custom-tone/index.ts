// Transforme 6 réponses libres du coach en un court bloc de style injectable dans
// le prompt de l'assistant (BLOC 5B). N'extrait que la forme (rythme, longueur,
// ouvertures, niveau de langage), jamais le fond commercial des réponses.
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

const SYSTEM = `Tu es un extracteur de style d'écriture, pas un rédacteur.
Un coach répond à 6 messages types de prospects avec ses propres mots. Ta mission :
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
    const res = await generateText({
      apiKey: resolved.key,
      model: 'claude-sonnet-5',
      system: SYSTEM,
      prompt: `Socle de ton par défaut, à utiliser comme référence si le signal est faible :\n${DEFAULT_TONE}\n\n${transcript}`,
      maxTokens: 300,
    })
    await recordUsage({ userId: user.id, conversationId: null, model: 'claude-sonnet-5', usage: res.usage, source: resolved.source })
    const block = res.text.trim() || DEFAULT_TONE
    await admin.from('assistants').update({ custom_tone: block, updated_at: new Date().toISOString() }).eq('id', assistantId)
    return json(req, { ok: true, tone: block })
  } catch (e) {
    return json(req, { error: 'generation_failed', message: String(e).slice(0, 200) }, 500)
  }
})
