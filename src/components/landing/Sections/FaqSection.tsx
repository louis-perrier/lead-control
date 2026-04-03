import { useState } from "react";
import { faqCta, faqItems } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const FaqSection = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleToggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>FAQ conversion</p>
        <h2>Les objections les plus fréquentes, traitées clairement.</h2>
        <p>Réponses concises pour aider la décision sans surpromesse.</p>
      </div>
      <div className={styles.faqGrid}>
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          const contentId = `faq-answer-${index}`;
          return (
            <article
              key={item.question}
              className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
            >
              <button
                type="button"
                className={styles.faqQuestion}
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() => handleToggle(index)}
              >
                <span>{item.question}</span>
                <span
                  className={`${styles.faqIcon} ${isOpen ? styles.faqIconOpen : ""}`}
                  aria-hidden="true"
                >
                  +
                </span>
              </button>
              {isOpen && (
                <p id={contentId} className={styles.faqAnswer}>
                  {item.answer}
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className={styles.faqCta}>{faqCta}</p>
    </section>
  );
};

export default FaqSection;
