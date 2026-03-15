import { partnerBadges, quickProofStats } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const ProofSection = () => {
  const marqueeBadges = [...partnerBadges, ...partnerBadges];

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Preuve rapide</p>
        <h2>Compatible avec vos canaux prioritaires, pense pour convertir vite.</h2>
        <p>
          Une mise en place simple, une execution continue et une vision claire des conversations
          qui avancent vers un rendez-vous.
        </p>
      </div>

      <div className={styles.proofStrip}>
        <div className={styles.badgeMarquee}>
          <div className={styles.badgeTrack}>
            {marqueeBadges.map((badge, index) => (
              <article
                key={`${badge.label}-${index}`}
                className={styles.partnerBadge}
                aria-hidden={index >= partnerBadges.length}
              >
                <img src={badge.icon} alt={`${badge.label} logo`} loading="lazy" />
                <div>
                  <p className={styles.partnerLabel}>{badge.label}</p>
                  <span className={styles.partnerStatus}>{badge.status}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className={styles.quickStatsGrid}>
          {quickProofStats.map((stat) => (
            <article key={stat.label} className={styles.quickStatCard}>
              <p className={styles.quickStatValue}>{stat.value}</p>
              <p className={styles.quickStatLabel}>{stat.label}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProofSection;
