import {
  FunctionComponent,
  KeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./AgentCard.module.css";

export type AgentCardProps = {
  className?: string;
  imageSrc: string;
  name: string;
  description: string;
  onNameChange?: (nextName: string) => void;
  isFav?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  onFavClick?: () => void;
};

const AgentCard: FunctionComponent<AgentCardProps> = ({
  className = "",
  imageSrc,
  name,
  description,
  onNameChange,
  isFav = false,
  isActive = false,
  onClick,
  onFavClick,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableName, setEditableName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCardClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  // Tout ça pour pouvoir éditer le nom
  const onEditClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  useEffect(() => {
    setEditableName(name);
  }, [name]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const commitName = useCallback(() => {
    const trimmed = editableName.trim();
    if (trimmed.length > 0 && trimmed !== name) {
      onNameChange?.(trimmed);
    }
    setIsEditing(false);
  }, [editableName, name, onNameChange]);

  const onInputBlur = useCallback(() => {
    commitName();
  }, [commitName]);

  const onInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitName();
        inputRef.current?.blur();
      } else if (event.key === "Escape") {
        setIsEditing(false);
      }
    },
    [commitName]
  );
  //------------------------Editer le nom---------------------------------

  const handleImageClick = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
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
          {isEditing ? (
          <input
            ref={inputRef}
            className={styles.agentnameInput}
            value={editableName}
            onChange={(event) =>
              setEditableName(event.target.value.slice(0, 8))
            }
            maxLength={8}
            onBlur={onInputBlur}
            onKeyDown={onInputKeyDown}
          />
          ) : (
            <h3 className={styles.agentname}>{name}</h3>
          )}
          <button
            className={styles.editButton}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEditClick();
            }}
          >
            <img
              className={styles.favoriteIcon}
              alt="Modifier le nom"
              src="/edit.svg"
            />
          </button>
        </div>
      </div>
      <img
        className={styles.agentimageIcon}
        loading="lazy"
        alt={name}
        src={imageSrc}
        onClick={handleImageClick}
      />
      {isActive && (
        <div className={styles.statusBadgeWrapper}>
          <span className={styles.statusTag}>Actif</span>
        </div>
      )}
    </div>
  );
};

export default AgentCard;
