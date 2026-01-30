import { FunctionComponent } from "react";
import GenericAvatar from "./GenericAvatar";
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
      <GenericAvatar variant="header" />
    </div>
  );
};

export default Header;
