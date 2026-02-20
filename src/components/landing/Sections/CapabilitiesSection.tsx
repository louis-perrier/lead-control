import { capabilityItems } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const CapabilitiesSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Ce que fait vraiment l’agent</p>
        <h2>Qualification, réponses, point d’arrêt paramétrable.</h2>
        <p>Tu restes maître du flow : tu peux stopper, superviser ou relancer à tout moment.</p>
      </div>
      <div className={styles.cardGrid}>
        {capabilityItems.map((entry) => (
          <article key={entry.title} className={styles.card}>
            <h3>{entry.title}</h3>
            <p>{entry.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default CapabilitiesSection;
