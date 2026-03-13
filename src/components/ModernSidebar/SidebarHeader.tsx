import { FunctionComponent } from "react";
import styles from "./SidebarHeader.module.css";

export type SidebarHeaderProps = {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

const SidebarHeader: FunctionComponent<SidebarHeaderProps> = ({
  isCollapsed,
  onToggleCollapse,
}) => {
  return (
    <div className={styles.sidebarHeader} data-collapsed={String(isCollapsed)}>
      <button
        type="button"
        className={styles.collapseButton}
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? "Ouvrir la navigation" : "Fermer la navigation"}
      >
        <span className={styles.hamburgerIcon}>
          <span className={styles.hamburgerBar} />
          <span className={styles.hamburgerBar} />
          <span className={styles.hamburgerBar} />
        </span>
      </button>
      
      <div className={styles.logoContainer}>
        <img
          className={styles.logoIcon}
          alt="LeadControl"
          src="/logo@2x.png"
        />
        <span className={styles.logoText}>LeadControl</span>
      </div>
    </div>
  );
};

export default SidebarHeader;