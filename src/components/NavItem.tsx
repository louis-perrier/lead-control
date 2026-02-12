import { FunctionComponent, useMemo, type CSSProperties } from "react";
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
  variant?: "toggle" | "link";

  /** Nav link props */
  labelText?: string;
  icon?: string;
  iconBorder?: CSSProperties["border"];
  iconPadding?: CSSProperties["padding"];
  iconBackgroundColor?: CSSProperties["backgroundColor"];
  isCollapsed?: boolean;
  show?: boolean;
};

const NavItem: FunctionComponent<NavItemType> = ({
  className = "",
  badge = "None",
  elevation = "Default",
  selected = false,
  showLabelText = false,
  state = "Enabled",
  size = "Large",
  onClick,
  variant = "toggle",
  labelText = "Dashboard",
  icon,
  iconBorder,
  iconPadding,
  iconBackgroundColor,
  isCollapsed = false,
  show = true,
}) => {
  const iconStyle: CSSProperties = useMemo(() => {
    return {
      border: iconBorder,
      padding: iconPadding,
      backgroundColor: iconBackgroundColor,
    };
  }, [iconBorder, iconPadding, iconBackgroundColor]);

  if (!show) {
    return null;
  }

  if (variant === "link") {
    return (
      <div
        className={[styles.linkRoot, className].join(" ")}
        data-selected={selected}
        data-collapsed={isCollapsed}
        data-state={state}
        data-showIcon="true"
        onClick={onClick}
      >
        <div className={styles.linkStateLayer}>
          {icon && (
            <img
              className={styles.linkIcon}
              alt={labelText}
              src={icon}
              style={iconStyle}
              width={24}
              height={24}
            />
          )}
          <div className={styles.linkLabel}>{labelText}</div>
        </div>
      </div>
    );
  }

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
          <img className={styles.icon} alt="" src={icon ?? "/navCollapse.svg"} />
        </div>
      </div>
    </div>
  );
};

export default NavItem;
