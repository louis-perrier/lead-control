import { FunctionComponent, MouseEvent } from "react";
import styles from "./OverlayAddAgent.module.css";
import { AgentInfo } from "../data/agents";

export type OverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentInfo;
  availableAgentIds: Set<string>;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (agent: AgentInfo) => void;
  limitReached?: boolean;
  limitMessage?: string;
};

const formatReleaseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const Overlay: FunctionComponent<OverlayProps> = ({
  isOpen,
  onClose,
  agent,
  availableAgentIds,
  onPrevious,
  onNext,
  onSelect,
  limitReached = false,
  limitMessage,
}) => {
  if (!isOpen || !agent) {
    return null;
  }

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };
  const isAvailable = availableAgentIds.has(agent.agent_id);
  const canSelect = isAvailable && !limitReached;
  const isBlocked = !isAvailable;
  const isBonusAgent = Boolean(agent.is_bonus);
  const shouldShowBonus = isBlocked && isBonusAgent;
  const isUnavailable = agent.is_available === false;
  const shouldShowComingSoon = isBlocked && isUnavailable;
  const releaseDateLabel = shouldShowComingSoon
    ? formatReleaseDate(agent.release_date)
    : null;
  const previewFilter = isBlocked ? "grayscale(100%)" : undefined;
  const previewOpacity = isBlocked ? 0.78 : 1;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.overlayContent} onClick={stopPropagation}>
        <h2 className={styles.title}>Sélectionnez un agent</h2>
        <div className={styles.body}>
            <div className={styles.previewWrapper}>
            <div
              className={styles.preview}
              style={{
                backgroundImage: `url(${agent.backgroundSrc})`,
                  filter: previewFilter,
                  opacity: previewOpacity,
              }}
            />
            <div className={styles.previewOverlay}>
              {shouldShowComingSoon && (
                <span className={styles.comingSoonBanner}>PROCHAINEMENT</span>
              )}
              {releaseDateLabel && (
                <span className={styles.releaseDate}>
                  Sortie prévue le {releaseDateLabel}
                </span>
              )}
            </div>
            <button
              type="button"
              className={[styles.iconButton, styles.left].join(" ")}
              onClick={onPrevious}
              aria-label="Agent précédent"
            >
              <img src="/iconChevronLeft.svg" alt="" className={styles.icon} />
            </button>
            <button
              type="button"
              className={[styles.iconButton, styles.right].join(" ")}
              onClick={onNext}
              aria-label="Agent suivant"
            >
              <img src="/iconChevronRight.svg" alt="" className={styles.icon} />
            </button>
          </div>
          <div className={styles.sidebar}>
            <div className={styles.agentInfo}>
              <p className={styles.agentName}>{agent.name}</p>
              <div className={styles.infoCard}>
                {shouldShowBonus && (
                  <span className={styles.infoBonusLabel}>Agent Bonus</span>
                )}
                <div
                  className={
                    shouldShowBonus ? styles.infoCardContentBlur : styles.infoCardContent
                  }
                >
                  <p className={styles.agentDescription}>{agent.description}</p>
                  <div className={styles.detailsHeader}>
                    <span>Détails clés</span>
                  </div>
                  <ul className={styles.detailsList}>
                    {agent.details.map((detail, index) => (
                      <li key={`${detail}-${index}`} className={styles.detailItem}>
                        <span className={styles.detailDot} aria-hidden="true" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {!isAvailable ? (
                <button
                  type="button"
                  className={styles.selectButton}
                  disabled
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Bloqué
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.selectButton}
                    onClick={() => canSelect && onSelect(agent)}
                    disabled={!canSelect}
                    style={
                      !canSelect
                        ? { opacity: 0.6, cursor: "not-allowed" }
                        : undefined
                    }
                  >
                    {limitReached ? "Limite atteinte" : "Sélectionner"}
                  </button>
                  {limitReached && limitMessage && (
                    <p className={styles.limitMessage}>{limitMessage}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overlay;
