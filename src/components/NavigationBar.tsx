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

  const { displayedAgents } = useAgents();
  const normalizedDisplayedAgentIds = displayedAgents.map((agent) =>
    agent.id.toLowerCase()
  );
  const isGregAgentDisplayed = normalizedDisplayedAgentIds.includes("greg");
  const isRickAgentDisplayed = normalizedDisplayedAgentIds.includes("rick");
  const hasActiveGregAgentDisplayed = displayedAgents.some(
    (agent) => agent.id.toLowerCase() === "greg" && agent.is_active
  );
  const hasActiveRickAgentDisplayed = displayedAgents.some(
    (agent) => agent.id.toLowerCase() === "rick" && agent.is_active
  );

  const navItems = useMemo(
    () => [
      {
        key: "dashboard",
        route: "/app",
        selected:
          selectedItem === "dashboard" || currentPath === "/app",
        labelText: "Dashboard",
        icon: "/dashboardIcon.svg",
        iconBorder: "none" as const,
        iconPadding: "0" as const,
        iconBackgroundColor: "transparent" as const,
        show: true,
      },
      {
        key: "agentia",
        route: "/app/agentai",
        selected:
          selectedItem === "agentia" || currentPath === "/app/agentai",
        labelText: "Agent IA",
        icon: "/agentIaIcon.svg",
        iconBorder: undefined,
        iconPadding: undefined,
        iconBackgroundColor: undefined,
        show: true,
      },
      {
        key: "connexion",
        route: "/app/connexion",
        selected:
          selectedItem === "connexion" || currentPath === "/app/connexion",
        labelText: "Connexion",
        icon: "/connexionIcon.svg",
        iconBorder: undefined,
        iconPadding: undefined,
        iconBackgroundColor: undefined,
        show: true,
        },
        {
          key: "scraping",
          route: "/app/scraping",
          selected:
            selectedItem === "scraping" || currentPath === "/app/scraping",
          labelText: "Scraping",
          icon: "/scrapingIcon.svg",
          iconBorder: undefined,
          iconPadding: undefined,
          iconBackgroundColor: undefined,
          show: isRickAgentDisplayed && hasActiveRickAgentDisplayed,
        },
    ],
    [
      currentPath,
      selectedItem,
      isRickAgentDisplayed,
      hasActiveRickAgentDisplayed,
    ],
  );


  const onNavItemClick = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate],
  );

  const onCrmContainerClick = useCallback(() => {
    navigate("/app/crm");
  }, [navigate]);

  const onLogoIconClick = useCallback(() => {
    navigate("/app");
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
          show={isGregAgentDisplayed && hasActiveGregAgentDisplayed}
        />
      </div>
    </section>
  );
};

export default NavigationBar;
