import { founderCopy } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const FounderSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.founderLayout}>
        <header className={styles.founderAside}>
          <p className={styles.sectionKicker}>{founderCopy.kicker}</p>
          <h2 className={styles.founderTitle}>{founderCopy.title}</h2>
        </header>
        <div className={styles.founderContent}>
          <div className={styles.founderBody}>
            {founderCopy.paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <p className={styles.founderSignature}>{founderCopy.signature}</p>
        </div>
      </div>
    </section>
  );
};

export default FounderSection;
