import { FunctionComponent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ModernSidebar } from "../components/ModernSidebar";
import useHasFailedConnector from "../hooks/useHasFailedConnector";
import styles from "./AppLayout.module.css";

export type AppLayoutProps = {
  children: ReactNode;
  className?: string;
  mainClassName?: string;
};

const AppLayout: FunctionComponent<AppLayoutProps> = ({
  children,
  className = "",
  mainClassName = "",
}) => {
  const navigate = useNavigate();
  const { data: failedCount } = useHasFailedConnector();
  const hasFailedConnector = (failedCount ?? 0) > 0;

  return (
    <div className={[styles.appLayout, className].filter(Boolean).join(" ")}>
      <ModernSidebar />
      <main className={[styles.appMain, mainClassName].filter(Boolean).join(" ")}>
        {hasFailedConnector && (
          <div className={styles.reconnectBanner}>
            <span className={styles.reconnectBannerText}>
              Certains de vos comptes sont déconnectés
            </span>
            <button
              type="button"
              className={styles.reconnectBannerCta}
              onClick={() => navigate("/app/connexion")}
            >
              Voir les connexions
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
