import { reassurancePoints, testimonials } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const TestimonialsSection = () => {
  const featured = testimonials.slice(0, 4);

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Retours terrain</p>
        <h2>Ce qu'en disent ceux qui l'utilisent au quotidien.</h2>
        <p>
          Retours de fondateurs, coaches et closers qui ont integre LeadControl dans leur process
          commercial.
        </p>
      </div>

      <div className={styles.testimonialGrid}>
        {featured.map((item) => (
          <article key={item.name} className={`${styles.testimonialCard} ${styles.testimonialCardStatic}`}>
            <div className={styles.testimonialHead}>
              <div className={styles.testimonialAvatar} aria-hidden="true">
                {item.initials}
              </div>
              <div>
                <p className={styles.testimonialName}>{item.name}</p>
                <p className={styles.testimonialRole}>
                  {item.role} - {item.activity}
                </p>
              </div>
            </div>
            <p className={styles.testimonialQuote}>{item.quote}</p>
          </article>
        ))}
      </div>

      <div className={styles.trustBar}>
        {reassurancePoints.map((point) => (
          <div key={point.title} className={styles.trustPoint}>
            <span className={styles.trustCheck} aria-hidden="true">✓</span>
            <div>
              <p className={styles.trustPointTitle}>{point.title}</p>
              <p className={styles.trustPointDesc}>{point.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TestimonialsSection;
