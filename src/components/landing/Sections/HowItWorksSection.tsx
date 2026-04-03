import { steps } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const HowItWorksSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Comment ça marche</p>
        <h2>Un flux simple en 3 étapes, de la connexion au rendez-vous.</h2>
        <p>
          Vous connectez, vous réglez vos objectifs, puis l'agent gère l'opérationnel pendant que
          vous pilotez les décisions importantes.
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
