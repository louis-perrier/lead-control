import { Link } from "react-router-dom";
import styles from "../../../styles/landing/FooterLanding.module.css";

const FooterLanding = () => {
  return (
    <footer className={styles.footer} data-reveal>
      <div className={styles.top}>
        <p>RGPD, HTTPS, contrôle humain continu et conformité Meta.</p>
        <div className={styles.links}>
          <Link to="/policy/privacy-policy">Politique de confidentialité</Link>
          <Link to="/policy/terms-et-conditions">Conditions générales</Link>
          <Link to="/policy/data-deletion">Suppression de données</Link>
        </div>
      </div>
      <p className={styles.bottom}>Contact : louis@lautopreneur.com · © {new Date().getFullYear()} LeadControl.</p>
    </footer>
  );
};

export default FooterLanding;
