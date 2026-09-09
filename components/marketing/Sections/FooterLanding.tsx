import Link from "next/link";
import styles from "./FooterLanding.module.css";

const FooterLanding = () => {
  return (
    <footer className={styles.footer} data-reveal>
      <div className={styles.topCard}>
        <div className={styles.top}>
          <p>LeadControl - DM automation responsable, supervision humaine et approche orientée qualité.</p>
          <div className={styles.links}>
            <Link href="/policy/privacy-policy">Politique de confidentialité</Link>
            <Link href="/policy/terms-et-conditions">Conditions générales</Link>
            <Link href="/policy/data-deletion">Suppression de données</Link>
          </div>
        </div>
      </div>
      <div className={styles.bottomBar}>
        <p className={styles.bottom}>
          Contact: louis@lautopreneur.com - Copyright {new Date().getFullYear()} LeadControl.
        </p>
        <div className={styles.bottomBadges}>
          <span className={styles.bottomBadge}>Instagram disponible</span>
          <span className={styles.bottomBadge}>Calendly disponible</span>
          <span className={styles.bottomBadge}>WhatsApp disponible</span>
        </div>
      </div>
    </footer>
  );
};

export default FooterLanding;
