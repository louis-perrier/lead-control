import { FunctionComponent, useMemo, type CSSProperties } from "react";
import styles from "./NavItem1.module.css";

export type NavItem1Type = {
  className?: string;
  labelText?: string;
  icon?: string;

  /** Variant props */
  selected?: boolean;
  /** Style props */
  iconBorder?: CSSProperties["border"];
  iconPadding?: CSSProperties["padding"];
  iconBackgroundColor?: CSSProperties["backgroundColor"];

  /** Action props */
  onLogoIconClick?: () => void;
  isCollapsed?: boolean;
  show?: boolean;
};

const NavItem1: FunctionComponent<NavItem1Type> = ({
  className = "",
  selected = false,
  labelText = "Dashboard",
  onLogoIconClick,
  icon,
  iconBorder,
  iconPadding,
  iconBackgroundColor,
  isCollapsed = false,
  show=true,
}) => {
  const iconStyle: CSSProperties = useMemo(() => {
    return {
      border: iconBorder,
      padding: iconPadding,
      backgroundColor: iconBackgroundColor,
    };
  }, [iconBorder, iconPadding, iconBackgroundColor]);

  return (
    <>{show && (
      <div
        className={[styles.root, className].join(" ")}
        data-selected={selected}
        data-collapsed={isCollapsed}
        data-state="Enabled"
        data-showIcon="true"
        onClick={onLogoIconClick}
      >
        <div className={styles.stateLayer}>
          <img className={styles.icon} alt="" src={icon} style={iconStyle} />
          <div className={styles.label}>{labelText}</div>
        </div>
      </div>
  )}</>
);
};

export default NavItem1;
