import { steps } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const HowItWorksSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Comment ça marche</p>
        <h2>En 3 étapes, tu qualifies et tu bookes.</h2>
        <p>
          LeadControl s’intègre à ton Instagram, tu choisis le lien d’arrêt et l’agent gère les DM
          jusqu’à l’envoi du lien Calendly.
        </p>
      </div>
      <div className={styles.cardGrid}>
        {steps.map((step, index) => (
          <article key={step.title} className={styles.card}>
            <p className={styles.cardNumber}>{`0${index + 1}`}</p>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default HowItWorksSection;
