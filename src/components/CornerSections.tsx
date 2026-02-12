import {
  FunctionComponent,
  KeyboardEvent,
  useEffect,
  useState,
} from "react";
import styles from "./CornerSections.module.css";

export type CornerStatus = "available" | "lock" | "unlock";
export type CornerSection = "Details" | "Connexions" | "BIENTÔT" | "Configurations";

type CornerBlockProps = {
  className: string;
  status: CornerStatus;
  title: string;
  onClick?: () => void;
};

const CornerBlock: FunctionComponent<CornerBlockProps> = ({
  className,
  status,
  title,
  onClick,
}) => {
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`${styles.cornerBlock} ${styles[`block${statusLabel}`]} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      {status === "lock" && (
        <div className={styles.lockIconWrapper}>
          <img src="/lockIcon.svg" alt="Verrouillé" />
        </div>
      )}
      {status === "unlock" && (
        <div className={styles.unlockIconWrapper}>
          <img src="/unlockIcon.svg" alt="Déverrouillé" />
        </div>
      )}
      <span className={styles.cornerTitle}>{title}</span>
    </div>
  );
};

type CornerSectionsProps = {
  backgroundImage?: string;
  onSelect: (section: CornerSection) => void;
  statuses?: Record<CornerSection, CornerStatus>;
};

const CornerSections: FunctionComponent<CornerSectionsProps> = ({
  backgroundImage,
  onSelect,
  statuses,
}) => {
  const backgroundStyle = backgroundImage
    ? { backgroundImage: `url(${backgroundImage})` }
    : undefined;

  const defaultStatuses: Record<CornerSection, CornerStatus> = {
    Details: "available",
    Connexions: "unlock",
    BIENTÔT: "lock",
    Configurations: "lock",
  };

  const effectiveStatuses: Record<CornerSection, CornerStatus> = {
    Details: statuses?.Details ?? defaultStatuses.Details,
    Connexions: statuses?.Connexions ?? defaultStatuses.Connexions,
    BIENTÔT: statuses?.BIENTÔT ?? defaultStatuses.BIENTÔT,
    Configurations:
      statuses?.Configurations ?? defaultStatuses.Configurations,
  };

  const blocks: { section: CornerSection; status: CornerStatus; position: string }[] =
    [
      {
        section: "Details",
        status: effectiveStatuses.Details,
        position: styles.cornerTopLeft,
      },
      {
        section: "Connexions",
        status: effectiveStatuses.Connexions,
        position: styles.cornerTopRight,
      },
      {
        section: "BIENTÔT",
        status: effectiveStatuses.BIENTÔT,
        position: styles.cornerBottomLeft,
      },
      {
        section: "Configurations",
        status: effectiveStatuses.Configurations,
        position: styles.cornerBottomRight,
      },
    ];

  const [shakingSection, setShakingSection] =
    useState<CornerSection | null>(null);

  useEffect(() => {
    if (!shakingSection) return undefined;
    const timer = setTimeout(() => setShakingSection(null), 480);
    return () => clearTimeout(timer);
  }, [shakingSection]);

  const triggerShake = () => {
    const target = (Object.entries(effectiveStatuses).find(
      ([, status]) => status === "unlock"
    )?.[0] ?? "Details") as CornerSection;
    setShakingSection(target);
  };

  return (
    <div className={styles.claraContainer}>
      <div className={styles.claraBackground} style={backgroundStyle}>
        {blocks.map((block) => {
          const canSelect =
            block.section !== "BIENTÔT" && block.status !== "lock";
          const handleClick = () => {
            if (canSelect) {
              onSelect(block.section);
            } else {
              triggerShake();
            }
          };
          const shakeClass =
            shakingSection === block.section ? styles.cornerShake : "";
          return (
            <CornerBlock
              key={block.section}
              className={`${block.position} ${shakeClass}`}
              status={block.status}
              title={block.section}
              onClick={handleClick}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CornerSections;
