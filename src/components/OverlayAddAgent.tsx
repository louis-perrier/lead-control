import { FunctionComponent } from "react";
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
};

const Overlay: FunctionComponent<OverlayProps> = ({
  isOpen,
  onClose,
  agent,
  availableAgentIds,
  onPrevious,
  onNext,
  onSelect,
}) => {
  if (!isOpen || !agent) {
    return null;
  }

  const stopPropagation = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };
  const isAvailable = availableAgentIds.has(agent.agent_id);

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
                  filter: isAvailable ? undefined : "grayscale(100%)",
                }}
            />
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
                <p className={styles.agentDescription}>{agent.description}</p>
                <ul className={styles.detailsList}>
                  {agent.details.map((detail, index) => (
                    <li key={`${detail}-${index}`}>{detail}</li>
                  ))}
                </ul>
              </div>
              {isAvailable ? (
                <button
                  type="button"
                  className={styles.selectButton}
                  onClick={() => onSelect(agent)}
                >
                  Sélectionner
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.selectButton}
                  disabled
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Bloqué
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overlay;
