import { proofData } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const ProofSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Preuves</p>
        <h2>Des RDV qualifiés, une trace visible.</h2>
        <p>Conversation traitée, lien Calendly envoyé, résultat confirmé grâce à notre supervision.</p>
      </div>
      <div className={styles.proofGrid}>
        <article className={styles.testimonial}>
          <p className={styles.testimonialQuote}>{proofData.testimonial}</p>
          <p className={styles.testimonialResult}>{proofData.result}</p>
          <p className={styles.testimonialAuthor}>{proofData.author}</p>
        </article>
        <div className={styles.proofScreenshot}>
          <img
            src="/landing/proof-calendly.png"
            alt="Capture d’écran fictive : prospect dirigé vers Calendly"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
};

export default ProofSection;
