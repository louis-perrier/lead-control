import { Link } from "react-router-dom";
import styles from "../../../styles/landing/FooterLanding.module.css";

const FooterLanding = () => {
  return (
    <footer className={styles.footer} data-reveal>
      <div className={styles.topCard}>
        <div className={styles.top}>
        <p>LeadControl - DM automation responsable, supervision humaine et approche orientee qualite.</p>
        <div className={styles.links}>
          <Link to="/policy/privacy-policy">Politique de confidentialite</Link>
          <Link to="/policy/terms-et-conditions">Conditions generales</Link>
          <Link to="/policy/data-deletion">Suppression de donnees</Link>
        </div>
        </div>
      </div>
      <div className={styles.bottomBar}>
        <p className={styles.bottom}>
          Contact: louis@lautopreneur.com - Copyright {new Date().getFullYear()} LeadControl.
        </p>
        <div className={styles.bottomBadges}>
          <span className={styles.bottomBadge}>Instagram actif</span>
          <span className={styles.bottomBadge}>Calendly connecte</span>
          <span className={styles.bottomBadge}>WhatsApp prochainement</span>
        </div>
      </div>
    </footer>
  );
};

export default FooterLanding;
