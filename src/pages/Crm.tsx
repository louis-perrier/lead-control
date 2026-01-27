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
        dashboardSelected={false}
        subscriptionSelected={false}
        agentIaSelected={false}
        crmSelected
        dashboardShowIcon
        subscriptionShowIcon
        agentIaShowIcon
        crmShowIcon
        dashboardState="Enabled"
        subscriptionState="Enabled"
        agentIaState="Enabled"
        crmState="Enabled"
        dashboardLabelText="Dashboard"
        subscriptionLabelText="Subscription"
        agentIaLabelText="Agent IA"
        crmLabelText="CRM"
        dashboardIcon1="/Icon1.svg"
        subscriptionIcon1="/Icon.svg"
        agentIaIcon1="/Icon3.svg"
        crmIcon1="/Icon5.svg"
        dashboardShowBadgeLabel
        dashboardIconBorder="none"
        subscriptionIconBorder="none"
        agentIaIconBorder="none"
        crmIconBorder="none"
        dashboardIconPadding="0"
        subscriptionIconPadding="0"
        agentIaIconPadding="0"
        crmIconPadding="0"
        dashboardIconBackgroundColor="transparent"
        subscriptionIconBackground="transparent"
        agentIaIconBackgroundColor="transparent"
        crmIconBackgroundColor="transparent"
        size="Small"
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
