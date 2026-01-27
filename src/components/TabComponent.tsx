import { FunctionComponent, MouseEvent } from "react";
import styles from "./TabComponent.module.css";

export type TabComponentType = {
  className?: string;
  label?: string;
  iconSrc?: string;
  onClick?: () => void;
  closable?: boolean;
  onClose?: () => void;
  closeIconSrc?: string;
};

const TabComponent: FunctionComponent<TabComponentType> = ({
  className = "",
  label = "Agents",
  iconSrc = "/tabComponentSelect.svg",
  onClick,
  closable = false,
  onClose,
  closeIconSrc = "/cancel.svg",
}) => {
  const handleCloseClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose?.();
  };

  return (
    <div
      className={[styles.tabcomponent, className].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      <img
        className={styles.textsupportIcon}
        loading="lazy"
        alt=""
        src={iconSrc}
      />
      <div className={styles.tabContent}>
        {closable && (
          <button
            type="button"
            className={styles.cancelContainer}
            onClick={handleCloseClick}
          >
            <img
              className={styles.cancelIcon}
              alt="Fermer l'onglet"
              src={closeIconSrc}
            />
          </button>
        )}
        <div className={styles.agenttabWrapper}>
          <div className={styles.agenttab}>{label}</div>
        </div>
      </div>
    </div>
  );
};

export default TabComponent;
