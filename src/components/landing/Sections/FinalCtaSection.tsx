import { ctaOptions, finalCtaCopy, primaryCtaLabel } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

type FinalCtaSectionProps = {
  onPrimaryCta: () => void;
};

const FinalCtaSection = ({ onPrimaryCta }: FinalCtaSectionProps) => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.finalCtaBox}>
        <p className={styles.sectionKicker}>Derniere etape</p>
        <h2>{finalCtaCopy.title}</h2>
        <p>{finalCtaCopy.subtitle}</p>
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
        <p className={styles.ctaHint}>{finalCtaCopy.reassurance}</p>
      </div>
    </section>
  );
};

export default FinalCtaSection;
