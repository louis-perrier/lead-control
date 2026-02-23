import { FunctionComponent, MouseEvent } from "react";
import styles from "./OverlayRenameAgent.module.css";
import { AgentInfo } from "../data/agents";

const AGENT_NAME_MAX_LENGTH = 11;

export type OverlayRenameAgentProps = {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentInfo | null;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  canContinue: boolean;
  errorMessage?: string;
  isSubmitting?: boolean;
};

const OverlayRenameAgent: FunctionComponent<OverlayRenameAgentProps> = ({
  isOpen,
  onClose,
  agent,
  value,
  onChange,
  onContinue,
  canContinue,
  errorMessage,
  isSubmitting = false,
}) => {
  if (!isOpen || !agent) {
    return null;
  }

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.content} onClick={stopPropagation}>
        <h2 className={styles.title}>Renommer l’agent</h2>
        <p className={styles.description}>
          {agent.name} sera enregistré avec le nom de ton choix.
        </p>
        <label className={styles.label} htmlFor="rename-agent-input">
          Nom de l’agent
        </label>
        <input
          id="rename-agent-input"
          className={styles.input}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={AGENT_NAME_MAX_LENGTH}
        />
        <p className={styles.errorText}>
          {errorMessage ?? "\u00A0"}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annuler
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onContinue}
            disabled={!canContinue || isSubmitting}
          >
            {isSubmitting ? "Ajout ..." : "Continuer"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverlayRenameAgent;
