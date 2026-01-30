import {
  FunctionComponent,
  KeyboardEvent,
} from "react";
import styles from "./CornerSections.module.css";

export type CornerStatus = "available" | "lock" | "unlock";
export type CornerSection = "Details" | "Connexions" | "Test" | "Configurations";

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
      <span className={styles.cornerTitle}>{title}</span>
    </div>
  );
};

type CornerSectionsProps = {
  backgroundImage?: string;
  onSelect: (section: CornerSection) => void;
};

const CornerSections: FunctionComponent<CornerSectionsProps> = ({
  backgroundImage,
  onSelect,
}) => {
  const backgroundStyle = backgroundImage
    ? { backgroundImage: `url(${backgroundImage})` }
    : undefined;

  const blocks: { section: CornerSection; status: CornerStatus; position: string }[] =
    [
      { section: "Details", status: "available", position: styles.cornerTopLeft },
      { section: "Connexions", status: "unlock", position: styles.cornerTopRight },
      { section: "Test", status: "lock", position: styles.cornerBottomLeft },
      {
        section: "Configurations",
        status: "lock",
        position: styles.cornerBottomRight,
      },
    ];

  return (
    <div className={styles.claraContainer}>
      <div className={styles.claraBackground} style={backgroundStyle}>
        {blocks.map((block) => (
          <CornerBlock
            key={block.section}
            className={block.position}
            status={block.status}
            title={block.section}
            onClick={() => onSelect(block.section)}
          />
        ))}
      </div>
    </div>
  );
};

export default CornerSections;
