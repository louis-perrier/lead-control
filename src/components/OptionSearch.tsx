import { FunctionComponent } from "react";
import styles from "./OptionSearch.module.css";

export type OptionSearchType = {
  className?: string;
  searchbar?: boolean;
  sortButton?: boolean;
  detailsButton?: boolean;
  addButton?: boolean;
};

const OptionSearch: FunctionComponent<OptionSearchType> = ({
  className = "",
  searchbar = true,
  sortButton = true,
  detailsButton = true,
  addButton = true
}) => {
  return (
    <div className={[styles.optionsearch, className].join(" ")}>
      {searchbar && (
        <div className={styles.searchbar}>
        <input
          className={styles.searchtext}
          placeholder="Rechercher"
          type="text"
        />
        <img className={styles.searchlogoIcon} alt="" src="/searchLogo.svg" />
        </div>
      )}
      {sortButton && (
        <button className={styles.optionActions}>
          <img className={styles.sortbuttonIcon} alt="" src="/sortButton.svg" />
        </button>
      )}
      {detailsButton && (
      <button className={styles.optionActions}>
        <img
          className={styles.searchlogoIcon}
          alt=""
          src="/detailsButton.svg"
        />
      </button>
      )}
      {addButton && (
      <button
        className={styles.optionActions}
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("openAddAgentOverlay"))
        }
      >
        <img className={styles.searchlogoIcon} alt="" src="/addButton.svg" />
      </button>
      )}
    </div>
  );
};

export default OptionSearch;
