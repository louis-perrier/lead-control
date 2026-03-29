import {
  FunctionComponent,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import useAgents from "../../hooks/useAgents";
import useSubscriptionState from "../../hooks/useSubscriptionState";
import SidebarHeader from "./SidebarHeader";
import SidebarAccountCard from "./SidebarAccountCard";
import SidebarSection from "./SidebarSection";
import SidebarNavItem from "./SidebarNavItem";
import ProfilePopover from "./ProfilePopover";
import useHasFailedConnector from "../../hooks/useHasFailedConnector";
import styles from "./ModernSidebar.module.css";

export type ModernSidebarProps = {
  className?: string;
};

const ModernSidebar: FunctionComponent<ModernSidebarProps> = ({
  className = "",
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("leadcontrol.navCollapsed") === "true";
  });

  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("leadcontrol.navCollapsed", String(isCollapsed));
  }, [isCollapsed]);

  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();
  const { data: subscriptionState, isLoading: subscriptionLoading } = useSubscriptionState();

  const { data: hasFailedConnector } = useHasFailedConnector();
  const { displayedAgents } = useAgents();
  const normalizedDisplayedAgentIds = displayedAgents.map((agent) =>
    agent.id.toLowerCase()
  );
  const hasActiveRickAgentDisplayed = displayedAgents.some(
    (agent) => agent.id.toLowerCase() === "rick" && agent.is_active
  );
  const hasActiveGregAgentDisplayed = displayedAgents.some(
    (agent) => agent.id.toLowerCase() === "greg" && agent.is_active
  );

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleNavigation = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate]
  );

  const toggleProfilePopover = useCallback(() => {
    setProfilePopoverOpen((prev) => !prev);
  }, []);

  // Navigation items - Section Général
  const generalItems = [
    {
      key: "dashboard",
      route: "/app",
      selected: currentPath === "/app",
      labelText: "Dashboard",
      icon: "/dashboardIcon.svg",
    },
    {
      key: "agentia",
      route: "/app/agentai",
      selected: currentPath === "/app/agentai" || currentPath === "/app/agentai/configuration",
      labelText: "Agent IA",
      icon: "/agentIaIcon.svg",
    },
    {
      key: "connexion",
      route: "/app/connexion",
      selected: currentPath === "/app/connexion",
      labelText: "Connexion",
      icon: "/connexionIcon.svg",
      badge: hasFailedConnector ? "!" : undefined,
      badgeVariant: "error" as const,
    },
  ];

  // Navigation items - Section Modules Actifs (conditionnels)
  const activeModulesItems = [
    {
      key: "scraping",
      route: "/app/scraping",
      selected: currentPath === "/app/scraping",
      labelText: "Scraping",
      icon: "/scrapingIcon.svg",
      show: hasActiveRickAgentDisplayed,
    },
    {
      key: "crm",
      route: "/app/crm",
      selected: currentPath === "/app/crm",
      labelText: "CRM",
      icon: "/crmIcon.svg",
      show: hasActiveGregAgentDisplayed,
    },
  ].filter(item => item.show);

  // Navigation items - Section Billing
  const billingItems = [
    {
      key: "paiement",
      route: "/app/paiement",
      selected: currentPath === "/app/paiement",
      labelText: "Mes paiements",
      icon: "/paymentIcon.svg",
    },
    {
      key: "commission",
      route: "#",
      selected: false,
      labelText: "Commission",
      icon: "/commissionIcon.svg",
      disabled: true,
      badge: "Bientôt",
    },
  ];

  return (
    <aside
      className={[styles.modernSidebar, className].filter(Boolean).join(" ")}
      data-collapsed={String(isCollapsed)}
    >
      <div className={styles.sidebarContent}>
        {/* Header avec logo et bouton collapse */}
        <SidebarHeader
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />

        {/* Bloc compte avec avatar, email, plan, crédits */}
        <SidebarAccountCard
          user={user}
          subscriptionState={subscriptionState}
          isLoading={subscriptionLoading}
          isCollapsed={isCollapsed}
          onProfileClick={toggleProfilePopover}
          triggerRef={profileTriggerRef}
        />

        {/* Navigation principale */}
        <div className={styles.navigationSections}>
          {/* Section Général - toujours visible */}
          <SidebarSection
            title="Général"
            isCollapsed={isCollapsed}
          >
            {generalItems.map((item) => (
              <SidebarNavItem
                key={item.key}
                selected={item.selected}
                labelText={item.labelText}
                icon={item.icon}
                onClick={() => handleNavigation(item.route)}
                isCollapsed={isCollapsed}
                badge={"badge" in item ? item.badge : undefined}
                badgeVariant={"badgeVariant" in item ? item.badgeVariant : undefined}
              />
            ))}
          </SidebarSection>

          {/* Section Modules Actifs - conditionnelle */}
          {activeModulesItems.length > 0 && (
            <SidebarSection
              title="Modules actifs"
              isCollapsed={isCollapsed}
            >
              {activeModulesItems.map((item) => (
                <SidebarNavItem
                  key={item.key}
                  selected={item.selected}
                  labelText={item.labelText}
                  icon={item.icon}
                  onClick={() => handleNavigation(item.route)}
                  isCollapsed={isCollapsed}
                />
              ))}
            </SidebarSection>
          )}

          {/* Section Billing */}
          <SidebarSection
            title="Billing"
            isCollapsed={isCollapsed}
          >
            {billingItems.map((item) => (
              <SidebarNavItem
                key={item.key}
                selected={item.selected}
                labelText={item.labelText}
                icon={item.icon}
                onClick={() => item.disabled ? undefined : handleNavigation(item.route)}
                isCollapsed={isCollapsed}
                disabled={item.disabled}
                badge={item.badge}
              />
            ))}
          </SidebarSection>
        </div>
      </div>

      {/* Popover profil */}
      <ProfilePopover
        isOpen={profilePopoverOpen}
        onClose={() => {
          setProfilePopoverOpen(false);
        }}
        triggerRef={profileTriggerRef}
      />
    </aside>
  );
};

export default ModernSidebar;