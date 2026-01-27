import { FunctionComponent } from "react";
import styles from "./CellComponant.module.css";

export type CellComponantType = {
  className?: string;
  text?: string;
  icon?: boolean;

  /** Variant props */
  stroke?: "left" | "any" | "both";
};

const CellComponant: FunctionComponent<CellComponantType> = ({
  className = "",
  stroke = "left",
  text = "header",
  icon = true,
}) => {
  return (
    <div className={[styles.root, className].join(" ")} data-stroke={stroke}>
      <div className={styles.textheader}>{text}</div>
      {!!icon && (
        <img
          className={styles.closetabbuttonIcon}
          alt=""
          src="/closeTabButton.svg"
        />
      )}
    </div>
  );
};

export default CellComponant;
