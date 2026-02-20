import { faqCta, faqItems } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const FaqSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>FAQ</p>
        <h2>Questions fréquentes, réponses concrètes.</h2>
        <p>On répond franchement sans promesses irréalistes.</p>
      </div>
      <div className={styles.faqGrid}>
        {faqItems.map((item) => (
          <article key={item.question} className={styles.faqItem}>
            <p className={styles.faqQuestion}>{item.question}</p>
            <p className={styles.faqAnswer}>{item.answer}</p>
          </article>
        ))}
      </div>
      <p className={styles.faqCta}>{faqCta}</p>
    </section>
  );
};

export default FaqSection;
