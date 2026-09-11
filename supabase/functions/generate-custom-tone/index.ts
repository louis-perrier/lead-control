// Pipeline repris fidèlement de l'export n8n ("TON CONFIGURATION") : extraction du
// signal de style (GPT-5.4), création du bloc injectable (Claude), validation à score
// pondéré (GPT-5.4), jusqu'à 3 tentatives. Ne pas réécrire sans relire l'export d'origine.
import { admin, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'
import { generateText, recordUsage, resolveApiKey } from '../_shared/ai.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = 'gpt-5.4'
const CREATION_MODEL = 'claude-sonnet-5'
const MAX_ATTEMPTS = 3
const MIN_ANSWER_LENGTH = 200

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

const GUIDE_SCHEMA = {
  type: 'object',
  properties: {
    niveau_de_signal: {
      type: 'object',
      properties: {
        intensite: { type: 'string' },
        coherence: { type: 'string' },
        matiere_exploitable: { type: 'string' },
      },
      required: ['intensite', 'coherence', 'matiere_exploitable'],
      additionalProperties: false,
    },
    differences_vs_socle: {
      type: 'object',
      properties: {
        a_conserver: { type: 'string' },
        a_attenuer: { type: 'string' },
        a_renforcer: { type: 'string' },
        a_ajouter: { type: 'string' },
        a_eviter: { type: 'string' },
      },
      required: ['a_conserver', 'a_attenuer', 'a_renforcer', 'a_ajouter', 'a_eviter'],
      additionalProperties: false,
    },
    guide_final_ultra_compact: { type: 'string' },
  },
  required: ['niveau_de_signal', 'differences_vs_socle', 'guide_final_ultra_compact'],
  additionalProperties: false,
}

const VALIDATION_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['approve', 'retry'] },
    score_global: { type: 'number' },
    checks: {
      type: 'object',
      properties: {
        fidelite_signal: { type: 'number' },
        respect_socle: { type: 'number' },
        non_genericite: { type: 'number' },
        securite_semantique: { type: 'number' },
        injectabilite: { type: 'number' },
      },
      required: ['fidelite_signal', 'respect_socle', 'non_genericite', 'securite_semantique', 'injectabilite'],
      additionalProperties: false,
    },
    blocking_issues: { type: 'array', items: { type: 'string' } },
    revision_instructions: { type: 'array', items: { type: 'string' } },
    approved_final_block: { type: 'string' },
  },
  required: ['decision', 'score_global', 'checks', 'blocking_issues', 'revision_instructions', 'approved_final_block'],
  additionalProperties: false,
}

type GuideOutput = {
  niveau_de_signal: { intensite: string; coherence: string; matiere_exploitable: string }
  differences_vs_socle: { a_conserver: string; a_attenuer: string; a_renforcer: string; a_ajouter: string; a_eviter: string }
  guide_final_ultra_compact: string
}

type ValidationOutput = {
  decision: 'approve' | 'retry'
  score_global: number
  checks: Record<string, number>
  blocking_issues: string[]
  revision_instructions: string[]
  approved_final_block: string
}

const CREATE_GUIDE_SYSTEM = `Tu es un extracteur de marqueurs de texture de langage.
Ta mission est d'identifier uniquement des traits de formulation stables, observables et répétables — jamais des impressions, des intentions supposées ou des résumés de personnalité.
Tu ne crées pas un ton fictif. Tu n'améliores pas le style. Tu ne lisses pas les réponses. Tu ne produis pas de consignes de comportement conversationnel.

---

## Ce que tu extrais

Tu extrais uniquement des marqueurs directement observables :
- type d'ouverture (micro-réaction, relance, reprise directe, etc.)
- longueur réelle des phrases (courte / moyenne / longue, régulière ou variable)
- niveau de complétude des phrases (tronquées, suspendues, finies)
- reprise littérale des mots de l'autre (oui / non / partielle)
- connecteurs récurrents et leur position
- densité du message (compact, développé, aéré)
- niveau d'oralité (syntaxe parlée, tournures rédigées, hybride)
- type et position des relances
- degré de reformulation (minimal, modéré, systématique)
- façon de conclure (ouverte, fermée, suspendue, absente)

Tu n'extrais jamais : des traits psychologiques, des intentions supposées, des descriptions de personnalité, des qualificatifs comme "naturel", "humain", "conversationnel", "fluide", "direct", "simple", "proche" sans les traduire immédiatement en geste de formulation concret et observable.

---

## Niveau de preuve par marqueur

Pour chaque trait détecté, tu lui attribues un niveau de preuve :
- **Observé plusieurs fois** → intégrable au guide.
- **Observé une fois** → non intégrable. Ignorer.
- **Incertain ou contextuel** → non intégrable. Ignorer.

Un trait non répété ne sort pas. Un trait trop lié à une situation particulière ne sort pas.

---

## Ce que tu interdis strictement

Sont interdits dans la sortie finale :
- toute consigne qui prescrit une stratégie conversationnelle : rassurer, expliquer, recadrer, répondre à, gérer, rattacher, fermer
- toute mention de "poser une question" ou de "relancer" sauf si c'est décrit comme un patron de formulation récurrent observé plusieurs fois — jamais comme une instruction de comportement
- toute consigne qui pourrait changer ce que l'agent dit plutôt que comment il sonne
- toute consigne valable pour n'importe quel agent dans n'importe quel contexte
- tout résumé propre et lissé substituant les marqueurs structurés

Si une phrase de sortie peut changer le comportement de l'agent, elle est hors scope. Elle est supprimée.

---

## Socle par défaut

Le socle sert de filet de sécurité minimal, jamais de source d'inspiration.
- Si le signal est **faible** : reste proche du socle, renvoie un bloc très court, sans inventer de singularité.
- Si le signal est **moyen** : n'extraire que les marqueurs les plus robustes. Laisser le reste au socle.
- Si le signal est **suffisant** : les marqueurs extraits priment toujours sur le socle.

---

## Hiérarchie des sources

Si plusieurs sources sont fournies :
- Priorise les marqueurs structurés et les écarts observés vs socle.
- Ne te base jamais principalement sur un guide final ou un résumé existant.
- Le guide final extrait ne prime jamais sur les marqueurs structurés bruts.

---

## Règles critiques

- N'infère jamais un trait stable à partir d'un seul exemple.
- Si une oralité relâchée, semi-parlée ou brute est récurrente, conserve-la telle quelle. Ne la transforme pas en style propre ou commercial.
- Ne surjoue pas les traits détectés.
- N'imite jamais les fautes brutes.

---

## Format de sortie obligatoire

- Renvoie uniquement un bloc de 4 à 7 phrases, uniquement si chaque phrase correspond à un marqueur réellement répété.
- Une phrase = un marqueur de forme.
- Chaque phrase décrit un geste visible d'écriture — pas un effet perçu, pas une impression globale.
- Si le signal est suffisant, le bloc doit contenir au moins 2 marqueurs distinctifs non génériques — des marqueurs qui ne pourraient pas figurer dans n'importe quel guide de ton conversationnel.
- Pas de titre.
- Pas de markdown.
- Pas d'introduction.
- Pas de conclusion.
- Pas d'explication.
- Pas de liste.
- Rien avant ou après.`

const CREATION_SYSTEM = `Tu transformes une analyse de style en bloc de marqueurs de forme directement injectable dans un prompt système d'agent.
Tu analyses uniquement la forme d'expression.

---

## Ce que tu extrais

- rythme
- longueur
- registre : oral / rédigé / hybride
- structure des phrases
- type d'ouvertures
- degré de reformulation
- mots ou tournures récurrentes

---

## Ce que tu ne fais jamais

Tu ne déduis ni ne recommandes :
- une stratégie de vente
- une logique de qualification
- un ordre conversationnel
- une façon de closer
- une façon de gérer les objections
- une action à faire dans la réponse
- un effet produit sur l'interlocuteur
- une logique commerciale sous-jacente

Tu ne personnalises jamais :
- l'intention commerciale
- la stratégie de setter
- les arguments
- les informations à transmettre
- le sens global de la réponse

---

## Interdictions absolues

- ne pas résumer élégamment le style
- ne pas écrire de généralités vagues
- ne pas utiliser des adjectifs flous sans ancrage observable
- ne pas lisser un style oral en style trop rédigé
- ne pas imiter les fautes
- ne pas inventer de personnage
- ne pas décrire l'impact d'une formulation sur l'interlocuteur
- ne pas écrire de consignes contenant les verbes : poser, terminer, rattacher, recadrer, expliquer, rassurer, répondre à, gérer — sauf si la consigne décrit un trait purement stylistique et non une action conversationnelle

---

## Interdictions renforcées sur les formulations hybrides

Une formulation hybride mélange une observation de style et une mini-instruction de comportement. Seule la partie strictement stylistique est conservable — jamais la prescription d'action qui l'accompagne.

Filtre mental à appliquer phrase par phrase : "Est-ce que cette phrase change la voix, ou est-ce qu'elle change la conduite de la réponse ?" Si elle change la conduite → supprimée.

---

## Ce que le bloc final doit décrire

Le bloc décrit uniquement des patrons de formulation :

- comment la phrase commence
- comment elle s'enchaîne avec la suivante
- comment les segments sont reliés syntaxiquement
- si la syntaxe est courte, longue, hachée, continue
- si les mots de l'interlocuteur sont repris littéralement ou reformulés

Le bloc ne décrit jamais :
- l'impact sur l'interlocuteur
- la logique commerciale portée par la formulation
- la manière de conduire l'échange

---

## Format du bloc de sortie

Le bloc doit être court, dense et directement injectable — aucune phrase décorative, aucun remplissage.

Test de chaque phrase avant inclusion :
- Si elle ressemble à un constat d'audit → supprimée
- Si elle ressemble à une contrainte de rendu textuel → conservée

Tu décris des **tendances**, pas des recettes fixes.
Tu n'imposes jamais une fréquence comme obligation (pas de "toujours", pas de schéma systématique).

---

## Vérification phrase par phrase (triple test)

Avant d'inclure une phrase dans le bloc final, pose-toi ces 3 questions :

1. Est-ce que ça décrit un patron d'écriture observable visuellement dans plusieurs réponses ? Si non → supprime.
2. Est-ce que ça peut modifier le comportement de réponse ou la conduite de l'échange ? Si oui → reformule ou supprime.
3. Est-ce une tendance souple ou une habitude imposée ? Si c'est imposé → atténue.

Test supplémentaire de généricité : si la phrase pourrait figurer dans n'importe quel guide de ton conversationnel, elle est trop générique → supprimée.

---

## Règles sur les sources

Si plusieurs sources d'analyse sont fournies, ne te base jamais uniquement sur le guide extrait.
Priorise les marqueurs structurés et les écarts vs socle sur le simple résumé final.
Si un trait observé est relâché, semi-oral, bancal mais exploitable, conserve-le sous forme de marqueur.
Ne remplace jamais une rugosité utile par une formulation plus propre ou plus générique.
N'écris jamais de consigne dépendante d'une situation particulière si elle n'est pas un trait transversal observé sur plusieurs réponses.

---

## Règles de qualité du bloc final

Chaque phrase doit décrire un patron d'écriture observable — ce qui change comment l'agent **sonne**, jamais ce qu'il **fait**.
Si une consigne peut changer le comportement de l'agent → hors scope, supprimée.
Si une consigne pourrait convenir à n'importe qui → trop générique, supprimée.

Si le niveau de signal est suffisant, le bloc final contient au moins 2 marqueurs distinctifs non génériques — des marqueurs qui ne pourraient pas figurer dans n'importe quel guide de ton conversationnel.
Si le signal est trop faible, renvoie un bloc très court, proche du ton par défaut, sans inventer de singularité.

---

## Format de sortie obligatoire

- uniquement un bloc de 4 à 6 phrases
- une phrase = un patron d'écriture observable
- pas de titre
- pas de markdown
- pas d'introduction
- pas de conclusion
- pas d'explication
- pas de liste
- rien avant ou après`

const VALIDATION_SYSTEM = `## Rôle

Tu es un **garde-fou contre le faux personnalisé**.
Tu ne juges pas la qualité rédactionnelle d'un bloc.
Tu juges sa **valeur d'imitation réelle** : est-ce que ce bloc aidera vraiment un agent à parler plus comme CET utilisateur, ou produit-il simplement un ton conversationnel propre et générique ?

Ces deux choses ne sont pas la même chose. Un bloc peut être clair, bien écrit, injectable — et pourtant **nul en personnalisation réelle**. C'est exactement ce que tu dois détecter et rejeter.

---

## Ce que tu évalues

À partir de :
- le **socle de ton existant**
- les **marqueurs stables structurés** issus de l'agent d'extraction
- le **guide extrait**
- le **bloc final candidat**

Tu évalues si le bloc final encode réellement la texture du langage observé — pas seulement une impression globale de proximité ou d'oralité.

Tu ne réécris pas le bloc. Si la validation est approuvée, tu le recopies tel quel dans le champ prévu.

---

## Règle critique anti-lissage

Tu sanctionnes fortement tout bloc qui remplace des marqueurs concrets observés par des formulations génériques du type : "ton conversationnel", "proximité naturelle", "style spontané", "reste direct", "reste humain".

Un bloc n'est pas fidèle s'il décrit une **impression globale** sans encoder des **gestes de formulation observables**.

Tu refuses tout bloc qui lisse une oralité relâchée, une structure souple, une reformulation par rebond, une relance courte ou un flou calibré — si ces traits apparaissent dans le signal extrait.

Tu privilégies les verbes d'action concrets : ouvrir, rebondir, reprendre, couper, cadrer, relancer, poser, raccourcir, ponctuer, reformuler.

---

## Checks obligatoires avant décision

Avant de scorer et de décider, tu vérifies explicitement ces 5 points :

1. Le bloc encode-t-il des gestes de formulation concrets plutôt que des impressions générales ?
2. Contient-il au moins 3 consignes distinctives peu applicables à un utilisateur lambda ?
3. Conserve-t-il les marqueurs observés de texture de langage (oralité, structure souple, rebond, rythme…) quand ils existent dans le signal ?
4. Évite-t-il de lisser le style en "conversationnel" générique ?
5. Reste-t-il purement focalisé sur la forme, sans toucher au fond métier ?

---

## Critères de scoring (0 à 10)

- fidelite_signal : le bloc encode-t-il les marqueurs observés en gestes précis, pas en qualificatifs abstraits ?
- anti_lissage : le bloc conserve-t-il la rugosité exploitable du style observé sans la transformer ?
- non_genericite : le bloc contient-il au moins 3 consignes non applicables à un utilisateur lambda ?
- securite_semantique : le bloc ne modifie-t-il pas le fond métier, n'imite-t-il pas les fautes, ne surjoue-t-il pas ?
- injectabilite : le bloc est-il directement injectable, sans titre, sans puce, sans markdown, dans la bonne plage de mots ?
- respect_socle : le bloc reste-t-il compatible avec le socle si le signal est faible ou partiel ? (poids réduit ; le danger principal n'est pas de trahir le socle, c'est d'y retourner au lieu d'extraire la personne)

Le score_global est une moyenne pondérée : fidelite_signal 25 %, anti_lissage 25 %, non_genericite 20 %, securite_semantique 15 %, injectabilite 10 %, respect_socle 5 %. Calculé sur 10, arrondi à une décimale. Renvoie ce score dans checks.fidelite_signal en tant que fidélité au signal (les autres critères notés séparément dans checks).

---

## Seuil d'approbation

Le statut est "approve" uniquement si toutes ces conditions sont réunies :
- score global ≥ 8.7
- fidélité au signal ≥ 8.5
- anti-lissage ≥ 8.5
- non-généricité ≥ 8.5
- aucun blocking issue

Dans tous les autres cas : statut "retry".

---

## Règle dure sur les consignes distinctives

Si moins de 3 consignes distinctives sont détectées : status = "retry", sans exception, et ajoute obligatoirement "moins de 3 consignes distinctives" dans blocking_issues.

Définition stricte d'une consigne distinctive : elle ne compte que si elle décrit un geste de formulation concret, spécifique au signal observé, et peu applicable à un utilisateur lambda. Les formulations suivantes ne comptent jamais comme consignes distinctives : "reste naturel", "sois spontané", "reste humain", "garde un ton direct", "sois chaleureux", "reste accessible", et toute formulation générique du même type.

---

## Règle stricte sur approved_final_block

La règle est binaire, aucune exception.
- Si decision = "approve" : approved_final_block doit être une copie strictement identique du bloc candidat reçu. Aucun mot, aucune ponctuation, aucun espace significatif ne doit être modifié.
- Si decision = "retry" : approved_final_block doit être exactement "". Tu ne proposes aucune variante partielle.

Tu n'as jamais le droit d'améliorer, nettoyer, condenser ou reformuler le bloc candidat. Ton rôle est uniquement de valider ou refuser. Toute modification du texte candidat est une erreur.
Ne compte que les consignes explicitement présentes dans le bloc candidat. N'infère jamais une consigne absente.

---

## Blocking issues typés

Si tu détectes un défaut bloquant, nomme-le précisément parmi ces catégories :
- "bloc trop descriptif et pas assez procédural"
- "présence de qualificatifs abstraits non traduits en gestes"
- "moins de 3 consignes distinctives"
- "lissage d'une oralité souple en ton conversationnel standard"
- "bloc applicable à un utilisateur lambda"
- "surpondération du socle par rapport au signal extrait"
- "modification du fond métier ou de la logique argumentative"
- "imitation de fautes, tics bruts ou familiarité artificielle"
- "surinterprétation de traits peu observés"

---

## Règles complémentaires

- Tu ne réanalyses pas l'utilisateur.
- Tu ne débats pas les observations du premier agent.
- Tu ne produis pas de réécriture partielle pour "aider".
- Tu ne valides pas un bloc propre si ses consignes sont génériques.
- Si le signal extrait était faible et que le bloc reste proche du socle : acceptable, mais notable.

Réponds uniquement avec l'objet JSON demandé, rien d'autre.`

async function callOpenAIStructured<T>(
  system: string,
  input: string,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<{ data: T; usage: { input_tokens?: number; output_tokens?: number } }> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: system,
      input,
      text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
    }),
  })
  const payload = await res.json()
  if (!res.ok) throw new Error(`openai_error:${JSON.stringify(payload).slice(0, 300)}`)
  const textOut = payload.output?.[0]?.content?.[0]?.text
  const data = (typeof textOut === 'string' ? JSON.parse(textOut) : textOut) as T
  return { data, usage: payload.usage ?? {} }
}

function buildGuideInput(answers: Record<string, string>, questions: { key: string; question: string }[]) {
  const sections = questions
    .map(({ key, question }, i) => `## Q${i + 1}\nQuestion : "${question}"\nRéponse : ${answers[key].trim()}`)
    .join('\n\n')
  return `# Socle de ton existant\n${DEFAULT_TONE}\n\n# Réponses utilisateur à analyser\n\n${sections}\n\n# Consigne d'analyse\nAnalyse uniquement la texture de formulation.\nCherche des marqueurs stables de voix.\nIgnore les fautes, les maladresses rédactionnelles et le contenu métier.\nPriorise les régularités transversales observées sur l'ensemble des réponses plutôt que les observations propres à chaque cas.\nDistingue :\n- les marqueurs injectables de formulation,\n- les éléments contextuels non injectables,\n- ce qui doit rester hérité du ton par défaut.\nSi certaines réponses sont trop courtes, vides ou peu exploitables, baisse ton niveau de confiance.\nN'utilise le ton par défaut comme base principale que si le signal utilisateur est insuffisant.`
}

function buildCreationInput(
  guide: GuideOutput,
  previousFeedback: string,
  previousBlockingIssues: string,
  previousCandidate: string,
) {
  const s = guide.niveau_de_signal
  const d = guide.differences_vs_socle
  return `Voici l'analyse de style à transformer en bloc injectable pour un agent.

Ne garde que les éléments injectables.
Supprime tout ce qui relève du fond commercial ou de la stratégie métier.
Le bloc final doit seulement changer la manière de formuler les réponses, sans changer leur sens.

---

NIVEAU DE SIGNAL :
- intensité : ${s.intensite}
- cohérence : ${s.coherence}
- matière exploitable : ${s.matiere_exploitable}

DIFFÉRENCES VS SOCLE :
- à conserver : ${d.a_conserver}
- à atténuer : ${d.a_attenuer}
- à renforcer : ${d.a_renforcer}
- à ajouter : ${d.a_ajouter}
- à éviter : ${d.a_eviter}

GUIDE EXTRAIT :
${guide.guide_final_ultra_compact}

SOCLE EXISTANT :
${DEFAULT_TONE}

FEEDBACK DE VALIDATION PRÉCÉDENT :
${previousFeedback || 'Aucun'}

POINTS BLOQUANTS PRÉCÉDENTS :
${previousBlockingIssues || 'Aucun'}

BLOC CANDIDAT PRÉCÉDENT :
${previousCandidate || 'Aucun'}

---

Consigne supplémentaire :
Si un feedback précédent est fourni, corrige précisément ces points sans réélargir le texte ni réinventer un nouveau ton.

Transforme cela en un bloc final unique, court, précis et directement injectable dans le prompt d'un agent.`
}

function buildValidationInput(iteration: number, guide: GuideOutput, candidate: string, previousFeedback: string) {
  const s = guide.niveau_de_signal
  const d = guide.differences_vs_socle
  return `ITÉRATION :
${iteration}

SOCLE EXISTANT :
${DEFAULT_TONE}

NIVEAU DE SIGNAL :
- intensité : ${s.intensite}
- cohérence : ${s.coherence}
- matière exploitable : ${s.matiere_exploitable}

DIFFÉRENCES VS SOCLE :
- à conserver : ${d.a_conserver}
- à atténuer : ${d.a_attenuer}
- à renforcer : ${d.a_renforcer}
- à ajouter : ${d.a_ajouter}
- à éviter : ${d.a_eviter}

GUIDE EXTRAIT HORS BOUCLE :
${guide.guide_final_ultra_compact}

BLOC FINAL CANDIDAT :
${candidate}

FEEDBACK PRÉCÉDENT :
${previousFeedback || 'Aucun'}

Consigne :
Évalue si le bloc final candidat est suffisamment fidèle, spécifique, non générique, compatible avec le socle, non caricatural, et directement injectable.`
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
    .select('id, user_id, custom_tone_questions')
    .eq('id', assistantId)
    .maybeSingle()
  if (!assistant || assistant.user_id !== user.id) return json(req, { error: 'not_found' }, 404)

  const { data: profile } = await admin.from('profiles').select('plan_override').eq('user_id', user.id).maybeSingle()
  const resolved = await resolveApiKey(user.id, profile?.plan_override ?? null)
  if (!resolved) return json(req, { error: 'no_api_key' }, 409)
  if (!OPENAI_API_KEY) return json(req, { error: 'openai_key_missing' }, 409)

  // Plafonnée à 6 côté serveur même si l'interface l'empêche déjà, pour borner
  // le coût et la taille du prompt d'extraction.
  const customQuestions = (
    Array.isArray(assistant.custom_tone_questions) ? assistant.custom_tone_questions : []
  ).slice(0, 6) as { id: string; question: string }[]
  const allQuestions: { key: string; question: string }[] = [
    ...Object.entries(QUESTIONS).map(([key, question]) => ({ key, question })),
    ...customQuestions.map((q) => ({ key: q.id, question: q.question })),
  ]

  const incomplete = allQuestions
    .filter((q) => (answers[q.key] ?? '').trim().length < MIN_ANSWER_LENGTH)
    .map((q) => q.key)
  if (incomplete.length > 0) {
    return json(req, { error: 'invalid_answers', incomplete }, 400)
  }

  try {
    const guideRes = await callOpenAIStructured<GuideOutput>(
      CREATE_GUIDE_SYSTEM,
      buildGuideInput(answers, allQuestions),
      'my_guide_schema',
      GUIDE_SCHEMA,
    )
    await recordUsage({ userId: user.id, conversationId: null, model: OPENAI_MODEL, usage: guideRes.usage, source: 'platform' })
    const guide = guideRes.data

    let previousFeedback = ''
    let previousBlockingIssues = ''
    let previousCandidate = ''
    let bestScore = 0
    let bestBlock = ''
    let approvedBlock = ''
    let approved = false

    for (let iteration = 0; iteration < MAX_ATTEMPTS; iteration++) {
      const creationRes = await generateText({
        apiKey: resolved.key,
        model: CREATION_MODEL,
        system: CREATION_SYSTEM,
        prompt: buildCreationInput(guide, previousFeedback, previousBlockingIssues, previousCandidate),
        maxTokens: 400,
      })
      await recordUsage({ userId: user.id, conversationId: null, model: CREATION_MODEL, usage: creationRes.usage, source: resolved.source })
      const candidate = creationRes.text.trim()

      const validationRes = await callOpenAIStructured<ValidationOutput>(
        VALIDATION_SYSTEM,
        buildValidationInput(iteration, guide, candidate, previousFeedback),
        'my_validation_schema',
        VALIDATION_SCHEMA,
      )
      await recordUsage({ userId: user.id, conversationId: null, model: OPENAI_MODEL, usage: validationRes.usage, source: 'platform' })
      const verdict = validationRes.data

      // Le candidat (pas seulement le bloc approuvé, vide sur un retry) sert de
      // secours si aucune tentative n'est jamais approuvée après 3 essais.
      if (verdict.score_global > bestScore) {
        bestScore = verdict.score_global
        bestBlock = candidate
      }

      if (verdict.decision === 'approve') {
        approvedBlock = verdict.approved_final_block || candidate
        approved = true
        break
      }
      previousFeedback = verdict.revision_instructions.join('\n- ')
      previousBlockingIssues = verdict.blocking_issues.join('\n- ')
      previousCandidate = verdict.approved_final_block || ''
    }

    const block = approved ? approvedBlock : bestBlock || DEFAULT_TONE
    const generatedAt = new Date().toISOString()
    await admin
      .from('assistants')
      .update({ custom_tone: block, custom_tone_generated_at: generatedAt, updated_at: generatedAt })
      .eq('id', assistantId)
    return json(req, { ok: true, tone: block })
  } catch (e) {
    await logEvent('error', 'generate-custom-tone', `génération échouée: ${String(e).slice(0, 300)}`, { user_id: user.id })
    return json(req, { error: 'generation_failed', message: String(e).slice(0, 200) }, 500)
  }
})
