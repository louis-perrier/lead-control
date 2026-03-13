import React from "react";
import styles from "./ToneStatusIndicator.module.css";

export type ToneStatus =
  | "idle"
  | "answers_saved"
  | "configured"
  | "modified"
  | "fallback_to_normal";

type ToneStatusIndicatorProps = {
  status: ToneStatus;
  lastGenerated?: string | null;
  onAction?: () => void;
};

const statusLabels: Record<ToneStatus, { title: string; hint: string; action?: string }> = {
  idle: {
    title: "Non configuré",
    hint: "Choisis un ton ou des réponses personnalisées.",
  },
  answers_saved: {
    title: "Réponses prêtes",
    hint: "Les questions sont remplies. Génère le ton.",
    action: "Générer le ton",
  },
  configured: {
    title: "Ton personnalisé actif",
    hint: "Ton généré le",
    action: "Régénérer",
  },
  modified: {
    title: "Modifications non générées",
    hint: "Les réponses ont évolué depuis la dernière génération.",
    action: "Régénérer",
  },
  fallback_to_normal: {
    title: "Ton Normal actif",
    hint: "Le ton personnalisé n’a pas encore été généré.",
  },
};

const ToneStatusIndicator: React.FC<ToneStatusIndicatorProps> = ({
  status,
  lastGenerated,
  onAction,
}) => {
  const current = statusLabels[status];
  return (
    <div className={`${styles.statusCard} ${styles[`status${status}`]}`}>
      <div>
        <p className={styles.statusTitle}>{current.title}</p>
        <p className={styles.statusHint}>
          {status === "configured" && lastGenerated
            ? `${current.hint} ${new Date(lastGenerated).toLocaleString("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}`
            : current.hint}
        </p>
      </div>
      {current.action && onAction && (
        <button type="button" className={styles.statusAction} onClick={onAction}>
          {current.action}
        </button>
      )}
    </div>
  );
};

export default ToneStatusIndicator;
