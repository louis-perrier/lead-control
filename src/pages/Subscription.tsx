import { FunctionComponent, useState } from "react";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import InformationContainer from "../components/InformationContainer";
import SubscriptionCardComponent from "../components/SubscriptionCardComponent";
import CustomPlan from "../components/CustomPlan";
import styles from "./Subscription.module.css";

const Subscription: FunctionComponent = () => {
  const [subscriptionCardComponentItems] = useState([
    {
      subscriptionCardComponentAlignItems: "flex-start" as const,
      subscriptionCardComponentPadding: "23px 0px 2px" as const,
      frameDivPadding: "0px 0px 0px 41px" as const,
      frameDivJustifyContent: undefined,
      card1: "card1",
    },
    {
      subscriptionCardComponentAlignItems: undefined,
      subscriptionCardComponentPadding: undefined,
      frameDivPadding: undefined,
      frameDivJustifyContent: undefined,
      card1: "card2",
    },
    {
      subscriptionCardComponentAlignItems: "flex-end" as const,
      subscriptionCardComponentPadding: "23px 41.6px 2px 0px" as const,
      frameDivPadding: "0px 41px 0px 0px" as const,
      frameDivJustifyContent: "flex-end" as const,
      card1: "card3",
    },
  ]);
  return (
    <div className={styles.subscription}>
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
        subscriptionSelected
        agentIaSelected={false}
        crmSelected={false}
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
        subscriptionIcon1="/Icon8.svg"
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
        selectedItem="subscription"
      />
      <main className={styles.maincomponent}>
        <Header logoMarque="/logoMarque@2x.png" />
        <InformationContainer />
        <section className={styles.pricecards}>
          {subscriptionCardComponentItems.map((item, index) => (
            <SubscriptionCardComponent
              key={index}
              subscriptionCardComponentAlignItems={
                item.subscriptionCardComponentAlignItems
              }
              subscriptionCardComponentPadding={
                item.subscriptionCardComponentPadding
              }
              frameDivPadding={item.frameDivPadding}
              frameDivJustifyContent={item.frameDivJustifyContent}
              card1={item.card1}
            />
          ))}
        </section>
        <CustomPlan />
      </main>
    </div>
  );
};

export default Subscription;
