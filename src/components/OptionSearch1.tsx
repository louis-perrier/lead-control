import { FunctionComponent } from "react";
import OptionSearch from "./OptionSearch";
import styles from "./OptionSearch1.module.css";

export type OptionSearch1Type = {
  className?: string;
  searchbar?: boolean;
  sortButton?: boolean;
  detailsButton?: boolean;
  addButton?: boolean;
};

const OptionSearch1: FunctionComponent<OptionSearch1Type> = ({
  className = "",
  searchbar = true,
  sortButton = true,
  detailsButton = true,
  addButton = true
}) => {
  return (
    <section className={[styles.optionsearch, className].join(" ")}>
      <OptionSearch searchbar={searchbar} sortButton={sortButton} detailsButton={detailsButton} addButton={addButton} />
    </section>
  );
};

export default OptionSearch1;
