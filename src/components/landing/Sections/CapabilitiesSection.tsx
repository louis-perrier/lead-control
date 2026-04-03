import { capabilityItems } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const CapabilitiesSection = () => {
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
      <div className={`${styles.cardGrid} ${styles.capabilitiesGrid}`}>
        {capabilityItems.map((entry, index) => (
          <article
            key={entry.title}
            className={`${styles.card} ${
              index === capabilityItems.length - 1 ? styles.capabilityCardFeatured : ""
            }`}
          >
            <p className={styles.cardNumber}>{`0${index + 1}`}</p>
            <h3>{entry.title}</h3>
            <p>{entry.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default CapabilitiesSection;
