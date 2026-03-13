import { FunctionComponent } from "react";
import styles from "./CreditsProgressBar.module.css";

export type CreditsProgressBarProps = {
  current: number;
  total: number;
};

const CreditsProgressBar: FunctionComponent<CreditsProgressBarProps> = ({
  current,
  total,
}) => {
  // Calculer le pourcentage, mais le plafonner à 100%
  const percentage = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  
  // Déterminer la couleur selon le niveau
  const getProgressColor = () => {
    if (percentage <= 20) return "#ef4444";
    if (percentage <= 50) return "#f59e0b";
    return "#059669";
  };

  return (
    <div className={styles.progressContainer}>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressBar}
          style={{
            width: `${percentage}%`,
            backgroundColor: getProgressColor(),
          }}
        />
      </div>
    </div>
  );
};

export default CreditsProgressBar;