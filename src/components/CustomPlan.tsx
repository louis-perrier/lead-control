import { FunctionComponent } from "react";
import styles from "./CustomPlan.module.css";

export type CustomPlanType = {
  className?: string;
};

const CustomPlan: FunctionComponent<CustomPlanType> = ({ className = "" }) => {
  return (
    <footer className={[styles.customplan, className].join(" ")}>
      <div className={styles.customplan2}>
        <div className={styles.stateLayer}>
          <div className={styles.customplantext}>
            <h3 className={styles.description}>Customisation</h3>
            <div className={styles.planLabel}>
              Faites appel à un conseiller pour choisir le modèle qui vous
              convient.
              <br />
              cistom guidé-presque all ia- book call
            </div>
          </div>
          <button className={styles.customplanbutton}>
            <div className={styles.content}>
              <div className={styles.stateLayer2}>
                <div className={styles.label}>Réserver Maintenant</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </footer>
  );
};

export default CustomPlan;
