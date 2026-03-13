import { FunctionComponent, ReactNode } from "react";
import { ModernSidebar } from "../components/ModernSidebar";
import styles from "./AppLayout.module.css";

export type AppLayoutProps = {
  children: ReactNode;
  className?: string;
};

const AppLayout: FunctionComponent<AppLayoutProps> = ({
  children,
  className = "",
}) => {
  return (
    <div className={[styles.appLayout, className].filter(Boolean).join(" ")}>
      <ModernSidebar />
      <main className={styles.appMain}>
        {children}
      </main>
    </div>
  );
};

export default AppLayout;