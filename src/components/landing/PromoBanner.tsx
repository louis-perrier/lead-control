import styles from "../../styles/landing/PromoBanner.module.css";

const SEGMENT = '✦  -40% avec le code "LANCEMENT40"  ·  Lancement officiel  ·  Jusqu\'au 02/04  ';

const PromoBanner = () => (
  <div className={styles.banner}>
    <div className={styles.track}>
      <span>{SEGMENT.repeat(6)}</span>
      <span aria-hidden="true">{SEGMENT.repeat(6)}</span>
    </div>
  </div>
);

export default PromoBanner;
