import { FunctionComponent, type CSSProperties } from "react";
import Badges from "./Badges";
import styles from "./NavItem.module.css";

export type NavItemType = {
  className?: string;
  size?: string;

  /** Variant props */
  badge?: string;
  elevation?: string;
  selected?: boolean;
  showLabelText?: boolean;
  state?: string;
  onClick?: () => void;
};

const NavItem: FunctionComponent<NavItemType> = ({
  className = "",
  badge = "None",
  elevation = "Default",
  selected = false,
  showLabelText = false,
  state = "Enabled",
  size,
  onClick,
}) => {

  return (
    <div
      className={[styles.optionnavigation, className].join(" ")}
      data-badge={badge}
      data-elevation={elevation}
      data-selected={selected}
      data-showLabelText={showLabelText}
      data-state={state}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className={styles.container}>
        <div className={styles.stateLayer}>
          <img className={styles.icon} alt="" src="/Icon2.svg" />
          <Badges size={size} />
        </div>
      </div>
    </div>
  );
};

export default NavItem;
