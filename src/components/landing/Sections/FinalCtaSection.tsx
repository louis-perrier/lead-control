import { BOOKING_URL, finalCtaCopy, primaryCtaLabel } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

type FinalCtaSectionProps = {
  onPrimaryCta: () => void;
};

const FinalCtaSection = ({ onPrimaryCta }: FinalCtaSectionProps) => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.finalCtaBox}>
        <p className={styles.sectionKicker}>Pret a commencer</p>
        <h2>{finalCtaCopy.title}</h2>
        <p>{finalCtaCopy.subtitle}</p>
        <button type="button" onClick={onPrimaryCta} className={styles.ctaButton}>
          {primaryCtaLabel}
        </button>
        <p className={styles.ctaHint}>{finalCtaCopy.reassurance}</p>
        <p className={styles.ctaSecondary}>
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaSecondaryLink}
          >
            Fixer un check-up de vos DM (15 min) →
          </a>
        </p>
      </div>
    </section>
  );
};

export default FinalCtaSection;
