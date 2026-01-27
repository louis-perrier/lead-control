import { FunctionComponent } from "react";
import GenericAvatar2 from "./GenericAvatar2";
import styles from "./Header.module.css";

export type HeaderType = {
  className?: string;
  logoMarque?: string;
};

const Header: FunctionComponent<HeaderType> = ({
  className = "",
  logoMarque,
}) => {
  return (
    <div className={[styles.header, className].join(" ")}>
      <img
        className={styles.logomarqueIcon}
        loading="lazy"
        alt=""
        src={logoMarque}
      />
      <GenericAvatar2 />
    </div>
  );
};

export default Header;
