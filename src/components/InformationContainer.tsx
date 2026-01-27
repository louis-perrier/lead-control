import { FunctionComponent } from "react";
import styles from "./InformationContainer.module.css";

export type InformationContainerType = {
  className?: string;
};

const InformationContainer: FunctionComponent<InformationContainerType> = ({
  className = "",
}) => {
  return (
    <section className={[styles.informationcontainer, className].join(" ")}>
      <div className={styles.informationcontainer2}>
        <div className={styles.priceSelection}>
          <div className={styles.chooseseasoncontainer}>
            <button className={styles.mounthlyprice}>
              <div className={styles.stateLayer}>
                <div className={styles.labelText}>Mensuel</div>
              </div>
            </button>
            <button className={styles.annualprice}>
              <div className={styles.stateLayer2}>
                <input className={styles.frameInput} type="checkbox" />
                <div className={styles.priceLabel}>Annuel</div>
              </div>
            </button>
            <div className={styles.reductioncontainer}>
              <img
                className={styles.reductionbuttonIcon}
                alt=""
                src="/reductionButton@2x.png"
              />
            </div>
          </div>
        </div>
        <div className={styles.description}>
          Économisez .... en payant annuellement.
        </div>
      </div>
    </section>
  );
};

export default InformationContainer;
