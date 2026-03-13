import { FunctionComponent, ReactNode } from "react";
import styles from "./SidebarSection.module.css";

export type SidebarSectionProps = {
  title: string;
  children: ReactNode;
  isCollapsed: boolean;
};

const SidebarSection: FunctionComponent<SidebarSectionProps> = ({
  title,
  children,
  isCollapsed,
}) => {
  return (
    <div className={styles.sidebarSection} data-collapsed={String(isCollapsed)}>
      {!isCollapsed && (
        <h3 className={styles.sectionTitle}>{title}</h3>
      )}
      <div className={styles.sectionItems}>
        {children}
      </div>
    </div>
  );
};

export default SidebarSection;