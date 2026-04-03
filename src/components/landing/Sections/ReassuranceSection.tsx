import { channels, reassurancePoints } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const ReassuranceSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Pourquoi LeadControl</p>
        <h2>Sécurité, contrôle et visibilité.</h2>
        <p>RGPD, HTTPS, supervision humaine et multi inbox dès aujourd'hui.</p>
      </div>
      <div className={styles.reassuranceGrid}>
        {reassurancePoints.map((point) => (
          <article key={point.title} className={styles.reassuranceCard}>
            <h3>{point.title}</h3>
            <p>{point.description}</p>
          </article>
        ))}
      </div>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Canaux couverts</p>
        <p>
          Disponible maintenant sur <strong>{channels.active.join(" + ")}</strong>,
          <em> {channels.upcoming.join(", ")}</em>.
        </p>
      </div>
    </section>
  );
};

export default ReassuranceSection;
