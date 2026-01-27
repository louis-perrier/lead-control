import { FunctionComponent } from "react";
import styles from "./GenericAvatar.module.css";

export type GenericAvatarType = {
  className?: string;

  /** Variant props */
  style?: string;
};

const GenericAvatar: FunctionComponent<GenericAvatarType> = ({
  className = "",
  style = "Avatar",
}) => {
  return (
    <button
      className={[styles.genericAvatar, className].join(" ")}
      data-style={style}
    >
      <img
        className={styles.avatarPlaceholderIcon}
        alt=""
        src="/Avatar-Placeholder.svg"
      />
    </button>
  );
};

export default GenericAvatar;
