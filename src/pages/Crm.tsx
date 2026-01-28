import { FunctionComponent } from "react";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import MoreOptionSearch from "../components/MoreOptionSearch";
import Table from "../components/Table";
import styles from "./Crm.module.css";

const Crm: FunctionComponent = () => {
  return (
    <div className={styles.crm}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="crm"
      />
      <main className={styles.rightcomponent}>
        <Header logoMarque="/logoMarque@2x.png" />
        <MoreOptionSearch />
        <section className={styles.tableWrapper}>
          <Table />
        </section>
      </main>
    </div>
  );
};

export default Crm;
