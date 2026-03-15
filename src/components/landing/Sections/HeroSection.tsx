import {
  heroAppPreview,
  heroCopy,
  heroMiniProof,
  heroTrustItems,
} from "../../../config/landing";
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
        <p className={styles.heroTag}>{heroCopy.eyebrow}</p>
        <h1>{heroCopy.title}</h1>
        <p className={styles.heroSubtitle}>{heroCopy.subtitle}</p>

        <div className={styles.heroActionPanel}>
          <span
            className={`${styles.keyInfoChip} ${styles.keyInfoScarcity} ${styles.keyInfoScarcityStandalone}`}
          >
            Offre lancement: {spotsRemaining} places restantes
          </span>

          <div className={styles.ctaRow}>
            <button type="button" className={styles.heroCta} onClick={onPrimaryCta}>
              {primaryCtaLabel}
            </button>
            <span className={styles.ctaHint}>Aucun CB, call de 15 minutes.</span>
          </div>

          <div className={styles.reassureRow}>
            <span className={styles.keyInfoChip}>{heroCopy.trial}</span>
            {heroTrustItems.slice(0, 2).map((item) => (
              <span key={item} className={styles.trustItem}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.heroVisual}>
        <aside className={styles.appPreviewSlot}>
          <div className={styles.appPreviewTop}>
            <p className={styles.appPreviewTitle}>{heroAppPreview.title}</p>
            <span className={styles.appPreviewBadge}>Zone image</span>
          </div>
          <p className={styles.appPreviewNote}>{heroAppPreview.note}</p>
          <div className={styles.appPreviewFrame}>
            <img src={heroAppPreview.image} alt={heroAppPreview.alt} loading="lazy" />
            <div className={styles.visualGlow} aria-hidden="true" />
          </div>
          <article className={styles.miniProof}>
            <p className={styles.miniProofQuote}>{heroMiniProof.quote}</p>
            <p className={styles.miniProofAuthor}>
              {heroMiniProof.author} - {heroMiniProof.role}
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
};

export default HeroSection;
