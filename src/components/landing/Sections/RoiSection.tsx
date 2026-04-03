import { roiDisclaimer, roiStats } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const RoiSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>ROI et pilotage</p>
        <h2>Des indicateurs utiles pour évaluer l'impact réel des DM automatisés.</h2>
        <p>
          Objectif: vous aider à mesurer ce qui compte, sans promesse exagérée ni chiffre hors
          contexte.
        </p>
      </div>

      <div className={styles.roiGrid}>
        {roiStats.map((stat) => (
          <article key={stat.label} className={styles.roiCard}>
            <p className={styles.roiValue}>{stat.value}</p>
            <p className={styles.roiLabel}>{stat.label}</p>
            <p className={styles.roiNote}>{stat.note}</p>
          </article>
        ))}
      </div>

      <p className={styles.roiDisclaimer}>{roiDisclaimer}</p>
    </section>
  );
};

export default RoiSection;
