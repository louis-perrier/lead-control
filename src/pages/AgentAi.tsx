import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import OptionSearch, { AgentFiltersPopover } from "../components/OptionSearch";
import AgentCards from "../components/AgentCards";
import styles from "./AgentAi.module.css";
import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";
import useAgents from "../hooks/useAgents";

const getAgentTabId = (agent: AgentInfo) =>
  agent.display_id ?? agent.agent_id ?? agent.id;

const AgentAi: FunctionComponent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { tabs?: AgentInfo[] } | undefined;
  const {
    agentDefaultSupa,
    availableAgents,
    displayedAgents,
    refreshDisplayedAgents,
    refreshAvailableAgents,
  } = useAgents();

  const sortOptions = [
    { key: "name", label: "Nom" },
    { key: "agent_id", label: "Identifiant" },
  ];
  const [sortColumn, setSortColumn] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [searchQuery, setSearchQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(
    new Set()
  );
  const [openTabs, setOpenTabs] = useState<AgentInfo[]>(
    locationState?.tabs ?? []
  );
  const [activeTab, setActiveTab] = useState<string>("agents");
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [oauthMessageType, setOauthMessageType] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    if (!locationState?.tabs) {
      return;
    }
    setOpenTabs(locationState.tabs);
  }, [locationState?.tabs]);

  // Gérer les query params OAuth Instagram au retour
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const igConnected = urlParams.get('ig_connected');
    const igError = urlParams.get('ig_error');
    
    if (igConnected === '1') {
      // Succès - comportement existant + message optionnel
      setOauthMessage("Compte Instagram connecté avec succès !");
      setOauthMessageType('success');
      
      // Rafraîchir les données des connecteurs
      refreshDisplayedAgents();
    } else if (igError === 'already_connected') {
      // Erreur - afficher le message d'erreur
      setOauthMessage("Ce compte Instagram est déjà connecté à un autre agent");
      setOauthMessageType('error');
    }
    
    // Nettoyer les query params de l'URL
    if (igConnected || igError) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('ig_connected');
      newUrl.searchParams.delete('ig_error');
      
      // Remplacer l'URL sans recharger la page
      window.history.replaceState({}, '', newUrl.toString());
      
      // Auto-effacer le message après quelques secondes
      const timer = setTimeout(() => {
        setOauthMessage(null);
        setOauthMessageType(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [location.search, refreshDisplayedAgents]);

  const handleSortChange = useCallback(
    ({ key, order }: { key: string; order: "asc" | "desc" }) => {
      setSortColumn(key);
      setSortOrder(order);
    },
    []
  );

  const handleToggleFavorite = useCallback(() => {
    setFavOnly((prev) => !prev);
  }, []);

  const handleToggleActive = useCallback(() => {
    setActiveOnly((prev) => !prev);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFavOnly(false);
    setActiveOnly(false);
    setSelectedAgentIds(new Set());
  }, []);

  const handleToggleAgentType = useCallback((agentId: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const typeOptions = useMemo(() => { 
    const map = new Map<string, string>();
    displayedAgents.forEach((agent) => {
      if (!map.has(agent.agent_id)) {
        map.set(agent.agent_id, agent.agent_default_name);
      }
    });
    return Array.from(map.entries()).map(([agent_id, label]) => ({
      agent_id,
      label,
    }));
  }, [displayedAgents]);

  const filteredAgents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    let candidates = [...displayedAgents];
    if (normalizedQuery) {
      candidates = candidates.filter((agent) =>
        (agent.name ?? "")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    }
    if (favOnly) {
      candidates = candidates.filter((agent) => Boolean(agent.is_fav));
    }
    if (activeOnly) {
      candidates = candidates.filter((agent) => Boolean(agent.is_active));
    }
    if (selectedAgentIds.size > 0) {
      candidates = candidates.filter((agent) =>
        selectedAgentIds.has(agent.agent_id)
      );
    }
    const sorted = [...candidates];
    if (sortColumn) {
      sorted.sort((a, b) => {
        const getValue = (item: AgentInfo) =>
          String((item as Record<string, unknown>)[sortColumn] ?? "").toLowerCase();
        const valueA = getValue(a);
        const valueB = getValue(b);
        if (valueA === valueB) {
          return 0;
        }
        const compareResult = valueA.localeCompare(valueB);
        return sortOrder === "desc" ? -compareResult : compareResult;
      });
    }
    return sorted;
  }, [
    displayedAgents,
    favOnly,
    activeOnly,
    selectedAgentIds,
    searchQuery,
    sortColumn,
    sortOrder,
  ]);

  const filterActive = favOnly || activeOnly || selectedAgentIds.size > 0;
  const filterCount =
    (favOnly ? 1 : 0) + (activeOnly ? 1 : 0) + selectedAgentIds.size;

  const handleToggleFav = useCallback(
    async (agent: AgentInfo) => {
      if (!agent.display_id) {
        return;
      }
      const { error } = await supabase
        .from("agent_configs")
        .update({ is_fav: !agent.is_fav })
        .eq("configs_id", agent.display_id);
      if (error) {
        console.error(error);
      } else {
        refreshDisplayedAgents();
      }
    },
    [refreshDisplayedAgents]
  );

  const openAgentTab = useCallback(
    (agent: AgentInfo) => {
      setOpenTabs((prev) => {
        const agentTabId = getAgentTabId(agent);
        const alreadyOpen = prev.some(
          (tab) => getAgentTabId(tab) === agentTabId
        );
        const nextTabs = alreadyOpen ? prev : [...prev, agent];
        setActiveTab(agentTabId);
        navigate("/app/agentai/configuration", {
          state: { agent, tabs: nextTabs },
        });
        return nextTabs;
      });
    },
    [navigate]
  );

  const closeAgentTab = useCallback(
    (tabId: string) => {
      setOpenTabs((prev) =>
        prev.filter((tab) => getAgentTabId(tab) !== tabId)
      );
      setActiveTab("agents");
      navigate("/app/agentai");
    },
    [navigate]
  );

  const goToAgentsTab = useCallback(() => {
    setActiveTab("agents");
    navigate("/app/agentai");
  }, [navigate]);

  const getTabIconSrc = (isActive: boolean) =>
    isActive ? "/tabComponentSelect.svg" : "/tabComponentNotSelect.svg";

  return (
    <AppLayout>
      <div className={styles.rightcomponent}>
        <Header minimal showLogo={false} />
        
        {/* Message OAuth Instagram */}
        {oauthMessage && (
          <div className={`${styles.oauthNotification} ${
            oauthMessageType === 'error' ? styles.error : styles.success
          }`}>
            {oauthMessage}
            <button 
              onClick={() => {
                setOauthMessage(null);
                setOauthMessageType(null);
              }}
              className={styles.closeButton}
            >
              ×
            </button>
          </div>
        )}
        
        <div className={styles.tabcomponent}>
          <TabComponent
            label="Mes agents"
            active={activeTab === "agents"}
            iconSrc={getTabIconSrc(activeTab === "agents")}
            onClick={goToAgentsTab}
          />
          {openTabs.map((agent) => {
            const tabId = getAgentTabId(agent);
            return (
              <TabComponent
                key={tabId}
                label={agent.name.toUpperCase()}
                active={activeTab === tabId}
                iconSrc={getTabIconSrc(activeTab === tabId)}
                closable
                onClick={() => openAgentTab(agent)}
                onClose={() => closeAgentTab(tabId)}
              />
            );
          })}
        </div>
        <div className={styles.optionSearchWrapper}>
          <OptionSearch
            wrap={true}
            centeredLayout={true}
            enlargedSearch={true}
            sortOptions={sortOptions}
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={() => {
              // search already live
            }}
            filterActive={filterActive}
            filterCount={filterCount}
            onDetailsClick={() => undefined}
            detailsButton={false}
            filterPopover={
              <AgentFiltersPopover
                favOnly={favOnly}
                activeOnly={activeOnly}
                selectedAgentIds={selectedAgentIds}
                typeOptions={typeOptions}
                onToggleFavorite={handleToggleFavorite}
                onToggleActive={handleToggleActive}
                onToggleAgentType={handleToggleAgentType}
                onResetAll={handleResetFilters}
              />
            }
          />
        </div>
        <AgentCards
          agents={filteredAgents}
          agentDefaultSupa={agentDefaultSupa}
          availableAgents={availableAgents}
          refreshDisplayedAgents={refreshDisplayedAgents}
          refreshAvailableAgents={refreshAvailableAgents}
          onAgentClick={openAgentTab}
          onToggleFav={handleToggleFav}
        />
      </div>
    </AppLayout>
  );
};

export default AgentAi;
