import { FunctionComponent, useMemo, type CSSProperties } from "react";
import styles from "./SubscriptionCardComponent.module.css";

export type SubscriptionCardComponentType = {
  className?: string;
  card1?: string;

  /** Style props */
  subscriptionCardComponentAlignItems?: CSSProperties["alignItems"];
  subscriptionCardComponentPadding?: CSSProperties["padding"];
  frameDivPadding?: CSSProperties["padding"];
  frameDivJustifyContent?: CSSProperties["justifyContent"];
};

const SubscriptionCardComponent: FunctionComponent<
  SubscriptionCardComponentType
> = ({
  className = "",
  subscriptionCardComponentAlignItems,
  subscriptionCardComponentPadding,
  frameDivPadding,
  frameDivJustifyContent,
  card1,
}) => {
  const subscriptionCardComponentStyle: CSSProperties = useMemo(() => {
    return {
      alignItems: subscriptionCardComponentAlignItems,
      padding: subscriptionCardComponentPadding,
    };
  }, [subscriptionCardComponentAlignItems, subscriptionCardComponentPadding]);

  const frameDivStyle: CSSProperties = useMemo(() => {
    return {
      padding: frameDivPadding,
      justifyContent: frameDivJustifyContent,
    };
  }, [frameDivPadding, frameDivJustifyContent]);

  return (
    <section
      className={[styles.subscriptioncardcomponent, className].join(" ")}
      style={subscriptionCardComponentStyle}
    >
      <div
        className={styles.subscriptioncardcomponentInner}
        style={frameDivStyle}
      >
        <div className={styles.cardpricebannerParent}>
          <div className={styles.cardpricebanner} />
          <div className={styles.cardprice}>
            <span className={styles.cardpriceTxt}>
              <span className={styles.span}>
                <span className={styles.span2}>300 €</span>
                <span className={styles.span3}>{` `}</span>
              </span>
              <span className={styles.span4}>240€</span>
            </span>
          </div>
        </div>
      </div>
      <div className={styles.pricingcard}>
        <h3 className={styles.card1}>{card1}</h3>
        <div className={styles.items}>
          <div className={styles.listitem}>
            <div className={styles.stateLayer}>
              <img
                className={styles.iconitem}
                loading="lazy"
                alt=""
                src="/iconItem.svg"
              />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem}>
            <div className={styles.stateLayer}>
              <img className={styles.iconitem} alt="" src="/iconItem.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem}>
            <div className={styles.stateLayer}>
              <img className={styles.iconitem} alt="" src="/iconItem.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem4}>
            <div className={styles.stateLayer4}>
              <img className={styles.iconitem4} alt="" src="/iconItem2.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem4}>
            <div className={styles.stateLayer4}>
              <img className={styles.iconitem4} alt="" src="/iconItem2.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem4}>
            <div className={styles.stateLayer4}>
              <img className={styles.iconitem4} alt="" src="/iconItem2.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem4}>
            <div className={styles.stateLayer4}>
              <img className={styles.iconitem4} alt="" src="/iconItem2.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem4}>
            <div className={styles.stateLayer4}>
              <img className={styles.iconitem4} alt="" src="/iconItem2.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
          <div className={styles.listitem4}>
            <div className={styles.stateLayer4}>
              <img className={styles.iconitem4} alt="" src="/iconItem2.svg" />
              <div className={styles.detailsitem}>Avantage</div>
            </div>
          </div>
        </div>
        <button className={styles.subscriptionbutton}>
          <div className={styles.content}>
            <div className={styles.stateLayer10}>
              <div className={styles.subscriptionbutton2}>Subscribe</div>
            </div>
          </div>
        </button>
      </div>
      <img
        className={styles.reductioncomponentIcon}
        loading="lazy"
        alt=""
        src="/reductionComponent@2x.png"
      />
    </section>
  );
};

export default SubscriptionCardComponent;
