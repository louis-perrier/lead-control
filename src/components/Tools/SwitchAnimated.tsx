import { FC } from "react";
import styles from "./SwitchAnimated.module.css";
import configStyles from "./TextAreaTags.module.css";

type SwitchAnimatedProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  showLabel?: boolean;
  showStateLabel?: boolean;
  stateLabelOn?: string;
  stateLabelOff?: string;
  disabledStateLabel?: string;
  disabled?: boolean;
  className?: string;
};

const SwitchAnimated: FC<SwitchAnimatedProps> = ({
  checked,
  onChange,
  label,
  showLabel = true,
  showStateLabel = false,
  stateLabelOn = "Activé",
  stateLabelOff = "Désactivé",
  disabledStateLabel,
  disabled = false,
  className = "",
}) => {
  const resolvedStateLabel = disabled
    ? disabledStateLabel ?? stateLabelOff
    : checked
      ? stateLabelOn
      : stateLabelOff;

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
        aria-label={label ?? resolvedStateLabel}
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
      {showStateLabel ? (
        <span
          className={[
            styles.switchStateLabel,
            checked ? styles.switchStateLabelOn : styles.switchStateLabelOff,
            disabled ? styles.switchStateLabelDisabled : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {resolvedStateLabel}
        </span>
      ) : null}
    </div>
  );
};

export default SwitchAnimated;
