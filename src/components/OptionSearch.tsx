import { FunctionComponent } from "react";
import styles from "./OptionSearch.module.css";

export type OptionSearchType = {
  className?: string;
};

const OptionSearch: FunctionComponent<OptionSearchType> = ({
  className = "",
}) => {
  return (
    <div className={[styles.optionsearch, className].join(" ")}>
      <div className={styles.searchbar}>
        <input
          className={styles.searchtext}
          placeholder="Rechercher"
          type="text"
        />
        <img className={styles.searchlogoIcon} alt="" src="/searchLogo.svg" />
      </div>
      <button className={styles.optionActions}>
        <img className={styles.sortbuttonIcon} alt="" src="/sortButton.svg" />
      </button>
      <button className={styles.optionActions}>
        <img
          className={styles.searchlogoIcon}
          alt=""
          src="/detailsButton.svg"
        />
      </button>
      <button
        className={styles.optionActions}
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("openAddAgentOverlay"))
        }
      >
        <img className={styles.searchlogoIcon} alt="" src="/addButton.svg" />
      </button>
    </div>
  );
};

export default OptionSearch;
