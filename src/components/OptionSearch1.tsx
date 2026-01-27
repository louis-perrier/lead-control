import { FunctionComponent } from "react";
import OptionSearch from "./OptionSearch";
import styles from "./OptionSearch1.module.css";

export type OptionSearch1Type = {
  className?: string;
};

const OptionSearch1: FunctionComponent<OptionSearch1Type> = ({
  className = "",
}) => {
  return (
    <section className={[styles.optionsearch, className].join(" ")}>
      <OptionSearch />
    </section>
  );
};

export default OptionSearch1;
