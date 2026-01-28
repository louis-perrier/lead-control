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
  crmIconBorder?: CSSProperties["border"];
  crmIconPadding?: CSSProperties["padding"];
  crmIconBackgroundColor?: CSSProperties["backgroundColor"];
  selectedItem?: string;
  connexionIconBorder?: CSSProperties["border"];
  connexionIconPadding?: CSSProperties["padding"];
  connexionIconBackgroundColor?: CSSProperties["backgroundColor"];

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
  crmIconBorder,
  crmIconPadding,
  crmIconBackgroundColor,
  selectedItem = "dashboard",
  connexionIconBorder,
  connexionIconPadding,
  connexionIconBackgroundColor,
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
      labelText: "Dashboard",
      icon: '/dashboardIcon.svg',
      iconBorder: "none" as const,
      iconPadding: "0" as const,
      iconBackgroundColor: "transparent" as const,
    },
    {
      selected: selectedItem === "subscription",
      labelText: "Subscription",
      icon: '/subscriptionIcon.svg',
      iconBorder: undefined,
      iconPadding: undefined,
      iconBackgroundColor: undefined,
    },
    {
      selected: selectedItem === "agentia",
      labelText: "Agent IA",
      icon: '/agentIaIcon.svg',
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

  const onConnexionContainerClick = useCallback(() => {
    navigate("/connexion");
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
            labelText={item.labelText}
            icon={item.icon}
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
          selected={selectedItem === "crm"}
          labelText={"CRM"}
          onLogoIconClick={onCrmContainerClick}
          icon={'/crmIcon.svg'}
          iconBorder={crmIconBorder}
          iconPadding={crmIconPadding}
          iconBackgroundColor={crmIconBackgroundColor}
          isCollapsed={isCollapsed}
        />
        <NavItem1
          selected={selectedItem === "connexion"}
          labelText={"Connexion"}
          onLogoIconClick={onConnexionContainerClick}
          icon={'/connexionIcon.svg'}
          iconBorder={connexionIconBorder}
          iconPadding={connexionIconPadding}
          iconBackgroundColor={connexionIconBackgroundColor}
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
