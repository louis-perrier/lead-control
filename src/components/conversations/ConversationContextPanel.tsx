import { FunctionComponent, useMemo } from "react";
import {
  computeLeadScore,
  getPipelineStage,
  PIPELINE_STAGE_LABELS,
} from "../../lib/leadScoring";
import type { ProspectConversation } from "../../lib/prospects";
import styles from "./ConversationContextPanel.module.css";

type PanelConversation = {
  id: string;
  messages: ReadonlyArray<{
    direction: "inbound" | "outbound";
    text: string;
    sentAt: string;
    authorType?: "agent" | "human" | "customer";
  }>;
  summary?: string | null;
  automationState: string;
};

type Props = {
  conversation: PanelConversation;
  hasBooking: boolean;
  hasClosedDeal: boolean;
  dealAmount?: number | null;
  onOpenContact: () => void;
};

const STAGE_CLASS_BY_KEY: Record<string, string> = {
  nouveau: styles.stageNouveau,
  engage: styles.stageEngage,
  qualifie: styles.stageQualifie,
  rdv_pris: styles.stageRdv,
  deal_ferme: styles.stageDeal,
};

const ConversationContextPanel: FunctionComponent<Props> = ({
  conversation,
  hasBooking,
  hasClosedDeal,
  dealAmount,
  onOpenContact,
}) => {
  const score = useMemo(
    () =>
      computeLeadScore(conversation as unknown as ProspectConversation, {
        hasBooking,
        hasClosedDeal,
      }),
    [conversation, hasBooking, hasClosedDeal],
  );

  const stage = useMemo(
    () =>
      getPipelineStage({
        conversation: conversation as unknown as ProspectConversation,
        hasBooking,
        hasClosedDeal,
        score: score.total,
      }),
    [conversation, hasBooking, hasClosedDeal, score.total],
  );

  const summary = (conversation.summary ?? "").trim();
  const hasNegativeSignal =
    score.signals.hardNegative.length > 0 ||
    score.signals.softNegative.length > 0 ||
    score.signals.freeSeeker.length > 0 ||
    score.signals.nonDecisionMaker.length > 0 ||
    score.signals.wrongTarget.length > 0 ||
    score.signals.supporter.length > 0;
  const hasPositiveSignal =
    score.signals.buyKeywords.length > 0 ||
    score.signals.qualificationSignals.length > 0 ||
    score.signals.trumpSignals.length > 0;
  const dealValueFormatted =
    hasClosedDeal && typeof dealAmount === "number" && dealAmount > 0
      ? new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }).format(dealAmount)
      : null;

  return (
    <div className={styles.panel}>
      <div className={styles.topRow}>
        <span
          className={`${styles.scoreBadge} ${
            score.level === "hot"
              ? styles.scoreHot
              : score.level === "warm"
              ? styles.scoreWarm
              : styles.scoreCold
          }`}
          title={`Intention d'achat ${score.breakdown.buyIntent}/35 · Qualification ${score.breakdown.qualification}/30 · Engagement ${score.breakdown.engagement}/15 · Réactivité ${score.breakdown.reactivity}/10 · Pipeline ${score.breakdown.pipeline}/10${
            score.trumpReason ? `\n\n✓ ${score.trumpReason}` : ""
          }`}
        >
          <span className={styles.scoreNumber}>{score.total}</span>
          <span className={styles.scoreMax}>/100</span>
          <span className={styles.scoreLevel}>
            {score.level === "hot" ? "Chaud" : score.level === "warm" ? "Tiède" : "Froid"}
          </span>
        </span>

        <span className={`${styles.stageChip} ${STAGE_CLASS_BY_KEY[stage] ?? ""}`}>
          {PIPELINE_STAGE_LABELS[stage]}
          {dealValueFormatted && (
            <span className={styles.stageAmount}>· {dealValueFormatted}</span>
          )}
        </span>

        {score.capReason && (
          <span className={styles.capChip}>
            <span className={styles.capIcon} aria-hidden="true">⚠</span>
            {score.capReason}
          </span>
        )}

        <button
          type="button"
          className={styles.fileBtn}
          onClick={onOpenContact}
        >
          Voir la fiche
          <span aria-hidden="true" className={styles.fileBtnArrow}>→</span>
        </button>
      </div>

      {(summary || hasPositiveSignal || hasNegativeSignal) && (
        <div className={styles.bottomRow}>
          {summary && (
            <p className={styles.summary} title={summary}>
              <span className={styles.summaryLabel}>Résumé</span>
              <span className={styles.summaryText}>{summary}</span>
            </p>
          )}

          {(hasPositiveSignal || hasNegativeSignal) && (
            <div className={styles.signalsRow}>
              {score.signals.trumpSignals.slice(0, 2).map((kw) => (
                <span
                  key={`trump-${kw}`}
                  className={styles.signalPositive}
                  title="Signal d'achat fort"
                >
                  ★ « {kw} »
                </span>
              ))}
              {score.signals.buyKeywords.slice(0, 3).map((kw) => (
                <span key={`pos-${kw}`} className={styles.signalPositive}>
                  ✓ {kw}
                </span>
              ))}
              {score.signals.qualificationSignals.slice(0, 3).map((kw) => (
                <span key={`qual-${kw}`} className={styles.signalQualif}>
                  ✦ {kw}
                </span>
              ))}
              {score.signals.hardNegative.slice(0, 2).map((kw) => (
                <span key={`neg-${kw}`} className={styles.signalNegative}>
                  ✕ « {kw} »
                </span>
              ))}
              {score.signals.wrongTarget.slice(0, 1).map((kw) => (
                <span key={`wt-${kw}`} className={styles.signalNegative}>
                  ⊘ « {kw} »
                </span>
              ))}
              {score.signals.freeSeeker.slice(0, 1).map((kw) => (
                <span key={`free-${kw}`} className={styles.signalNegative}>
                  € « {kw} »
                </span>
              ))}
              {score.signals.nonDecisionMaker.slice(0, 1).map((kw) => (
                <span key={`ndm-${kw}`} className={styles.signalSoft}>
                  👥 « {kw} »
                </span>
              ))}
              {score.signals.softNegative.slice(0, 2).map((kw) => (
                <span key={`soft-${kw}`} className={styles.signalSoft}>
                  ⏳ « {kw} »
                </span>
              ))}
              {score.signals.supporter.slice(0, 2).map((kw) => (
                <span
                  key={`sup-${kw}`}
                  className={styles.signalSoft}
                  title={
                    score.signals.isSupporterMode
                      ? "Conversation amicale détectée (sympathisant)"
                      : "Signal de soutien"
                  }
                >
                  🫶 « {kw} »
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConversationContextPanel;
