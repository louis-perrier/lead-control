import { FunctionComponent, useMemo, type CSSProperties } from "react";
import styles from "./NavItem1.module.css";

export type NavItem1Type = {
  className?: string;
  badgeLabelText?: string;
  labelText?: string;
  showBadgeLabel?: boolean;
  icon1?: string;

  /** Variant props */
  selected?: boolean;
  showIcon?: boolean;
  state?: string;

  /** Style props */
  iconBorder?: CSSProperties["border"];
  iconPadding?: CSSProperties["padding"];
  iconBackgroundColor?: CSSProperties["backgroundColor"];

  /** Action props */
  onLogoIconClick?: () => void;
  isCollapsed?: boolean;
};

const NavItem1: FunctionComponent<NavItem1Type> = ({
  className = "",
  selected = false,
  showIcon = true,
  state = "Enabled",
  badgeLabelText,
  labelText = "Dashboard",
  showBadgeLabel = true,
  onLogoIconClick,
  icon1,
  iconBorder,
  iconPadding,
  iconBackgroundColor,
  isCollapsed = false,
}) => {
  const iconStyle: CSSProperties = useMemo(() => {
    return {
      border: iconBorder,
      padding: iconPadding,
      backgroundColor: iconBackgroundColor,
    };
  }, [iconBorder, iconPadding, iconBackgroundColor]);

  return (
    <div
      className={[styles.root, className].join(" ")}
      data-selected={selected}
      data-showIcon={showIcon}
      data-state={state}
      data-collapsed={isCollapsed}
      onClick={onLogoIconClick}
    >
      <div className={styles.stateLayer}>
        <img className={styles.icon} alt="" src={icon1} style={iconStyle} />
        <div className={styles.label}>{labelText}</div>
        {!!showBadgeLabel && (
          <div className={styles.badgeLabelText}>{badgeLabelText}</div>
        )}
      </div>
    </div>
  );
};

export default NavItem1;
