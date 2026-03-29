import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "../../styles/landing/HeaderSticky.module.css";
import { useCalendly } from "../../hooks/useCalendly";

type HeaderStickyProps = {
  primaryCtaLabel: string;
};

const HeaderSticky = ({ primaryCtaLabel }: HeaderStickyProps) => {
  const { openCalendly } = useCalendly();
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
          Se Connecter
        </Link>
        <button type="button" className={styles.primary} onClick={openCalendly}>
          {primaryCtaLabel}
        </button>
      </div>
    </header>
  );
};

export default HeaderSticky;
