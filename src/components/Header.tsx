import { FunctionComponent } from "react";
import GenericAvatar from "./GenericAvatar";
import styles from "./Header.module.css";

export type HeaderType = {
  className?: string;
  logoMarque?: string;
  minimal?: boolean;
  showLogo?: boolean;
};

const Header: FunctionComponent<HeaderType> = ({
  className = "",
  logoMarque,
  minimal = false,
  showLogo = false,
}) => {
  return (
    <div className={[styles.header, className].join(" ")} data-minimal={minimal}>
      {showLogo && logoMarque && (
        <img
          className={styles.logomarqueIcon}
          loading="lazy"
          alt=""
          src={logoMarque}
        />
      )}
      {!minimal && <GenericAvatar variant="header" showInitials={minimal} />}
    </div>
  );
};

export default Header;
