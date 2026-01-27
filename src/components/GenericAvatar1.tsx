import { FunctionComponent } from "react";
import GenericAvatar, { GenericAvatarType } from "./GenericAvatar";
import styles from "./GenericAvatar1.module.css";

export type GenericAvatar1Type = {
  className?: string;
  style?: GenericAvatarType["style"];
};

const GenericAvatar1: FunctionComponent<GenericAvatar1Type> = ({
  className = "",
  style,
}) => {
  return (
    <button className={[styles.genericAvatar, className].join(" ")}>
      <GenericAvatar style={style} />
    </button>
  );
};

export default GenericAvatar1;
