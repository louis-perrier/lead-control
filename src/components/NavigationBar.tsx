import {
  FunctionComponent,
  useState,
  useMemo,
  type CSSProperties,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import NavItem from "./NavItem";
import NavItem1 from "./NavItem1";
import styles from "./NavigationBar.module.css";

export type NavigationBarType = {
  className?: string;
  divider?: string;
  dashboardSelected?: boolean;
  subscriptionSelected?: boolean;
  agentIaSelected?: boolean;
  crmSelected?: boolean;
  dashboardShowIcon?: boolean;
  subscriptionShowIcon?: boolean;
  agentIaShowIcon?: boolean;
  crmShowIcon?: boolean;
  dashboardState?: string;
  subscriptionState?: string;
  agentIaState?: string;
  crmState?: string;
  dashboardBadgeLabelText?: string;
  dashboardLabelText?: string;
  subscriptionLabelText?: string;
  agentIaLabelText?: string;
  crmLabelText?: string;
  dashboardIcon1?: string;
  subscriptionIcon1?: string;
  agentIaIcon1?: string;
  crmIcon1?: string;
  dashboardShowBadgeLabel?: boolean;
  dashboardIconBorder?: CSSProperties["border"];
  subscriptionIconBorder?: CSSProperties["border"];
  agentIaIconBorder?: CSSProperties["border"];
  crmIconBorder?: CSSProperties["border"];
  dashboardIconPadding?: CSSProperties["padding"];
  subscriptionIconPadding?: CSSProperties["padding"];
  agentIaIconPadding?: CSSProperties["padding"];
  crmIconPadding?: CSSProperties["padding"];
  dashboardIconBackgroundColor?: CSSProperties["backgroundColor"];
  subscriptionIconBackground?: CSSProperties["backgroundColor"];
  agentIaIconBackgroundColor?: CSSProperties["backgroundColor"];
  crmIconBackgroundColor?: CSSProperties["backgroundColor"];
  size?: string;
  selectedItem?: string;

  /** Variant props */
  door?: string;

  /** Style props */
  iconBorder4?: CSSProperties["border"];
  iconPadding4?: CSSProperties["padding"];
  iconBackgroundColor4?: CSSProperties["backgroundColor"];
  iconBorder5?: CSSProperties["border"];
  iconPadding5?: CSSProperties["padding"];
  iconBackgroundColor5?: CSSProperties["backgroundColor"];
};

const NavigationBar: FunctionComponent<NavigationBarType> = ({
  className = "",
  door = "open",
  divider,
  iconBorder4,
  iconPadding4,
  iconBackgroundColor4,
  iconBorder5,
  iconPadding5,
  iconBackgroundColor5,
  dashboardSelected,
  subscriptionSelected,
  agentIaSelected,
  crmSelected,
  dashboardShowIcon,
  subscriptionShowIcon,
  agentIaShowIcon,
  crmShowIcon,
  dashboardState,
  subscriptionState,
  agentIaState,
  crmState,
  dashboardBadgeLabelText,
  dashboardLabelText,
  subscriptionLabelText,
  agentIaLabelText,
  crmLabelText,
  dashboardIcon1,
  subscriptionIcon1,
  agentIaIcon1,
  crmIcon1,
  dashboardShowBadgeLabel,
  dashboardIconBorder,
  subscriptionIconBorder,
  agentIaIconBorder,
  crmIconBorder,
  dashboardIconPadding,
  subscriptionIconPadding,
  agentIaIconPadding,
  crmIconPadding,
  dashboardIconBackgroundColor,
  subscriptionIconBackground,
  agentIaIconBackgroundColor,
  crmIconBackgroundColor,
  size,
  selectedItem = "dashboard",
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const icon1Style: CSSProperties = useMemo(() => {
    return {
      border: iconBorder4,
      padding: iconPadding4,
      backgroundColor: iconBackgroundColor4,
    };
  }, [iconBorder4, iconPadding4, iconBackgroundColor4]);

  const icon2Style: CSSProperties = useMemo(() => {
    return {
      border: iconBorder5,
      padding: iconPadding5,
      backgroundColor: iconBackgroundColor5,
    };
  }, [iconBorder5, iconPadding5, iconBackgroundColor5]);

  const navigate = useNavigate();
  const [navItem1Items] = useState([
    {
      selected: selectedItem === "dashboard",
      showIcon: true,
      state: "Enabled",
      badgeLabelText: "",
      labelText: "Dashboard",
      showBadgeLabel: true,
      icon1: dashboardIcon1,
      iconBorder: "none" as const,
      iconPadding: "0" as const,
      iconBackgroundColor: "transparent" as const,
    },
    {
      selected: selectedItem === "subscription",
      showIcon: true,
      state: "Enabled",
      badgeLabelText: "",
      labelText: "Subscription",
      showBadgeLabel: false,
      icon1: subscriptionIcon1,
      iconBorder: undefined,
      iconPadding: undefined,
      iconBackgroundColor: undefined,
    },
    {
      selected: selectedItem === "agentia",
      showIcon: true,
      state: "Enabled",
      badgeLabelText: "",
      labelText: "Agent IA",
      showBadgeLabel: false,
      icon1: agentIaIcon1,
      iconBorder: undefined,
      iconPadding: undefined,
      iconBackgroundColor: undefined,
    },
  ]);

  const onAgentIaContainerClick = useCallback(() => {
    navigate("/agentai");
  }, [navigate]);

  const onCrmContainerClick = useCallback(() => {
    navigate("/crm");
  }, [navigate]);

  const onDashboardContainerClick = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const onSubscriptionContainerClick = useCallback(() => {
    navigate("/subscription");
  }, [navigate]);

  const onLogoIconClick = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const onLogoIconItemClick = useCallback((index: number) => {
    if (index === 2) {
      onAgentIaContainerClick();
    } else if (index === 0) {
      onDashboardContainerClick();
    } else if (index === 1) {
      onSubscriptionContainerClick();
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  return (
    <section
      className={[styles.navigationbar, className].filter(Boolean).join(" ")}
      data-door={door}
      data-collapsed={String(isCollapsed)}
    >
      <div className={styles.frameParent}>
        <div className={styles.frameWrapper}>
          <div className={styles.optionnavigationParent}>
            <NavItem
              badge="Small"
              elevation="Default"
              selected={false}
              showLabelText={false}
              state="Enabled"
              size="Small"
              onClick={toggleCollapse}
            />
            <div className={styles.logoWrapper}>
              <img
                className={styles.logoIcon}
                alt=""
                src="/logo@2x.png"
                onClick={onLogoIconClick}
              />
            </div>
          </div>
        </div>
        {navItem1Items.map((item, index) => (
          <NavItem1
            key={index}
            selected={item.selected}
            showIcon={item.showIcon}
            state={item.state}
            badgeLabelText={item.badgeLabelText}
            labelText={item.labelText}
            showBadgeLabel={item.showBadgeLabel}
            icon1={item.icon1}
            iconBorder={item.iconBorder}
            iconPadding={item.iconPadding}
            iconBackgroundColor={item.iconBackgroundColor}
            onLogoIconClick={() => onLogoIconItemClick(index)}
            isCollapsed={isCollapsed}
          />
        ))}
        <div className={styles.dividerWrapper}>
          <img
            className={styles.dividerIcon}
            loading="lazy"
            alt=""
            src={divider}
          />
        </div>
        <NavItem1
          selected={crmSelected}
          showIcon={crmShowIcon}
          state={crmState}
          badgeLabelText="100+"
          labelText={crmLabelText}
          showBadgeLabel={false}
          onLogoIconClick={onCrmContainerClick}
          icon1={crmIcon1}
          iconBorder={crmIconBorder}
          iconPadding={crmIconPadding}
          iconBackgroundColor={crmIconBackgroundColor}
          isCollapsed={isCollapsed}
        />
      </div>
      <div className={styles.helpcenterWrapper}>
        <div className={styles.helpcenter}>
          <div className={styles.stateLayer}>
            <img
              className={styles.icon}
              alt=""
              src="/Icon6.svg"
              style={icon1Style}
            />
            <img
              className={styles.icon2}
              alt=""
              src="/Icon7.svg"
              style={icon2Style}
            />
            <div className={styles.helpcenter2}>{`Need Help `}</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NavigationBar;
