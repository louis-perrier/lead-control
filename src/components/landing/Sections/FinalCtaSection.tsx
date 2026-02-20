import { ctaOptions, primaryCtaLabel } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

type FinalCtaSectionProps = {
  onPrimaryCta: () => void;
};

const FinalCtaSection = ({ onPrimaryCta }: FinalCtaSectionProps) => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Prêt à verrouiller des RDV ?</p>
        <h2>Concentre-toi sur les appels, on s’occupe du reste.</h2>
        <p>
          Cinq styles de CTA retenus, un seul remporté : <strong>{primaryCtaLabel}</strong> garde le
          contrôle, même en cas de pics de DM.
        </p>
      </div>
      <div className={styles.ctaChips}>
        {ctaOptions.map((label) => (
          <span key={label} className={styles.ctaChip}>
            {label}
          </span>
        ))}
      </div>
      <button type="button" onClick={onPrimaryCta} className={styles.ctaButton}>
        {primaryCtaLabel}
      </button>
      <p className={styles.ctaHint}>Aucun engagement, 7 jours gratuits, tu peux arrêter à tout moment.</p>
    </section>
  );
};

export default FinalCtaSection;
