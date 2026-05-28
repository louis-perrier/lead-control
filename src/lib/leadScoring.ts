import type { ProspectConversation } from "./prospects";

export type ScoreBreakdown = {
  buyIntent: number;
  engagement: number;
  reactivity: number;
  pipeline: number;
  negativePenalty: number;
};

export type LeadScore = {
  total: number;
  rawTotal: number;
  level: "hot" | "warm" | "cold";
  breakdown: ScoreBreakdown;
  signals: {
    hardNegative: string[];
    softNegative: string[];
    buyKeywords: string[];
    isStopped: boolean;
  };
  capReason: string | null;
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

/* ──────────────────────────────────────────────────────────────────────────
 * Keyword dictionaries
 * ────────────────────────────────────────────────────────────────────────── */

type KeywordCategory = {
  name: string;
  points: number;
  keywords: string[];
};

const BUY_INTENT_CATEGORIES: KeywordCategory[] = [
  {
    name: "Engagement d'achat",
    points: 12,
    keywords: [
      "je veux",
      "je le veux",
      "j achete",
      "j'achete",
      "je prends",
      "ok je le fais",
      "ok je vais",
      "partant",
      "go",
      "c'est parti",
      "let's go",
      "ok pour moi",
      "ca me va",
      "je suis pret",
      "je suis prete",
      "envoyez-moi le lien",
      "envoyez moi le lien",
      "lien de paiement",
      "comment je paye",
      "comment payer",
      "ou je paye",
      "ou payer",
      "garde-moi une place",
      "garde moi une place",
      "reserve-moi",
      "reserve moi",
    ],
  },
  {
    name: "Question de prix",
    points: 10,
    keywords: [
      "combien",
      "prix",
      "tarif",
      "ca coute",
      "ca coute combien",
      "ca vaut",
      "cout",
      "budget pour",
      "le cout",
    ],
  },
  {
    name: "Disponibilité / RDV",
    points: 10,
    keywords: [
      "quand",
      "disponible",
      "dispo",
      "calendrier",
      "agenda",
      "rdv",
      "rendez-vous",
      "rendez vous",
      "reserver",
      "appel",
      "call",
      "creneau",
      "premiere etape",
      "on commence quand",
      "ca commence quand",
      "des aujourd'hui",
      "des aujourd hui",
      "demain",
      "cette semaine",
    ],
  },
  {
    name: "Garantie / sécurité",
    points: 5,
    keywords: [
      "garantie",
      "remboursement",
      "satisfait",
      "securise",
      "satisfait ou rembourse",
      "risque",
      "rembourse",
      "argent perdu",
    ],
  },
  {
    name: "Détails produit",
    points: 3,
    keywords: [
      "comment ca marche",
      "comment ca fonctionne",
      "comment fonctionne",
      "ca inclut",
      "qu'est-ce qu'on a",
      "qu est ce qu on a",
      "qu'est-ce qui est inclus",
      "methode",
      "deroule",
      "deroulement",
      "duree",
      "ca dure combien",
      "etapes",
      "programme",
      "contenu",
    ],
  },
];

const HARD_NEGATIVE_KEYWORDS: string[] = [
  "pas interesse",
  "pas interessee",
  "pas interesse(e)",
  "non merci",
  "merci mais non",
  "non c'est non",
  "j'ai deja achete",
  "j ai deja achete",
  "j'ai trouve ailleurs",
  "j ai trouve ailleurs",
  "j'ai pris avec",
  "j ai pris avec",
  "je travaille deja avec",
  "je suis deja avec",
  "j'ai deja un",
  "j ai deja un",
  "trop cher",
  "vraiment trop cher",
  "pas les moyens",
  "j'ai pas les moyens",
  "j ai pas les moyens",
  "hors budget",
  "stop",
  "ne plus me contacter",
  "ne me contactez plus",
  "ne m'envoyez plus",
  "ne m envoyez plus",
  "desabonn",
  "laissez-moi tranquille",
  "laissez moi tranquille",
  "arretez de",
  "stop spam",
  "spam",
];

const SOFT_NEGATIVE_KEYWORDS: string[] = [
  "plus tard",
  "pas maintenant",
  "pas le moment",
  "pas le bon moment",
  "je verrai plus tard",
  "je verrai",
  "je reflechis",
  "j'y reflechis",
  "j y reflechis",
  "je vais reflechir",
  "je vais voir",
  "je te recontacte",
  "je te recontacterai",
  "je reviens vers toi",
  "je reviendrai",
  "quand ca m'interessera",
  "quand ca m interessera",
  "quand j'aurai",
  "quand j aurai",
  "trop occupe",
  "trop occupee",
  "pas le temps",
  "manque de temps",
  "peut-etre plus tard",
  "peut etre plus tard",
  "on verra",
];

/* ──────────────────────────────────────────────────────────────────────────
 * Text utilities
 * ────────────────────────────────────────────────────────────────────────── */

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "");

const normalizeText = (value: string): string =>
  stripDiacritics(value.toLowerCase()).replace(/\s+/g, " ").trim();

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

/* ──────────────────────────────────────────────────────────────────────────
 * Per-factor computations
 * ────────────────────────────────────────────────────────────────────────── */

const computeBuyIntent = (
  customerText: string,
): { points: number; hits: string[] } => {
  let points = 0;
  const hits: string[] = [];
  for (const category of BUY_INTENT_CATEGORIES) {
    const hit = findKeywordsHit(customerText, category.keywords);
    if (hit.length > 0) {
      points += category.points;
      hits.push(category.name);
    }
  }
  return { points: Math.min(40, points), hits };
};

const computeEngagement = (conversation: ProspectConversation): number => {
  const customerMessages = conversation.messages.filter(
    (m) => m.direction === "inbound" && m.authorType === "customer",
  );
  const count = customerMessages.length;
  if (count === 0) return 0;

  let countScore = 0;
  if (count >= 10) countScore = 8;
  else if (count >= 5) countScore = 5;
  else if (count >= 2) countScore = 2;

  const totalChars = customerMessages.reduce((acc, m) => acc + (m.text?.length ?? 0), 0);
  const avgLen = totalChars / count;
  let lenScore = 0;
  if (avgLen >= 140) lenScore = 7;
  else if (avgLen >= 80) lenScore = 5;
  else if (avgLen >= 40) lenScore = 3;
  else if (avgLen >= 15) lenScore = 1;

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
        reopenScore = 5;
        break;
      }
    }
  }

  return Math.min(20, countScore + lenScore + reopenScore);
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

  if (medianMin < 15) return 15;
  if (medianMin < 60) return 12;
  if (medianMin < 240) return 8;
  if (medianMin < 1440) return 4;
  if (medianMin < 2880) return 2;
  return 0;
};

const computePipelineBonus = (params: {
  hasBooking: boolean;
  hasClosedDeal: boolean;
}): number => {
  if (params.hasClosedDeal) return 25;
  if (params.hasBooking) return 15;
  return 0;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Main score computation
 * ────────────────────────────────────────────────────────────────────────── */

export const computeLeadScore = (
  conversation: ProspectConversation | null,
  context: { hasBooking: boolean; hasClosedDeal: boolean },
): LeadScore => {
  if (!conversation) {
    return {
      total: 0,
      rawTotal: 0,
      level: "cold",
      breakdown: {
        buyIntent: 0,
        engagement: 0,
        reactivity: 0,
        pipeline: 0,
        negativePenalty: 0,
      },
      signals: {
        hardNegative: [],
        softNegative: [],
        buyKeywords: [],
        isStopped: false,
      },
      capReason: null,
    };
  }

  const customerText = normalizeText(
    conversation.messages
      .filter((m) => m.direction === "inbound" && m.authorType === "customer")
      .map((m) => m.text ?? "")
      .join(" "),
  );

  const buyResult = computeBuyIntent(customerText);
  const engagement = computeEngagement(conversation);
  const reactivity = computeReactivity(conversation);
  const pipeline = computePipelineBonus(context);

  const rawTotal = buyResult.points + engagement + reactivity + pipeline;

  const hardHits = findKeywordsHit(customerText, HARD_NEGATIVE_KEYWORDS);
  const softHits = findKeywordsHit(customerText, SOFT_NEGATIVE_KEYWORDS);
  const isStopped = conversation.automationState === "stopped";

  let cap = 100;
  let capReason: string | null = null;

  if (hardHits.length > 0 && !context.hasClosedDeal) {
    cap = Math.min(cap, 20);
    capReason = `Signal négatif fort détecté : « ${hardHits[0]} »`;
  }
  if (softHits.length > 0 && !context.hasClosedDeal && cap > 45) {
    cap = 45;
    capReason = `Signal de procrastination : « ${softHits[0]} »`;
  }

  if (context.hasClosedDeal) {
    cap = 100;
    capReason = null;
  }

  const negativePenalty = Math.max(0, Math.min(rawTotal, 100) - Math.min(rawTotal, cap));
  const totalUncapped = Math.max(0, Math.min(100, rawTotal));
  const total = Math.max(0, Math.min(cap, totalUncapped));

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
      engagement,
      reactivity,
      pipeline,
      negativePenalty: Math.round(negativePenalty),
    },
    signals: {
      hardNegative: hardHits,
      softNegative: softHits,
      buyKeywords: buyResult.hits,
      isStopped,
    },
    capReason,
  };
};

/* ──────────────────────────────────────────────────────────────────────────
 * Pipeline stage derivation
 * ────────────────────────────────────────────────────────────────────────── */

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
