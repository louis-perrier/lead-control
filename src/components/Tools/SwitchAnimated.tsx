import { FC } from "react";
import styles from "./SwitchAnimated.module.css";
import configStyles from "./TextAreaTags.module.css";

type SwitchAnimatedProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  showLabel?: boolean;
  disabled?: boolean;
  className?: string;
};

const SwitchAnimated: FC<SwitchAnimatedProps> = ({
  checked,
  onChange,
  label,
  showLabel = true,
  disabled = false,
  className = "",
}) => {
  return (
    <div className={[styles.switchRoot, className].filter(Boolean).join(" ")}>
      {label && showLabel && (
        <span className={`${styles.switchLabel} ${configStyles.label}`}>
          {label}
        </span>
      )}
      <button
        type="button"
        aria-pressed={checked}
        className={[
          styles.switchButton,
          checked ? styles.switchButtonOn : "",
          disabled ? styles.switchButtonDisabled : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (disabled) return;
          onChange(!checked);
        }}
        disabled={disabled}
      >
        <span className={styles.switchHandle} />
        <div className={styles.switchIcons}>
          <img
            className={`${styles.switchIcon} ${styles.switchIconOff}`}
            src="/switchOff.svg"
            alt=""
          />
          <img
            className={`${styles.switchIcon} ${styles.switchIconOn}`}
            src="/switchOn.svg"
            alt=""
          />
        </div>
      </button>
    </div>
  );
};

export default SwitchAnimated;
