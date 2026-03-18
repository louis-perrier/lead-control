import { founderCopy } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

const FounderSection = () => {
  return (
    <section className={styles.section} data-reveal>
      <div className={styles.founderBox}>
        <p className={styles.sectionKicker}>{founderCopy.kicker}</p>
        <h2>{founderCopy.title}</h2>
        <div className={styles.founderBody}>
          {founderCopy.paragraphs.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <p className={styles.founderSignature}>{founderCopy.signature}</p>
      </div>
    </section>
  );
};

export default FounderSection;
