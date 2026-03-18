import { heroCopy, pricingData } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

type PricingSectionProps = {
  onPrimaryCta: () => void;
  primaryCtaLabel: string;
};

const PricingSection = ({ onPrimaryCta, primaryCtaLabel }: PricingSectionProps) => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>{pricingData.kicker}</p>
        <h2>{pricingData.title}</h2>
        <p>{pricingData.subtitle}</p>
      </div>
      <div className={styles.pricingWrap}>
        <article className={styles.pricingCard}>
          <h3>{heroCopy.trial}</h3>
          <p className={styles.priceTag}>{heroCopy.pricing}</p>

          {pricingData.whyPrice && (
            <div className={styles.pricingWhy}>
              <p className={styles.pricingWhyTitle}>Pourquoi 100 EUR / mois ?</p>
              {pricingData.whyPrice.map((row) => (
                <div key={row.label} className={styles.pricingWhyRow}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          )}

          <ul className={styles.pricingList}>
            {pricingData.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button type="button" onClick={onPrimaryCta} className={styles.ctaButton}>
            {primaryCtaLabel}
          </button>
          <p className={styles.pricingNote}>{heroCopy.scarcityNote}</p>
        </article>

        <aside className={styles.pricingSide}>
          <p className={styles.pricingSideTitle}>Ce que vous obtenez des la mise en route</p>
          {pricingData.highlights.map((item) => (
            <article key={item.label} className={styles.pricingHighlight}>
              <p>{item.label}</p>
              <span>{item.value}</span>
            </article>
          ))}
          {pricingData.reassurance.map((item) => (
            <span key={item} className={styles.pricingBadge}>
              {item}
            </span>
          ))}
        </aside>
      </div>
    </section>
  );
};

export default PricingSection;
