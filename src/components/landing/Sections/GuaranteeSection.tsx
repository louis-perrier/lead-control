import { useState } from "react";
import { guaranteeCopy } from "../../../config/landing";
import styles from "../../../styles/landing/Sections.module.css";

type GuaranteeSectionProps = Record<string, never>;

const GuaranteeSection = (_props: GuaranteeSectionProps) => {
  const [showConditions, setShowConditions] = useState(false);

  const handleToggleConditions = () => {
    setShowConditions((prev) => !prev);
  };

  return (
    <section className={styles.section} data-reveal>
      <div className={styles.guaranteeBox}>
        <h2>{guaranteeCopy.title}</h2>
        <p className={styles.guaranteeSubtitle}>{guaranteeCopy.subtitle}</p>
        <button
          type="button"
          className={styles.guaranteeToggle}
          onClick={handleToggleConditions}
          aria-expanded={showConditions}
          aria-controls="guarantee-conditions"
        >
          {guaranteeCopy.showConditionsLabel}
        </button>

        {showConditions && (
          <div id="guarantee-conditions" className={styles.guaranteeConditions}>
            <ul>
              {guaranteeCopy.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};

export default GuaranteeSection;
