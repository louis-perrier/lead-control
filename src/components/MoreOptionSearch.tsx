import { FunctionComponent } from "react";
import OptionSearch from "./OptionSearch";
import styles from "./MoreOptionSearch.module.css";

export type MoreOptionSearchType = {
  className?: string;
};

const MoreOptionSearch: FunctionComponent<MoreOptionSearchType> = ({
  className = "",
}) => {
  return (
    <section className={[styles.moreoptionsearch, className].join(" ")}>
      <div className={styles.chooseview}>
        <div className={styles.textchooseview}>Liste</div>
        <img
          className={styles.arrowdropdownlogoIcon}
          alt=""
          src="/arrow-drop-down.svg"
        />
      </div>
      <OptionSearch />
    </section>
  );
};

export default MoreOptionSearch;
