import { FunctionComponent } from "react";
import GenericAvatar1 from "./GenericAvatar1";
import styles from "./GenericAvatar2.module.css";

export type GenericAvatar2Type = {
  className?: string;
};

const GenericAvatar2: FunctionComponent<GenericAvatar2Type> = ({
  className = "",
}) => {
  return (
    <button className={[styles.genericAvatar, className].join(" ")}>
      <GenericAvatar1 style="Avatar" />
    </button>
  );
};

export default GenericAvatar2;
