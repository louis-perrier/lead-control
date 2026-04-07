import styles from "../../styles/landing/PromoBanner.module.css";

const SEGMENT = '✦  Offre Pâques  ·  -30% avec le code "LEADCONTROL30"  ·  Jusqu\'au 20/04  ';

const PromoBanner = () => (
  <div className={styles.banner}>
    <div className={styles.track}>
      <span>{SEGMENT.repeat(6)}</span>
      <span aria-hidden="true">{SEGMENT.repeat(6)}</span>
    </div>
  </div>
);

export default PromoBanner;
