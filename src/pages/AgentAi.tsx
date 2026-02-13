import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import OptionSearch from "../components/OptionSearch";
import AgentCards from "../components/AgentCards";
import styles from "./AgentAi.module.css";
import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";
import useAgents from "../hooks/useAgents";

type AgentFiltersPopoverProps = {
  open: boolean;
  onClose: () => void;
  favOnly: boolean;
  activeOnly: boolean;
  selectedAgentIds: Set<string>;
  typeOptions: Array<{ agent_id: string; label: string }>;
  onToggleFavorite: () => void;
  onToggleActive: () => void;
  onToggleAgentType: (agentId: string) => void;
};

const AgentFiltersPopover: FunctionComponent<AgentFiltersPopoverProps> = ({
  open,
  onClose,
  favOnly,
  activeOnly,
  selectedAgentIds,
  typeOptions,
  onToggleFavorite,
  onToggleActive,
  onToggleAgentType,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleWindowClick = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleWindowClick);
    return () => {
      window.removeEventListener("mousedown", handleWindowClick);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div ref={popoverRef} className={styles.filterPopover}>
      <div className={styles.filterSection}>
        <span className={styles.filterHeading}>Filtres rapides</span>
        <label className={styles.filterToggle}>
          <input
            type="checkbox"
            checked={favOnly}
            onChange={() => onToggleFavorite()}
          />
          Favoris uniquement
        </label>
        <label className={styles.filterToggle}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={() => onToggleActive()}
          />
          Actifs uniquement
        </label>
      </div>
      <div className={styles.filterSection}>
        <span className={styles.filterHeading}>Types d’agent</span>
        <div className={styles.filterCheckboxList}>
          {typeOptions.map((option) => (
            <label key={option.agent_id} className={styles.filterOption}>
              <input
                type="checkbox"
                checked={selectedAgentIds.has(option.agent_id)}
                onChange={() => onToggleAgentType(option.agent_id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {typeOptions.length === 0 && (
            <span className={styles.filterEmpty}>Aucun agent enregistré</span>
          )}
        </div>
      </div>
    </div>
  );
};

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
  const [filterOpen, setFilterOpen] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(
    new Set()
  );
  const [openTabs, setOpenTabs] = useState<AgentInfo[]>(
    locationState?.tabs ?? []
  );
  const [activeTab, setActiveTab] = useState<string>("agents");

  useEffect(() => {
    if (!locationState?.tabs) {
      return;
    }
    setOpenTabs(locationState.tabs);
  }, [locationState?.tabs]);

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
        map.set(agent.agent_id, agent.name);
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
        navigate("/agentai/configuration", {
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
      navigate("/agentai");
    },
    [navigate]
  );

  const goToAgentsTab = useCallback(() => {
    setActiveTab("agents");
    navigate("/agentai");
  }, [navigate]);

  const getTabIconSrc = (isActive: boolean) =>
    isActive ? "/tabComponentSelect.svg" : "/tabComponentNotSelect.svg";

  return (
    <div className={styles.agentai}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="agentia"
      />
      <main className={styles.rightcomponent}>
        <Header logoMarque="/logoMarque@2x.png" />
        <div className={styles.tabcomponent}>
          <TabComponent
            label="Agents"
            iconSrc={getTabIconSrc(activeTab === "agents")}
            onClick={goToAgentsTab}
          />
          {openTabs.map((agent) => {
            const tabId = getAgentTabId(agent);
            return (
              <TabComponent
                key={tabId}
                label={agent.name.toUpperCase()}
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
            onFilterClick={() => setFilterOpen((prev) => !prev)}
            onDetailsClick={() => undefined}
            detailsButton={false}
          />
          <AgentFiltersPopover
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            favOnly={favOnly}
            activeOnly={activeOnly}
            selectedAgentIds={selectedAgentIds}
            typeOptions={typeOptions}
            onToggleFavorite={handleToggleFavorite}
            onToggleActive={handleToggleActive}
            onToggleAgentType={handleToggleAgentType}
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
      </main>
    </div>
  );
};

export default AgentAi;
