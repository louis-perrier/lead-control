import { FunctionComponent } from "react";
import styles from "./SidebarNavItem.module.css";

export type SidebarNavItemProps = {
  selected: boolean;
  labelText: string;
  icon: string;
  onClick: () => void;
  isCollapsed: boolean;
  disabled?: boolean;
  badge?: string;
};

const SidebarNavItem: FunctionComponent<SidebarNavItemProps> = ({
  selected,
  labelText,
  icon,
  onClick,
  isCollapsed,
  disabled = false,
  badge,
}) => {
  const handleClick = () => {
    if (!disabled) {
      onClick();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && !disabled) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={styles.navItem}
      data-selected={selected}
      data-collapsed={String(isCollapsed)}
      data-disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={labelText}
    >
      <div className={styles.navItemContent}>
        <div className={styles.iconContainer}>
          <img
            className={styles.navIcon}
            src={icon}
            alt={labelText}
            width={20}
            height={20}
          />
        </div>
        
        {!isCollapsed && (
          <div className={styles.labelContainer}>
            <span className={styles.navLabel}>{labelText}</span>
            {badge && (
              <span className={styles.navBadge}>{badge}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarNavItem;