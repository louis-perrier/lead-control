import { testimonials } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const TestimonialsSection = () => {
  const firstLane = testimonials.filter((_, index) => index % 2 === 0);
  const secondLane = testimonials.filter((_, index) => index % 2 !== 0);

  const firstTrack = [...firstLane, ...firstLane];
  const secondTrack = [...secondLane, ...secondLane];

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Temoignages</p>
        <h2>Des retours terrain sur le temps gagne et la qualite des leads.</h2>
        <p>
          Les retours ci-dessous sont structures pour etre remplaces facilement par vos references
          clientes au fur et a mesure.
        </p>
      </div>

      <div className={styles.testimonialsMarquee}>
        <div className={styles.testimonialLane}>
          <div className={styles.testimonialTrack}>
            {firstTrack.map((item, index) => (
              <article
                key={`first-${item.name}-${index}`}
                className={styles.testimonialCard}
                aria-hidden={index >= firstLane.length}
              >
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
        </div>

        <div className={styles.testimonialLane}>
          <div className={`${styles.testimonialTrack} ${styles.testimonialTrackReverse}`}>
            {secondTrack.map((item, index) => (
              <article
                key={`second-${item.name}-${index}`}
                className={styles.testimonialCard}
                aria-hidden={index >= secondLane.length}
              >
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
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
