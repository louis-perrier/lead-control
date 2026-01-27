import { FunctionComponent } from "react";
import styles from "./IconButtonStandard.module.css";

export type IconButtonStandardType = {
  className?: string;

  /** Variant props */
  size?: string;
  state?: string;
  type?: string;
  width?: string;
};

const IconButtonStandard: FunctionComponent<IconButtonStandardType> = ({
  className = "",
  size = "Small",
  state = "Enabled",
  type = "Round",
  width = "Default",
}) => {
  return (
    <button
      className={[styles.trailingIcon, className].join(" ")}
      data-size={size}
      data-state={state}
      data-type={type}
      data-width={width}
    >
      <div className={styles.content}>
        <div className={styles.stateLayer}>
          <img className={styles.rippleIcon} alt="" src="/Ripple.svg" />
          <img className={styles.icon} alt="" src="/Icon4.svg" />
        </div>
      </div>
    </button>
  );
};

export default IconButtonStandard;
