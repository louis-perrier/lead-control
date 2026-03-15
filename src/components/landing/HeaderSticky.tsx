import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../../styles/landing/HeaderSticky.module.css";

type HeaderStickyProps = {
  onPrimaryCta: () => void;
  primaryCtaLabel: string;
};

const HeaderSticky = ({ onPrimaryCta, primaryCtaLabel }: HeaderStickyProps) => {
  const [isSolid, setIsSolid] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsSolid(window.scrollY > 24);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`${styles.header} ${isSolid ? styles.solid : ""}`}>
      <div className={styles.logo}>
        <img src="/logo@2x.png" alt="Logo LeadControl" loading="lazy" />
        <span>LEADCONTROL</span>
      </div>
      <div className={styles.ctas}>
        <Link to="/login" className={styles.secondary}>
          Se connecter
        </Link>
        <button type="button" className={styles.primary} onClick={onPrimaryCta}>
          {primaryCtaLabel}
        </button>
      </div>
    </header>
  );
};

export default HeaderSticky;
