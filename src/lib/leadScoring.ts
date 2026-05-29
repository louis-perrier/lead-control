import type { ProspectConversation } from "./prospects";

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

export type ScoreBreakdown = {
  buyIntent: number;
  qualification: number;
  engagement: number;
  reactivity: number;
  pipeline: number;
  trumpBonus: number;
  negativePenalty: number;
};

export type LeadScore = {
  total: number;
  rawTotal: number;
  level: "hot" | "warm" | "cold";
  breakdown: ScoreBreakdown;
  signals: {
    buyKeywords: string[];
    qualificationSignals: string[];
    trumpSignals: string[];
    hardNegative: string[];
    softNegative: string[];
    freeSeeker: string[];
    nonDecisionMaker: string[];
    wrongTarget: string[];
    supporter: string[];
    isTireKicker: boolean;
    isSupporterMode: boolean;
    isStopped: boolean;
  };
  capReason: string | null;
  trumpReason: string | null;
};

export type PipelineStage =
  | "nouveau"
  | "engage"
  | "qualifie"
  | "rdv_pris"
  | "deal_ferme";

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "nouveau",
  "engage",
  "qualifie",
  "rdv_pris",
  "deal_ferme",
];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  nouveau: "Nouveau",
  engage: "Engagé",
  qualifie: "Qualifié",
  rdv_pris: "RDV pris",
  deal_ferme: "Deal fermé",
};

/* ────────────────────────────────────────────────────────────────────────────
 * Text normalization
 * ──────────────────────────────────────────────────────────────────────────── */

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Normalize for keyword matching: lowercase, strip diacritics, replace
// apostrophes with spaces so "j'achète" matches "j achete".
const normalizeText = (value: string): string =>
  stripDiacritics(value.toLowerCase())
    .replace(/['’`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const findKeywordsHit = (text: string, keywords: string[]): string[] => {
  if (!text) return [];
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const kw of keywords) {
    const needle = normalizeText(kw);
    if (!needle || seen.has(needle)) continue;
    if (text.includes(needle)) {
      hits.push(kw);
      seen.add(needle);
    }
  }
  return hits;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Keyword dictionaries (use spaces in place of apostrophes for consistency)
 * ──────────────────────────────────────────────────────────────────────────── */

type KeywordCategory = {
  name: string;
  points: number;
  keywords: string[];
};

// ── BUY INTENT (max 35) ────────────────────────────────────────────────────
const BUY_INTENT_CATEGORIES: KeywordCategory[] = [
  {
    name: "Engagement d achat",
    points: 12,
    keywords: [
      "je veux acheter",
      "je suis preneur",
      "je suis preneuse",
      "je le prends",
      "je la prends",
      "je le veux",
      "ok je le fais",
      "ok je le prends",
      "partant",
      "partante",
      "go",
      "c est parti",
      "let s go",
      "ok pour moi",
      "ca me va",
      "je suis pret",
      "je suis prete",
      "ok je signe",
      "je signe",
      "je m engage",
      "je veux investir",
      "je veux changer",
      "j en ai marre",
      "il est temps",
      "j en peux plus",
    ],
  },
  {
    name: "Question de paiement",
    points: 10,
    keywords: [
      "comment je paye",
      "comment je paie",
      "ou je paye",
      "ou je paie",
      "stripe",
      "virement",
      "carte bancaire",
      "ma cb",
      "paypal",
      "facilites de paiement",
      "paiement en plusieurs fois",
      "paiement 3x",
      "paiement 4x",
      "echelonner",
      "echelonnement",
      "mensualites",
    ],
  },
  {
    name: "Question de prix",
    points: 8,
    keywords: [
      "combien",
      "prix",
      "tarif",
      "ca coute",
      "ca vaut",
      "cout",
      "le cout",
      "budget pour",
      "combien ca",
    ],
  },
  {
    name: "Démarrage / RDV",
    points: 9,
    keywords: [
      "quand on commence",
      "on commence quand",
      "ca commence quand",
      "ca demarre quand",
      "j ai acces quand",
      "des que possible",
      "le plus rapidement",
      "un creneau pour",
      "un creneau de",
      "prendre un rdv",
      "prendre rdv",
      "fixer un rdv",
      "fixer un appel",
      "fixer un call",
      "reserver un appel",
      "reserver une seance",
      "reserver un creneau",
      "reserver une place",
      "passer un appel",
      "passer un call",
      "appel de decouverte",
      "call de decouverte",
      "rendez vous ensemble",
      "rendez vous avec toi",
      "un rdv ensemble",
      "un appel ensemble",
      "premiere etape",
      "passer a l action",
      "on en parle de vive voix",
      "en visio",
    ],
  },
  {
    name: "Garantie / sécurité",
    points: 4,
    keywords: [
      "garantie",
      "remboursement",
      "satisfait ou rembourse",
      "satisfait",
      "securise",
      "rembourse",
      "argent perdu",
      "sans risque",
    ],
  },
];

// ── QUALIFICATION & SÉRIEUX (max 30) ───────────────────────────────────────
const QUALIFICATION_CATEGORIES: KeywordCategory[] = [
  {
    name: "Douleur partagée",
    points: 10,
    keywords: [
      "je galere",
      "je galère",
      "j arrive pas",
      "j arrive plus",
      "je n arrive pas",
      "je n arrive plus",
      "je perds du temps",
      "j ai du mal",
      "je bloque",
      "je suis bloque",
      "je suis bloquee",
      "je rame",
      "je peine",
      "ca stagne",
      "je stagne",
      "je plafonne",
      "je seche",
      "je ne sais pas comment",
      "j en peux plus de",
      "marre de",
    ],
  },
  {
    name: "Recherche de résultats",
    points: 9,
    keywords: [
      "quels resultats",
      "quel resultat",
      "combien tes clients",
      "combien font tes",
      "tes clients gagnent",
      "tes clients font",
      "roi",
      "rentabilite",
      "ca donne quoi",
      "ca donne combien",
      "resultats moyens",
      "taux de reussite",
      "taux de conversion",
      "rendement",
      "retour sur investissement",
    ],
  },
  {
    name: "Demande de preuves",
    points: 6,
    keywords: [
      "temoignages",
      "des avis",
      "des preuves",
      "preuves concretes",
      "exemples concrets",
      "cas client",
      "cas clients",
      "case study",
      "anciens clients",
      "ancien client",
      "avant apres",
      "etude de cas",
      "etudes de cas",
    ],
  },
  {
    name: "Profondeur méthode",
    points: 6,
    keywords: [
      "comment ca marche concretement",
      "comment ca se passe",
      "deroulement",
      "deroule",
      "structure",
      "modules",
      "etapes",
      "methodologie",
      "process",
      "ton process",
      "format",
      "frequence",
      "duree",
      "combien de seances",
      "combien d heures",
      "rythme",
      "ca inclut",
      "qu est ce qui est inclus",
    ],
  },
  {
    name: "Deadline / urgence",
    points: 6,
    keywords: [
      "avant fin",
      "fin du mois",
      "avant juin",
      "avant juillet",
      "avant aout",
      "avant septembre",
      "avant octobre",
      "avant novembre",
      "avant decembre",
      "pour la rentree",
      "pour noel",
      "d ici",
      "rapidement",
      "urgent",
      "vite",
      "il me faut avant",
      "ce mois ci",
      "cette semaine",
      "j ai besoin avant",
    ],
  },
  {
    name: "Contexte personnel partagé",
    points: 5,
    keywords: [
      "j ai un",
      "j ai une",
      "ma boite",
      "mon entreprise",
      "mon business",
      "mon projet",
      "mon agence",
      "mon coaching",
      "depuis",
      "je suis coach",
      "je suis freelance",
      "je suis entrepreneur",
      "je suis e commercant",
      "je vends",
      "j ai lance",
      "j ai cree",
      "mon chiffre d affaire",
      "mon ca",
      "mes clients",
    ],
  },
];

// ── TRUMP SIGNALS (guarantee a minimum score) ─────────────────────────────
const TRUMP_PAYMENT_LINK_KEYWORDS = [
  "envoie le lien",
  "envoie moi le lien",
  "envoyez moi le lien",
  "envoyer le lien",
  "passez moi le lien",
  "lien de paiement",
  "le lien stp",
  "garde moi une place",
  "garde moi un creneau",
  "bloque moi un creneau",
  "reserve moi",
  "tu me reserves",
];

const TRUMP_COMMIT_KEYWORDS = [
  "je suis preneur",
  "je suis preneuse",
  "je le prends",
  "je la prends",
  "c est bon je signe",
  "ok je signe",
  "ok pour moi je suis pret",
  "ok pour moi je suis prete",
  "ok je m engage",
  "je m engage",
];

// ── HARD KILL (cap = 15) ───────────────────────────────────────────────────
const HARD_KILL_KEYWORDS = [
  "pas interesse",
  "pas interessee",
  "non merci",
  "merci mais non",
  "non c est non",
  "j ai deja achete",
  "j ai deja un coaching",
  "j ai deja un coach",
  "j ai deja un programme",
  "je travaille deja avec",
  "je suis deja avec",
  "j ai trouve ailleurs",
  "j ai pris avec",
  "j ai pris quelqu un d autre",
  "trop cher",
  "vraiment trop cher",
  "c est trop cher pour moi",
  "j ai pas les moyens",
  "je n ai pas les moyens",
  "hors budget",
  "stop",
  "ne plus me contacter",
  "ne me contactez plus",
  "ne m envoyez plus",
  "desabonn",
  "laissez moi tranquille",
  "arretez de",
  "stop spam",
  "spam",
  "supprime moi",
  "supprimez moi",
];

// ── FREE SEEKER (cap = 30) ─────────────────────────────────────────────────
const FREE_SEEKER_KEYWORDS = [
  "tu peux pas me filer",
  "tu peux me filer gratuit",
  "j ai pas de budget",
  "je suis fauche",
  "je suis fauchee",
  "j ai pas un sou",
  "j ai pas d argent",
  "je n ai pas d argent",
  "des conseils gratuits",
  "conseil gratuit",
  "comment faire seul",
  "comment faire moi meme",
  "comment je peux faire seul",
  "tutoriel gratuit",
  "tuto gratuit",
  "tu peux m expliquer gratuitement",
  "explique moi gratuitement",
  "version gratuite",
];

// ── SOFT KILL (cap = 45) ───────────────────────────────────────────────────
const SOFT_KILL_KEYWORDS = [
  "plus tard",
  "pas maintenant",
  "pas le moment",
  "pas le bon moment",
  "je verrai plus tard",
  "je reflechis",
  "j y reflechis",
  "je vais reflechir",
  "je vais y reflechir",
  "je te recontacte",
  "je te recontacterai",
  "je reviens vers toi",
  "je reviendrai",
  "quand ca m interessera",
  "quand j aurai",
  "trop occupe",
  "trop occupee",
  "pas le temps",
  "manque de temps",
  "peut etre plus tard",
  "on verra plus tard",
  "on verra",
];

// ── NON DECISION MAKER (cap = 50) ──────────────────────────────────────────
const NON_DECISION_MAKER_KEYWORDS = [
  "je dois en parler a",
  "j en parle a",
  "ma femme",
  "mon mari",
  "mon copain",
  "ma copine",
  "mon associe",
  "mes associes",
  "mon mentor",
  "ma famille",
  "mes parents",
  "je dois voir avec",
  "il faut que j en parle",
  "il faut que je voie avec",
  "je vais lui demander",
];

// ── SUPPORTER / FRIEND (cap = 40 when isolated) ────────────────────────────
// Conversation amicale : encouragements, admiration, fan-mode, sans aucune
// intention commerciale réelle. Le cap ne s'applique que si AUCUN signal
// commercial concret n'accompagne le soutien.
const SUPPORTER_KEYWORDS = [
  "trop bien",
  "trop cool",
  "genial",
  "geniale",
  "j adore",
  "j adore ton",
  "j adore ce que tu fais",
  "ce que tu fais est",
  "tu dechires",
  "tu vas tout casser",
  "tu vas reussir",
  "bravo",
  "felicitations",
  "felicitation",
  "continue comme ca",
  "lache rien",
  "lache pas",
  "force a toi",
  "grosse force",
  "courage",
  "respect",
  "chapeau",
  "trop fort",
  "tu es fort",
  "tu inspires",
  "tu m inspires",
  "fan de toi",
  "fan de ton",
  "ton contenu est",
  "ton podcast",
  "j ai vu ton podcast",
  "je te suis depuis",
  "ca fait longtemps que je te suis",
  "depuis tes debuts",
  "bonne continuation",
  "je crois en toi",
  "you got this",
  "tu gere",
  "tu geres",
  "le boss",
  "le meilleur",
  "la meilleure",
  "incroyable ce que",
  "ouf ce que tu fais",
];

// ── WRONG TARGET (cap = 10) ────────────────────────────────────────────────
// Someone trying to SELL to us (B2B prospecting, agencies pitching, etc.)
const WRONG_TARGET_KEYWORDS = [
  "je peux t aider a vendre",
  "je peux vous aider a vendre",
  "je peux t aider a monter",
  "nous pouvons vous aider",
  "notre agence",
  "mon offre est",
  "mon service est",
  "je propose mes services",
  "je propose mon",
  "voulez vous mes services",
  "tu veux acheter",
  "vous voulez acheter",
  "j ai une offre pour vous",
  "j ai une offre pour toi",
  "es tu interesse par mes",
  "etes vous interesse par mes",
  "voici mon portfolio",
];

/* ────────────────────────────────────────────────────────────────────────────
 * Per-factor computations
 * ──────────────────────────────────────────────────────────────────────────── */

const BUY_INTENT_MAX = 35;
const QUALIFICATION_MAX = 30;
const ENGAGEMENT_MAX = 15;
const REACTIVITY_MAX = 10;
const PIPELINE_MAX = 10;

const computeFromCategories = (
  text: string,
  categories: KeywordCategory[],
  cap: number,
  comboBonusFor3Plus = 0,
): { points: number; hits: string[] } => {
  let points = 0;
  const hits: string[] = [];
  for (const cat of categories) {
    const hit = findKeywordsHit(text, cat.keywords);
    if (hit.length > 0) {
      points += cat.points;
      hits.push(cat.name);
    }
  }
  if (hits.length >= 3 && comboBonusFor3Plus > 0) {
    points += comboBonusFor3Plus;
  }
  return { points: Math.min(cap, points), hits };
};

const computeEngagement = (conversation: ProspectConversation): number => {
  const customerMessages = conversation.messages.filter(
    (m) => m.direction === "inbound" && m.authorType === "customer",
  );
  const count = customerMessages.length;
  if (count === 0) return 0;

  // Volume (0-6)
  let volumeScore = 0;
  if (count >= 8) volumeScore = 6;
  else if (count >= 4) volumeScore = 4;
  else if (count >= 2) volumeScore = 2;

  // Average length (0-5)
  const totalChars = customerMessages.reduce((acc, m) => acc + (m.text?.length ?? 0), 0);
  const avgLen = totalChars / count;
  let lenScore = 0;
  if (avgLen >= 140) lenScore = 5;
  else if (avgLen >= 70) lenScore = 4;
  else if (avgLen >= 35) lenScore = 2;
  else if (avgLen >= 15) lenScore = 1;

  // Reopen-after-silence bonus (0-4)
  let reopenScore = 0;
  const sortedMessages = [...conversation.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  for (let i = 1; i < sortedMessages.length; i++) {
    const prev = sortedMessages[i - 1];
    const curr = sortedMessages[i];
    if (
      curr.direction === "inbound" &&
      curr.authorType === "customer" &&
      prev.direction !== "inbound"
    ) {
      const delta = new Date(curr.sentAt).getTime() - new Date(prev.sentAt).getTime();
      if (delta > 24 * 60 * 60 * 1000) {
        reopenScore = 4;
        break;
      }
    }
  }

  return Math.min(ENGAGEMENT_MAX, volumeScore + lenScore + reopenScore);
};

const computeReactivity = (conversation: ProspectConversation): number => {
  const sortedMessages = [...conversation.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );

  const deltas: number[] = [];
  for (let i = 1; i < sortedMessages.length; i++) {
    const prev = sortedMessages[i - 1];
    const curr = sortedMessages[i];
    if (
      prev.direction === "outbound" &&
      curr.direction === "inbound" &&
      curr.authorType === "customer"
    ) {
      const delta = new Date(curr.sentAt).getTime() - new Date(prev.sentAt).getTime();
      if (delta > 0) deltas.push(delta);
    }
  }

  if (deltas.length === 0) return 0;

  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  const medianMin = median / 60000;

  if (medianMin < 15) return 10;
  if (medianMin < 60) return 8;
  if (medianMin < 240) return 5;
  if (medianMin < 1440) return 2;
  return 0;
};

const computePipeline = (params: {
  hasBooking: boolean;
  hasClosedDeal: boolean;
}): number => {
  if (params.hasClosedDeal) return PIPELINE_MAX;
  if (params.hasBooking) return 7;
  return 0;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Main scoring entrypoint
 * ──────────────────────────────────────────────────────────────────────────── */

const emptyScore = (): LeadScore => ({
  total: 0,
  rawTotal: 0,
  level: "cold",
  breakdown: {
    buyIntent: 0,
    qualification: 0,
    engagement: 0,
    reactivity: 0,
    pipeline: 0,
    trumpBonus: 0,
    negativePenalty: 0,
  },
  signals: {
    buyKeywords: [],
    qualificationSignals: [],
    trumpSignals: [],
    hardNegative: [],
    softNegative: [],
    freeSeeker: [],
    nonDecisionMaker: [],
    wrongTarget: [],
    supporter: [],
    isTireKicker: false,
    isSupporterMode: false,
    isStopped: false,
  },
  capReason: null,
  trumpReason: null,
});

export const computeLeadScore = (
  conversation: ProspectConversation | null,
  context: { hasBooking: boolean; hasClosedDeal: boolean },
): LeadScore => {
  if (!conversation) return emptyScore();

  const customerMessages = conversation.messages.filter(
    (m) => m.direction === "inbound" && m.authorType === "customer",
  );
  const customerText = normalizeText(customerMessages.map((m) => m.text ?? "").join(" "));

  // ── Base factors ────────────────────────────────────────────────────────
  const buyResult = computeFromCategories(customerText, BUY_INTENT_CATEGORIES, BUY_INTENT_MAX);
  const qualifResult = computeFromCategories(
    customerText,
    QUALIFICATION_CATEGORIES,
    QUALIFICATION_MAX,
    5, // combo bonus when 3+ qualification signals are present
  );
  const engagement = computeEngagement(conversation);
  const reactivity = computeReactivity(conversation);
  const pipeline = computePipeline(context);

  const baseSum =
    buyResult.points + qualifResult.points + engagement + reactivity + pipeline;
  const baseScore = Math.max(0, Math.min(100, baseSum));

  // ── Trump signals (guarantee a minimum score) ───────────────────────────
  const paymentLinkHits = findKeywordsHit(customerText, TRUMP_PAYMENT_LINK_KEYWORDS);
  const commitHits = findKeywordsHit(customerText, TRUMP_COMMIT_KEYWORDS);
  const supporterHits = findKeywordsHit(customerText, SUPPORTER_KEYWORDS);

  // STRONG commercial signal — unambiguous purchase intent:
  // payment question, payment link request, or actual Calendly booking.
  // These are very hard to fake or trigger in casual/friendly chat.
  const hasStrongCommercialSignal =
    buyResult.hits.includes("Question de paiement") ||
    paymentLinkHits.length > 0 ||
    context.hasBooking;

  // WEAK commercial signal — easier to trigger casually (a generic "combien"
  // about something else, "on s'appelle" in a friend context, etc.).
  const hasWeakCommercialSignal =
    buyResult.hits.includes("Question de prix") ||
    buyResult.hits.includes("Démarrage / RDV");

  const hasSupporterPraise = supporterHits.length >= 1;

  // Commit trump fires only when commitment is corroborated by a STRONG
  // commercial signal — OR a weak signal IF no supporter praise dilutes it.
  // This protects against the "araboux_enzo case" : "trop bien je suis preneur"
  // is no longer auto-promoted to 70 just because "combien" or "appel" appears.
  const commitTrumpAllowed =
    hasStrongCommercialSignal ||
    (hasWeakCommercialSignal && !hasSupporterPraise);

  let trumpFloor = 0;
  let trumpReason: string | null = null;
  const trumpSignals: string[] = [];

  if (paymentLinkHits.length > 0) {
    trumpFloor = Math.max(trumpFloor, 75);
    trumpReason = `Lien de paiement demandé : « ${paymentLinkHits[0]} »`;
    trumpSignals.push(...paymentLinkHits);
  }
  if (commitHits.length > 0 && commitTrumpAllowed) {
    trumpFloor = Math.max(trumpFloor, 70);
    if (!trumpReason)
      trumpReason = `Engagement explicite + signal commercial : « ${commitHits[0]} »`;
    trumpSignals.push(...commitHits);
  }
  if (context.hasBooking && !context.hasClosedDeal) {
    trumpFloor = Math.max(trumpFloor, 70);
    if (!trumpReason) trumpReason = "Rendez-vous pris (Calendly)";
  }

  // ── Negative signal detection ───────────────────────────────────────────
  const hardHits = findKeywordsHit(customerText, HARD_KILL_KEYWORDS);
  const softHits = findKeywordsHit(customerText, SOFT_KILL_KEYWORDS);
  const freeSeekerHits = findKeywordsHit(customerText, FREE_SEEKER_KEYWORDS);
  const ndmHits = findKeywordsHit(customerText, NON_DECISION_MAKER_KEYWORDS);
  const wrongTargetHits = findKeywordsHit(customerText, WRONG_TARGET_KEYWORDS);

  // Tire-kicker pattern: many customer messages but buy intent stays low
  const isTireKicker =
    customerMessages.length >= 10 && buyResult.points <= 8 && !context.hasBooking;

  // Supporter / friend pattern: praise/encouragement is present but NO STRONG
  // commercial signal exists (no payment question, no link, no booking).
  // Weak commercial signals (price, démarrage) don't disqualify the supporter
  // cap because they're easy to trigger by accident in casual chat.
  const isSupporterMode =
    hasSupporterPraise &&
    !hasStrongCommercialSignal &&
    qualifResult.points <= 8 &&
    !context.hasClosedDeal;

  // ── Caps (most restrictive wins; deal closed overrides everything) ──────
  let cap = 100;
  let capReason: string | null = null;
  const setCap = (value: number, reason: string) => {
    if (value < cap) {
      cap = value;
      capReason = reason;
    }
  };

  if (wrongTargetHits.length > 0)
    setCap(10, `Cible inversée (le contact vend) : « ${wrongTargetHits[0]} »`);
  if (hardHits.length > 0)
    setCap(15, `Signal négatif fort : « ${hardHits[0]} »`);
  if (freeSeekerHits.length > 0)
    setCap(30, `Demande de gratuité : « ${freeSeekerHits[0]} »`);
  if (isSupporterMode)
    setCap(40, `Conversation amicale / sympathisant : « ${supporterHits[0]} »`);
  if (softHits.length > 0)
    setCap(45, `Signal de procrastination : « ${softHits[0]} »`);
  if (ndmHits.length > 0)
    setCap(50, `Pas le décisionnaire : « ${ndmHits[0]} »`);
  if (isTireKicker)
    setCap(55, "Beaucoup de questions, aucun signal d'achat (tire-kicker)");

  // Deal closed overrides everything
  if (context.hasClosedDeal) {
    cap = 100;
    capReason = null;
  }

  // ── Final score: max(base, trumpFloor) then capped ──────────────────────
  const preCap = Math.max(baseScore, trumpFloor);
  const totalUncapped = Math.min(100, preCap);
  const total = context.hasClosedDeal
    ? 100
    : Math.max(0, Math.min(cap, totalUncapped));

  const trumpBonus = Math.max(0, Math.min(100, trumpFloor) - baseScore);
  const negativePenalty = Math.max(0, totalUncapped - total);

  let level: LeadScore["level"];
  if (total >= 70) level = "hot";
  else if (total >= 40) level = "warm";
  else level = "cold";

  return {
    total: Math.round(total),
    rawTotal: Math.round(totalUncapped),
    level,
    breakdown: {
      buyIntent: buyResult.points,
      qualification: qualifResult.points,
      engagement,
      reactivity,
      pipeline,
      trumpBonus: Math.round(trumpBonus),
      negativePenalty: Math.round(negativePenalty),
    },
    signals: {
      buyKeywords: buyResult.hits,
      qualificationSignals: qualifResult.hits,
      trumpSignals,
      hardNegative: hardHits,
      softNegative: softHits,
      freeSeeker: freeSeekerHits,
      nonDecisionMaker: ndmHits,
      wrongTarget: wrongTargetHits,
      supporter: supporterHits,
      isTireKicker,
      isSupporterMode,
      isStopped: conversation.automationState === "stopped",
    },
    capReason,
    trumpReason,
  };
};

/* ────────────────────────────────────────────────────────────────────────────
 * Pipeline stage derivation
 * ──────────────────────────────────────────────────────────────────────────── */

export const getPipelineStage = (params: {
  conversation: ProspectConversation | null;
  hasBooking: boolean;
  hasClosedDeal: boolean;
  score: number;
}): PipelineStage => {
  if (params.hasClosedDeal) return "deal_ferme";
  if (params.hasBooking) return "rdv_pris";

  const customerMessageCount = params.conversation
    ? params.conversation.messages.filter(
        (m) => m.direction === "inbound" && m.authorType === "customer",
      ).length
    : 0;

  if (params.score >= 50) return "qualifie";
  if (customerMessageCount >= 2) return "engage";
  return "nouveau";
};

export const getScoreLevelLabel = (level: LeadScore["level"]): string => {
  if (level === "hot") return "Chaud";
  if (level === "warm") return "Tiède";
  return "Froid";
};
