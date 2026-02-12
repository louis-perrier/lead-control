import {
  FunctionComponent,
  useState,
  useMemo,
  type CSSProperties,
  useCallback,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import NavItem from "./NavItem";
import styles from "./NavigationBar.module.css";
import useAgents from "../hooks/useAgents";

export type NavigationBarType = {
  className?: string;
  divider?: string;
  crmIconBorder?: CSSProperties["border"];
  crmIconPadding?: CSSProperties["padding"];
  crmIconBackgroundColor?: CSSProperties["backgroundColor"];
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
  crmIconBorder,
  crmIconPadding,
  crmIconBackgroundColor,
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
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = useMemo(
    () => [
      {
        key: "dashboard",
        route: "/",
        selected:
          selectedItem === "dashboard" || currentPath === "/",
        labelText: "Dashboard",
        icon: "/dashboardIcon.svg",
        iconBorder: "none" as const,
        iconPadding: "0" as const,
        iconBackgroundColor: "transparent" as const,
        show: true,
      },
      {
        key: "agentia",
        route: "/agentai",
        selected:
          selectedItem === "agentia" || currentPath === "/agentai",
        labelText: "Agent IA",
        icon: "/agentIaIcon.svg",
        iconBorder: undefined,
        iconPadding: undefined,
        iconBackgroundColor: undefined,
        show: true,
      },
      {
        key: "connexion",
        route: "/connexion",
        selected:
          selectedItem === "connexion" || currentPath === "/connexion",
        labelText: "Connexion",
        icon: "/connexionIcon.svg",
        iconBorder: undefined,
        iconPadding: undefined,
        iconBackgroundColor: undefined,
        show: true,
      },
    ],
    [currentPath, selectedItem],
  );

  const { displayedAgents } = useAgents();
  const isGregAgentDisplayed = displayedAgents
    .map((agent) => agent.id.toLowerCase())
    .includes("greg");

  const onNavItemClick = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate],
  );

  const onCrmContainerClick = useCallback(() => {
    navigate("/crm");
  }, [navigate]);

  const onLogoIconClick = useCallback(() => {
    navigate("/");
  }, [navigate]);

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
        {navItems.map((item) => (
          <NavItem
            key={item.key}
            variant="link"
            selected={item.selected}
            labelText={item.labelText}
            icon={item.icon}
            iconBorder={item.iconBorder}
            iconPadding={item.iconPadding}
            iconBackgroundColor={item.iconBackgroundColor}
            onClick={() => onNavItemClick(item.route)}
            isCollapsed={isCollapsed}
            show={item.show}
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
        <NavItem
          variant="link"
          selected={selectedItem === "crm"}
          labelText={"CRM"}
          onClick={onCrmContainerClick}
          icon={"/crmIcon.svg"}
          iconBorder={crmIconBorder}
          iconPadding={crmIconPadding}
          iconBackgroundColor={crmIconBackgroundColor}
          isCollapsed={isCollapsed}
          show={isGregAgentDisplayed}
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
