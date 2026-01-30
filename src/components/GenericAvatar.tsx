import { FunctionComponent } from "react";
import styles from "./GenericAvatar.module.css";

export type GenericAvatarVariant = "default" | "wrapper" | "header";

export type GenericAvatarType = {
  className?: string;
  style?: string;
  variant?: GenericAvatarVariant;
};

const GenericAvatar: FunctionComponent<GenericAvatarType> = ({
  className = "",
  style = "Avatar",
  variant = "default",
}) => {
  const variantClass =
    variant === "header"
      ? styles.header
      : variant === "wrapper"
      ? styles.wrapper
      : "";

  return (
    <button
      className={[styles.genericAvatar, variantClass, className].filter(Boolean).join(" ")}
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
