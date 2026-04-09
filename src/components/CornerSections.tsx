import {
  FunctionComponent,
  KeyboardEvent,
  useEffect,
  useState,
} from "react";
import styles from "./CornerSections.module.css";

export type CornerStatus = "available" | "lock" | "unlock";
export type CornerSection = "Details" | "Connexions" | "Templates" | "Configurations";

type CornerBlockProps = {
  className: string;
  status: CornerStatus;
  title: string;
  order?: number;
  onClick?: () => void;
};

const CornerBlock: FunctionComponent<CornerBlockProps> = ({
  className,
  status,
  title,
  order,
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
      {order != null && (
        <span className={styles.cornerOrderBadge} aria-label={`Ordre ${order}`}>
          <span className={styles.cornerOrderBadgeNumber}>{order}</span>
        </span>
      )}
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
    Templates: "available",
    Configurations: "lock",
  };

  const effectiveStatuses: Record<CornerSection, CornerStatus> = {
    Details: statuses?.Details ?? defaultStatuses.Details,
    Connexions: statuses?.Connexions ?? defaultStatuses.Connexions,
    Templates: statuses?.Templates ?? defaultStatuses.Templates,
    Configurations:
      statuses?.Configurations ?? defaultStatuses.Configurations,
  };

  const orderMap: Record<CornerSection, number | undefined> = {
    Details: 1,
    Connexions: 2,
    Templates: undefined,
    Configurations: 3,
  };

  const blocks: {
    section: CornerSection;
    status: CornerStatus;
    position: string;
    order?: number;
  }[] =
    [
      {
        section: "Details",
        status: effectiveStatuses.Details,
        position: styles.cornerTopLeft,
        order: orderMap.Details,
      },
      {
        section: "Connexions",
        status: effectiveStatuses.Connexions,
        position: styles.cornerTopRight,
        order: orderMap.Connexions,
      },
      {
        section: "Templates",
        status: effectiveStatuses.Templates,
        position: styles.cornerBottomLeft,
        order: orderMap.Templates,
      },
      {
        section: "Configurations",
        status: effectiveStatuses.Configurations,
        position: styles.cornerBottomRight,
        order: orderMap.Configurations,
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
      <div
        className={[
          styles.claraBackground,
          backgroundImage ? styles.claraBackgroundAgent : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={backgroundStyle}
      >
        {blocks.map((block) => {
          const canSelect =
            block.status !== "lock";
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
            order={block.order}
              onClick={handleClick}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CornerSections;
