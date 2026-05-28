import { FunctionComponent, useMemo } from "react";
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_ORDER,
  PipelineStage,
} from "../../lib/leadScoring";
import styles from "./PipelineView.module.css";

export type PipelineCard = {
  contactId: string;
  contactName: string;
  subtitle: string;
  channel: "Instagram" | "WhatsApp" | "Telegram" | null;
  score: number;
  scoreLevel: "hot" | "warm" | "cold";
  lastActivityAt: string | null;
  stage: PipelineStage;
  estimatedValue: number;
  actualValue: number | null;
};

type Props = {
  cards: PipelineCard[];
  onCardClick: (contactId: string) => void;
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

const formatRelativeDate = (iso: string | null): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

const STAGE_ACCENT: Record<PipelineStage, string> = {
  nouveau: styles.stageNouveau,
  engage: styles.stageEngage,
  qualifie: styles.stageQualifie,
  rdv_pris: styles.stageRdv,
  deal_ferme: styles.stageDeal,
};

const CHANNEL_ICONS: Record<string, string> = {
  Instagram: "/logoConnectors/instagram.svg",
  WhatsApp: "/logoConnectors/whatsapp.webp",
  Telegram: "/logoConnectors/telegram.svg",
};

const PipelineView: FunctionComponent<Props> = ({ cards, onCardClick }) => {
  const stageData = useMemo(() => {
    const data: Record<
      PipelineStage,
      { cards: PipelineCard[]; value: number; isActual: boolean }
    > = {
      nouveau: { cards: [], value: 0, isActual: false },
      engage: { cards: [], value: 0, isActual: false },
      qualifie: { cards: [], value: 0, isActual: false },
      rdv_pris: { cards: [], value: 0, isActual: false },
      deal_ferme: { cards: [], value: 0, isActual: true },
    };

    cards.forEach((card) => {
      data[card.stage].cards.push(card);
      const value =
        card.stage === "deal_ferme"
          ? card.actualValue ?? card.estimatedValue
          : card.estimatedValue;
      data[card.stage].value += value;
    });

    PIPELINE_STAGE_ORDER.forEach((stage) => {
      data[stage].cards.sort((a, b) => b.score - a.score);
    });

    return data;
  }, [cards]);

  const totals = useMemo(() => {
    let pipelineValue = 0;
    let closedValue = 0;
    PIPELINE_STAGE_ORDER.forEach((stage) => {
      if (stage === "deal_ferme") closedValue += stageData[stage].value;
      else pipelineValue += stageData[stage].value;
    });
    return { pipelineValue, closedValue };
  }, [stageData]);

  const maxStageValue = useMemo(() => {
    let max = 0;
    PIPELINE_STAGE_ORDER.forEach((stage) => {
      if (stageData[stage].value > max) max = stageData[stage].value;
    });
    return max;
  }, [stageData]);

  return (
    <div className={styles.pipelineWrap}>
      <div className={styles.pipelineHeader}>
        <div className={styles.totalsRow}>
          <div className={styles.totalChunk}>
            <span className={styles.totalLabel}>Pipeline en cours</span>
            <span className={styles.totalValue}>{formatCurrency(totals.pipelineValue)}</span>
          </div>
          <div className={styles.totalDivider} aria-hidden="true" />
          <div className={styles.totalChunk}>
            <span className={styles.totalLabel}>Chiffre d'affaires fermé</span>
            <span className={`${styles.totalValue} ${styles.totalValueClosed}`}>
              {formatCurrency(totals.closedValue)}
            </span>
          </div>
        </div>

        <div className={styles.funnelStrip} role="list" aria-label="Argent par étape du pipeline">
          {PIPELINE_STAGE_ORDER.map((stage, index) => {
            const data = stageData[stage];
            const percent = maxStageValue > 0 ? (data.value / maxStageValue) * 100 : 0;
            return (
              <div
                key={stage}
                className={`${styles.funnelSegment} ${STAGE_ACCENT[stage]}`}
                role="listitem"
              >
                <div className={styles.funnelSegmentTop}>
                  <span className={styles.funnelSegmentLabel}>
                    {PIPELINE_STAGE_LABELS[stage]}
                  </span>
                  <span className={styles.funnelSegmentValue}>
                    {formatCurrency(data.value)}
                  </span>
                </div>
                <div className={styles.funnelSegmentTrack}>
                  <div
                    className={styles.funnelSegmentFill}
                    style={{ width: `${Math.max(percent, data.value > 0 ? 6 : 0)}%` }}
                  />
                </div>
                {index < PIPELINE_STAGE_ORDER.length - 1 && (
                  <span className={styles.funnelSegmentArrow} aria-hidden="true">›</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.kanban}>
        {PIPELINE_STAGE_ORDER.map((stage) => {
          const data = stageData[stage];
          return (
            <section
              key={stage}
              className={`${styles.column} ${STAGE_ACCENT[stage]}`}
            >
              <header className={styles.columnHeader}>
                <div className={styles.columnTitleRow}>
                  <h3 className={styles.columnTitle}>{PIPELINE_STAGE_LABELS[stage]}</h3>
                  <span className={styles.columnCount}>{data.cards.length}</span>
                </div>
                <div className={styles.columnValueRow}>
                  <span className={styles.columnValueLabel}>
                    {data.isActual ? "Fermé" : "En jeu"}
                  </span>
                  <span className={styles.columnValue}>{formatCurrency(data.value)}</span>
                </div>
              </header>

              <div className={styles.columnBody}>
                {data.cards.length === 0 ? (
                  <div className={styles.emptyColumn}>Aucun contact</div>
                ) : (
                  data.cards.map((card) => (
                    <button
                      key={card.contactId}
                      type="button"
                      className={styles.card}
                      onClick={() => onCardClick(card.contactId)}
                    >
                      <div className={styles.cardHead}>
                        <div className={styles.cardIdentity}>
                          {card.channel && CHANNEL_ICONS[card.channel] && (
                            <img
                              src={CHANNEL_ICONS[card.channel]}
                              alt={card.channel}
                              className={styles.cardChannelIcon}
                            />
                          )}
                          <span className={styles.cardName}>{card.contactName}</span>
                        </div>
                        <span
                          className={`${styles.cardScore} ${
                            card.scoreLevel === "hot"
                              ? styles.scoreHot
                              : card.scoreLevel === "warm"
                              ? styles.scoreWarm
                              : styles.scoreCold
                          }`}
                        >
                          {card.score}
                        </span>
                      </div>
                      {card.subtitle && (
                        <span className={styles.cardSubtitle}>{card.subtitle}</span>
                      )}
                      <div className={styles.cardFooter}>
                        <span className={styles.cardDate}>
                          {formatRelativeDate(card.lastActivityAt)}
                        </span>
                        <span className={styles.cardValue}>
                          {formatCurrency(
                            card.stage === "deal_ferme"
                              ? card.actualValue ?? card.estimatedValue
                              : card.estimatedValue,
                          )}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

    </div>
  );
};

export default PipelineView;
