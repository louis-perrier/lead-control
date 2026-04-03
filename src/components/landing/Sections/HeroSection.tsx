import {
  heroBullets,
  heroCopy,
  heroMiniProof,
  heroTrustItems,
} from "../../../config/landing";
import styles from "../../../styles/landing/HeroSection.module.css";
import { useCalendly } from "../../../hooks/useCalendly";

type HeroSectionProps = {
  primaryCtaLabel: string;
  spotsRemaining: number;
};

const HeroSection = ({ primaryCtaLabel, spotsRemaining }: HeroSectionProps) => {
  const { openCalendly } = useCalendly();
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
            <button type="button" className={styles.heroCta} onClick={openCalendly}>
              {primaryCtaLabel}
            </button>
            <span className={styles.ctaHint}>Diagnostic 15 min - Setup 24h - Sans engagement</span>
          </div>

          <ul className={styles.bulletList}>
            {heroBullets.map((item) => (
              <li key={item} className={styles.bulletItem}>
                <span className={styles.bulletDot} aria-hidden="true" />
                <p>{item}</p>
              </li>
            ))}
          </ul>

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
            <div className={styles.appPreviewHeading}>
              <p className={styles.appPreviewTitle}>Visite guidée LeadControl en 60 secondes</p>
              <p className={styles.appPreviewCaption}>
                Inbox réelle, qualification IA et prise de rendez-vous automatique.
              </p>
            </div>
          </div>

          <div className={styles.demoMetaRow}>
            <span className={styles.demoMetaChip}>Cas réel</span>
            <span className={styles.demoMetaChip}>Version produit actuelle</span>
          </div>

          <div className={styles.demoStage}>
            <span className={styles.demoGlow} aria-hidden="true" />
            <figure className={styles.demoPhoneFrame}>
              <video
                className={styles.demoVideo}
                autoPlay
                loop
                controls
                preload="metadata"
                playsInline
                src="/landing/demo-v1.mov"
              >
                <source src="/landing/demo-v1.mov" type="video/quicktime" />
                Votre navigateur ne supporte pas la lecture vidéo intégrée.
              </video>
            </figure>
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
