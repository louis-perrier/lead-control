import { capabilityItems } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const CapabilitiesSection = () => {
  const listItems = capabilityItems.slice(0, -1);
  const featured = capabilityItems[capabilityItems.length - 1];

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Fonctionnalités clés</p>
        <h2>Un agent IA complet pour qualifier et convertir en rendez-vous.</h2>
        <p>
          Chaque bloc est pensé pour réduire le travail manuel sans perdre la personnalisation de
          vos échanges.
        </p>
      </div>
      <div className={styles.featuresLayout}>
        <div className={styles.featuresList}>
          {listItems.map((entry, index) => (
            <div key={entry.title} className={styles.featureItem}>
              <span className={styles.featureBadge}>{`0${index + 1}`}</span>
              <div>
                <h3 className={styles.featureTitle}>{entry.title}</h3>
                <p className={styles.featureDesc}>{entry.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.featureFeatured}>
          <span className={styles.featureBadgeFeatured}>{`0${capabilityItems.length}`}</span>
          <div>
            <h3 className={styles.featureTitle}>{featured.title}</h3>
            <p className={styles.featureDesc}>{featured.description}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CapabilitiesSection;
