import React from "react";
import styles from "./ToneSelector.module.css";

export type ToneOption = "normal" | "friendly" | "funny" | "pro" | "direct" | "custom";

export type ToneOptionConfig = {
  value: ToneOption;
  label: string;
  description: string;
};

type ToneSelectorProps = {
  value: ToneOption;
  options: ToneOptionConfig[];
  onChange: (value: ToneOption) => void;
};

const ToneSelector: React.FC<ToneSelectorProps> = ({ value, options, onChange }) => {
  return (
    <div className={styles.toneSelectorGrid}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`${styles.tonePill} ${active ? styles.tonePillActive : ""}`}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
          >
            <span className={styles.tonePillLabel}>{option.label}</span>
            <p className={styles.tonePillDescription}>{option.description}</p>
          </button>
        );
      })}
    </div>
  );
};

export default ToneSelector;
