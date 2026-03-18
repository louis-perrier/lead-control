import {
  heroBullets,
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
            <span className={styles.ctaHint}>Sans carte · Call de 15 minutes · Setup en 24h</span>
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
            <p className={styles.appPreviewTitle}>LeadControl — DM en cours</p>
            <span className={styles.appPreviewBadge}>● Agent actif</span>
          </div>

          <div className={styles.mockConversation}>
            <div className={`${styles.mockMsg} ${styles.mockMsgIn}`}>
              Bonjour, j'ai vu votre post sur l'acquisition. C'est quoi exactement votre offre ?
            </div>
            <div className={`${styles.mockMsg} ${styles.mockMsgOut}`}>
              Salut ! Je travaille avec des independants B2B qui veulent structurer leur vente sans recruter. Vous etes en train de scaler ou plutot d'optimiser un flux existant ?
            </div>
            <div className={`${styles.mockMsg} ${styles.mockMsgIn}`}>
              Les deux un peu. J'ai 5-6 leads par semaine mais je perds du temps a qualifier.
            </div>
            <div className={`${styles.mockMsg} ${styles.mockMsgOut}`}>
              C'est exactement ce qu'on traite. Je vous envoie un lien pour un call de 15 min — vous choisissez le creneau qui vous convient.
            </div>
            <div className={styles.mockCta}>
              📅 Reserver un creneau → calendly.com/…
            </div>
          </div>

          <article className={styles.miniProof}>
            <p className={styles.miniProofQuote}>{heroMiniProof.quote}</p>
            <p className={styles.miniProofAuthor}>
              {heroMiniProof.author} — {heroMiniProof.role}
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
};

export default HeroSection;
