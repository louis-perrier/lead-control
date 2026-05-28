import { FunctionComponent } from "react";
import styles from "./PageLoadingFallback.module.css";

const PageLoadingFallback: FunctionComponent = () => {
  return (
    <div className={styles.wrap} aria-live="polite" aria-busy="true">
      <div className={styles.spinner} aria-hidden="true" />
      <span className={styles.srOnly}>Chargement…</span>
    </div>
  );
};

export default PageLoadingFallback;
