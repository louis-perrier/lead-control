import { FunctionComponent, useState } from "react";
import { AppLayout } from "../layouts";
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
    <AppLayout>
      <div className={styles.maincomponent}>
        <Header minimal showLogo={false} />
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
      </div>
    </AppLayout>
  );
};

export default Subscription;
