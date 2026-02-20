import { heroCopy } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

type PricingSectionProps = {
  onPrimaryCta: () => void;
  primaryCtaLabel: string;
};

const PricingSection = ({ onPrimaryCta, primaryCtaLabel }: PricingSectionProps) => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Pricing</p>
        <h2>Essai gratuit 7 jours, ensuite à partir de 100€/mois.</h2>
        <p>
          Le tarif de lancement reste fixe pendant la vague. Il augmente de +20 % dès que la phase se termine.
        </p>
      </div>
      <div className={styles.pricingCard}>
        <h3>{heroCopy.trial}</h3>
        <p className={styles.priceTag}>{heroCopy.pricing}</p>
        <p className={styles.pricingNote}>{heroCopy.scarcityNote}</p>
        <button type="button" onClick={onPrimaryCta} className={styles.ctaButton}>
          {primaryCtaLabel}
        </button>
      </div>
    </section>
  );
};

export default PricingSection;
