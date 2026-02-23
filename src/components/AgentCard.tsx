import { FunctionComponent, KeyboardEvent, MouseEvent, useCallback } from "react";
import styles from "./AgentCard.module.css";

export type AgentCardProps = {
  className?: string;
  imageSrc: string;
  name: string;
  isFav?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  onFavClick?: () => void;
};

const AgentCard: FunctionComponent<AgentCardProps> = ({
  className = "",
  imageSrc,
  name,
  isFav = false,
  isActive = false,
  onClick,
  onFavClick,
}) => {
  const handleCardClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const handleImageClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      handleCardClick();
    },
    [handleCardClick]
  );

  return (
    <div
      className={[styles.agentcard, className].filter(Boolean).join(" ")}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className={styles.agentDetailsContainer}>
        <div className={styles.detailsagentcard}>
          <button
            className={[
              styles.favoriteButton,
              isFav ? styles.favoriteButtonActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onFavClick?.();
            }}
            aria-pressed={isFav}
          >
            <img
              className={styles.favoriteIcon}
              alt={isFav ? "Favori actif" : "Favori"}
              src={isFav ? "/favoriteSelected.svg" : "/favorite.svg"}
            />
          </button>
          <h3 className={styles.agentname} title={name}>
            {name}
          </h3>
        </div>
      </div>
      <div className={styles.agentimageFrame} onClick={handleImageClick}>
        <img
          className={styles.agentimageIcon}
          loading="lazy"
          alt={name}
          src={imageSrc}
        />
        <span className={styles.agentWinkEye} aria-hidden="true" />
      </div>
      {isActive !== undefined && (
        <div className={styles.statusBadgeWrapper}>
          <span
            className={[
              styles.statusTag,
              isActive ? styles.statusTagActive : styles.statusTagInactive,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {isActive ? "Actif" : "Inactif"}
          </span>
        </div>
      )}
    </div>
  );
};

export default AgentCard;
