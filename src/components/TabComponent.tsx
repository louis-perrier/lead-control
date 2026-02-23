import { FunctionComponent, KeyboardEvent, MouseEvent } from "react";
import styles from "./TabComponent.module.css";

export type TabComponentType = {
  className?: string;
  label?: string;
  iconSrc?: string;
  active?: boolean;
  onClick?: () => void;
  closable?: boolean;
  onClose?: () => void;
  closeIconSrc?: string;
};

const TabComponent: FunctionComponent<TabComponentType> = ({
  className = "",
  label = "Mes agents",
  iconSrc = "/tabComponentSelect.svg",
  active = false,
  onClick,
  closable = false,
  onClose,
  closeIconSrc = "/cancel.svg",
}) => {
  const handleCloseClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={[styles.tabcomponent, className].filter(Boolean).join(" ")}
      data-active={active}
      data-closable={closable}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {iconSrc && (
        <img className={styles.tabIcon} loading="lazy" alt="" src={iconSrc} />
      )}
      <div className={styles.agenttab}>{label}</div>
      {closable && (
        <button
          type="button"
          className={styles.cancelContainer}
          onClick={handleCloseClick}
          aria-label={`Fermer l'onglet ${label}`}
        >
          <img
            className={styles.cancelIcon}
            alt=""
            src={closeIconSrc}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
};

export default TabComponent;
