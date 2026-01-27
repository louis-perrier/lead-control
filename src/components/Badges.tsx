import { FunctionComponent } from "react";
import styles from "./Badges.module.css";

export type BadgesType = {
  className?: string;

  /** Variant props */
  size?: string;
};

const Badges: FunctionComponent<BadgesType> = ({
  className = "",
  size = "Large",
}) => {
  return (
    <div className={[styles.badges, className].join(" ")} data-size={size}>
      <div className={styles.spacer} />
    </div>
  );
};

export default Badges;
