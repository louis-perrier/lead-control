import { heroBullets, heroCopy } from "../../../config/landing";
import styles from "../../../styles/landing/HeroSection.module.css";

type HeroSectionProps = {
  onPrimaryCta: () => void;
  primaryCtaLabel: string;
  spotsRemaining: number;
};

const HeroSection = ({ onPrimaryCta, primaryCtaLabel, spotsRemaining }: HeroSectionProps) => {
  return (
    <section className={styles.hero} data-reveal>
      <div className={styles.heroContent}>
        <p className={styles.heroTag}>Agent setter DM Instagram</p>
        <div className={styles.heroRelease}>
          <span className={styles.heroReleaseLabel}>Sortie officielle • 02 mars 2026</span>
          <p className={styles.heroReleaseCopy}>
            LeadControl débarque pour transformer chacune de vos conversations en opportunités.
          </p>
        </div>
        <h1>{heroCopy.title}</h1>
        <p className={styles.heroSubtitle}>{heroCopy.subtitle}</p>
        <div className={styles.bulletGrid}>
          {heroBullets.map((bullet) => (
            <div key={bullet} className={styles.bullet}>
              <span className={styles.bulletDot} />
              <p>{bullet}</p>
            </div>
          ))}
        </div>
        <div className={styles.metaRow}>
          <span className={styles.trial}>{heroCopy.trial}</span>
          <span className={styles.pricing}>{heroCopy.pricing}</span>
        </div>
        <div className={styles.badgeRow}>
          <div className={styles.scarcityBadge}>
            Tarif lancement — places restantes : {spotsRemaining}
          </div>
          <p className={styles.scarcityNote}>{heroCopy.scarcityNote}</p>
        </div>
        <div className={styles.ctaRow}>
          <button type="button" className={styles.heroCta} onClick={onPrimaryCta}>
            {primaryCtaLabel}
          </button>
          <span className={styles.ctaHint}>Aucun CB, call en 15 minutes.</span>
        </div>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.heroFrame}>
          <img
            src="/landing/hero-mock.png"
            alt="Mockup de la boîte de réception traitée par l’agent LeadControl"
            loading="lazy"
          />
          <div className={styles.visualGlow} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
