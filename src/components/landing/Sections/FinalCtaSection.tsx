import { finalCtaCopy, primaryCtaLabel } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";
import { useCalendly } from "../../../hooks/useCalendly";

type FinalCtaSectionProps = Record<string, never>;

const FinalCtaSection = (_props: FinalCtaSectionProps) => {
  const { openCalendly } = useCalendly();
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.finalCtaBox}>
        <p className={styles.sectionKicker}>Pret a commencer</p>
        <h2>{finalCtaCopy.title}</h2>
        <p>{finalCtaCopy.subtitle}</p>
        <button type="button" onClick={openCalendly} className={styles.ctaButton}>
          {primaryCtaLabel}
        </button>
        <p className={styles.ctaHint}>{finalCtaCopy.reassurance}</p>
        <p className={styles.ctaSecondary}>
          <button
            type="button"
            onClick={openCalendly}
            className={styles.ctaSecondaryLink}
          >
            Fixer un check up de vos DM (15 min) &gt;
          </button>
        </p>
      </div>
    </section>
  );
};

export default FinalCtaSection;
