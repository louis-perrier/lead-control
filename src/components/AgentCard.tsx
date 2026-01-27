import {
  FunctionComponent,
  KeyboardEvent,
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
};

const AgentCard: FunctionComponent<AgentCardProps> = ({
  className = "",
  imageSrc,
  name,
  description,
  onNameChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableName, setEditableName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const onAgentImageClick = useCallback(() => {
    // Please sync "agentAiConfiguration" to the project
  }, []);

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

  return (
    <div className={[styles.agentcard, className].join(" ")}>
      <div className={styles.agentDetailsContainer}>
        <div className={styles.detailsagentcard}>
          <img className={styles.favoriteIcon} alt="" src="/favorite.svg" />
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
          <img
            className={styles.favoriteIcon}
            alt=""
            src="/edit.svg"
            onClick={onEditClick}
          />
        </div>
      </div>
      <div className={styles.textsupport} />
      <div className={styles.agentdescription}>{description}</div>
      <img
        className={styles.agentimageIcon}
        loading="lazy"
        alt={name}
        src={imageSrc}
        onClick={onAgentImageClick}
      />
    </div>
  );
};

export default AgentCard;
