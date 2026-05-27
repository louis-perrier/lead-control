import { reassurancePoints, testimonials } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const TestimonialsSection = () => {
  const [hero, ...rest] = testimonials.slice(0, 4);
  const supporting = rest.slice(0, 3);

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Retours terrain</p>
        <h2>Ce qu'en disent ceux qui l'utilisent au quotidien.</h2>
        <p>
          Retours de fondateurs, coaches et closers qui ont intégré LeadControl dans leur process
          commercial.
        </p>
      </div>

      <div className={styles.testimonialPullquote}>
        <p className={styles.testimonialPullquoteText}>{hero.quote}</p>
        <p className={styles.testimonialPullquoteMeta}>
          <span className={styles.testimonialPullquoteAuthor}>{hero.name}</span>
          {" — "}
          <span>{hero.role}, {hero.activity}</span>
        </p>
      </div>

      <div className={styles.testimonialSupportGrid}>
        {supporting.map((item) => (
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
