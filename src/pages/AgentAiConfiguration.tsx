import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import Button from "../components/Button";
import buttonStyles from "../components/Button.module.css";
import CornerSections, {
  CornerSection,
  CornerStatus,
} from "../components/CornerSections";
import SwitchAnimated from "../components/Tools/SwitchAnimated";
import DynamicConfig, {
  ConfigItem,
  ConfigValue,
} from "../components/Tools/DynamicConfig";
import styles from "./AgentAiConfiguration.module.css";

import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";
import useAgents from "../hooks/useAgents";
import { useConnectors } from "../hooks/useConnexion";


type Connexion = {
  imageSrc: string;
  onConnect: () => void;
  onDisconnect: () => void;
};

type ConfigurationLogo = {
  connectors_id: string;
  connectors_name: string;
  connectors_special?: boolean;
  connected?: boolean;
};

type ConnexionCardProps = {
  title: string;
  description: string;
  imageSrc: string;
  actionLabel: string;
  isAvailable?: boolean;
  onAction?: () => void;
};

const ConnexionCard: FunctionComponent<ConnexionCardProps> = ({
  title,
  description,
  imageSrc,
  actionLabel,
  isAvailable = true,
  onAction,
}) => {
  return (
    <div
      className={`${styles.connexionCard} ${
        !isAvailable ? styles.connexionCardDisabled : ""
      }`}
    >
      <img src={imageSrc} alt={title} className={styles.connexionCardImage} />
      <div className={styles.connexionCardBody}>
        <h5>{title}</h5>
        <p>{description}</p>
      </div>
      <Button
        className={`${styles.connexionButton} ${
          !isAvailable ? styles.connexionButtonDisabled : ""
        }`}
        onClick={onAction}
        disabled={!isAvailable}
      >
        {isAvailable ? actionLabel : "Bientôt"}
      </Button>
    </div>
  );
};


type AgentAiConfigurationState = {
  agent?: AgentInfo;
  tabs?: AgentInfo[];
};

const getAgentTabId = (agent: AgentInfo) =>
  agent.display_id ?? agent.agent_id ?? agent.id;

const AgentAi: FunctionComponent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = location.state as AgentAiConfigurationState | undefined;
  const { displayedAgents, refreshDisplayedAgents } = useAgents();

  const initialTabs =
    navigationState?.tabs ??
    (navigationState?.agent ? [navigationState.agent] : []);
  const [tabs, setTabs] = useState<AgentInfo[]>(initialTabs);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    navigationState?.agent?.display_id ?? initialTabs[0]?.display_id
  );

  const selectedAgent = useMemo(() => {
    if (selectedAgentId) {
      const fromDisplayed = displayedAgents.find(
        (agent) => getAgentTabId(agent) === selectedAgentId
      );
      if (fromDisplayed) {
        return fromDisplayed;
      }
      const fromTabs = tabs.find(
        (agent) => getAgentTabId(agent) === selectedAgentId
      );
      if (fromTabs) {
        return fromTabs;
      }
    }
    if (tabs.length > 0) {
      return tabs[0];
    }
    return displayedAgents[0];
  }, [displayedAgents, selectedAgentId, tabs]);

  const activeTabId = selectedAgent ? getAgentTabId(selectedAgent) : undefined;

  // UI state
  const [activeCorner, setActiveCorner] = useState<CornerSection | null>(null);
  const [headerSwitchOn, setHeaderSwitchOn] = useState(false);

  // Details form state
  const [detailsPrompt, setDetailsPrompt] = useState("");
  const [oldDetailsPrompt, setOldDetailsPrompt] = useState("");
  const [detailsContext, setDetailsContext] = useState("");
  const [oldDetailsContext, setOldDetailsContext] = useState("");

  // Configuration state
  const [activeSocial, setActiveSocial] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<ConfigValue[]>([]);
  const [initialConfigValues, setInitialConfigValues] = useState<ConfigValue[]>([]);
  const [isConfigLoading, setIsConfigLoading] = useState(false);

  useEffect(() => {
    if (activeCorner !== "Configurations") {
      setActiveSocial(null);
    }
  }, [activeCorner]);

  // ------------------------------Navigation helpers---------------------------------
  const goToAgentAi = useCallback(() => {
    navigate("/app/agentai", { state: { tabs } });
  }, [navigate, tabs]);

  const handleSelectTab = useCallback((agent: AgentInfo) => {
    setSelectedAgentId(getAgentTabId(agent));
    setTabs((prevTabs) => {
      if (prevTabs.some((tab) => getAgentTabId(tab) === getAgentTabId(agent))) {
        return prevTabs;
      }
      return [...prevTabs, agent];
    });
  }, []);

  const handleCloseTab = useCallback((agent: AgentInfo) => {
    setTabs((prevTabs) => {
      const nextTabs = prevTabs.filter(
        (tab) => getAgentTabId(tab) !== getAgentTabId(agent)
      );
      setSelectedAgentId((currentId) => {
        if (currentId === getAgentTabId(agent)) {
          return nextTabs[0]?.display_id;
        }
        return currentId;
      });
      return nextTabs;
    });
  }, []);

  const handleHeaderSwitchChange = useCallback(
    async (nextState: boolean) => {
      setHeaderSwitchOn(nextState);
      if (!selectedAgent?.display_id) {
        return;
      }
      const { error } = await supabase
        .from("agent_configs")
        .update({ is_active: nextState })
        .eq("configs_id", selectedAgent.display_id);
      if (error) {
        console.error(error);
        return;
      }
      refreshDisplayedAgents();
    },
    [refreshDisplayedAgents, selectedAgent?.display_id]
  );

  useEffect(() => {
    if (tabs.length === 0 && displayedAgents.length > 0) {
      setTabs([displayedAgents[0]]);
      setSelectedAgentId(displayedAgents[0].display_id);
    }
  }, [displayedAgents, tabs.length]);

  useEffect(() => {
    if (!selectedAgentId && selectedAgent) {
      setSelectedAgentId(getAgentTabId(selectedAgent));
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    setHeaderSwitchOn(Boolean(selectedAgent?.is_active));
  }, [selectedAgent?.is_active]);

  useEffect(() => {
    // Initialize details inputs from the selected agent configuration
    if (selectedAgent) {
      const prompt = selectedAgent.configs.Details?.prompt ?? "";
      const context = selectedAgent.configs.Details?.context ?? "";
      setDetailsPrompt(prompt);
      setOldDetailsPrompt(prompt);
      setDetailsContext(context);
      setOldDetailsContext(context);
    }
  }, [selectedAgent]);


  // ------------------------------CONNEXIONS---------------------------------
  const [activePopup, setActivePopup] = useState<Window | null>(null);
  const {
    connectorAvailable,
    connectorConnected,
    availableShow,
    countAvailableConnector,
    countConnectedConnector,
    refresh: refreshConnectors,
  } = useConnectors({
    agentId: selectedAgent?.agent_id,
    configsId: selectedAgent?.display_id,
  });

  
  useEffect(() => {
    // Refresh connectors when Supabase broadcasts a change
    const ch = supabase
      .channel("connectors_config_agent_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connectors_config_agent" },
        () => {
          if (activePopup) activePopup.close();
          refreshConnectors();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [activePopup, refreshConnectors]);


  const connectInstagram = async () => {
    // Lancement du process OAuth pour Instagram
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");
      const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/smooth-worker/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          "authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ return_to: "https://leadcontrol.com/app/agentai", configs_id: selectedAgent?.display_id }),
      });

      const { auth_url } = await res.json();
      const popup = window.open(auth_url, "ig_oauth", "width=520,height=720");
      if (!popup) alert("Popup bloquée : autorise les popups pour Lead Control");
      setActivePopup(popup);
    } catch (error) {
      console.error(error);
    }
  };

  const disconnectInstagram = async () => {
    // Déconnexion de l’utilisateur Instagram via la fonction Supabase
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");
      const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/dynamic-responder/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          "authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({connector_id: connectorConnected.find((item) => item.connectors_name === "instagram")?.id})// A améliorer
      });

      const data = await res.text();
      if (data !== "OK") throw new Error("Failed to disconnect connector");
    } catch (error) {
      console.error(error);
    }
  };
  const connexions: Record<string, Connexion> = {
    appel: {imageSrc: "/logoConnectors/appel.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}}, // Special celui-là !!
    instagram: {imageSrc: "/logoConnectors/instagram.webp",  onConnect: connectInstagram, onDisconnect: disconnectInstagram},
    whatsapp: {imageSrc: "/logoConnectors/whatsapp.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    gmail: {imageSrc: "/logoConnectors/gmail.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    tiktok: {imageSrc: "/logoConnectors/tiktok.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    linkedin: {imageSrc: "/logoConnectors/linkedin.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    facebook: {imageSrc: "/logoConnectors/facebook.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    discord: {imageSrc: "/logoConnectors/discord.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    telegram: {imageSrc: "/logoConnectors/telegram.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}}
  };

  // ------------------------------CONFIGURATIONS---------------------------------
  /**
   * Les logos affichés dans la zone “Configurations” sont triés pour prioriser
   * les connecteurs déjà reliés, les spéciales puis le reste disponible.
   */
  const configurationLogos = useMemo<ConfigurationLogo[]>(() => {

    const availableLogos = availableShow
      .filter((connector) => !connector.connectors_special)
      .map((connector) => ({
        connectors_id: connector.connectors_id,
        connectors_name: connector.connectors_name,
        connectors_special: connector.connectors_special,
        connected: false,
      }));

    const specialLogos = availableShow
      .filter((connector) => connector.connectors_special)
      .map((connector) => ({
        connectors_id: connector.connectors_id,
        connectors_name: connector.connectors_name,
        connectors_special: connector.connectors_special,
        connected: true,
      }));

    const connectedLogos = connectorConnected.map((connector) => ({
      connectors_id: connector.connectors_id,
      connectors_name: connector.connectors_name,
      connected: true,
    }));

    return [...connectedLogos, ...specialLogos, ...availableLogos];
  }, [availableShow, connectorAvailable, connectorConnected]);

  const selectedConfigItems = useMemo<ConfigItem[]>(() => {
    if (!activeSocial) return [];
    const connector = connectorAvailable.find(
      (item) => item.connectors_name.toLowerCase() === activeSocial.toLowerCase()
    );
    const config = connector?.config_agent_connector;
    if (!Array.isArray(config)) return [];
    return config as ConfigItem[];
  }, [activeSocial, connectorAvailable]);

  const collectRequiredConfigIds = (items: ConfigItem[]) => {
    const ids: string[] = [];
    const visit = (entries: ConfigItem[]) => {
      entries.forEach((entry) => {
        if (entry.required) {
          ids.push(entry.id);
        }
        if (entry.enabled?.length) {
          visit(entry.enabled);
        }
      });
    };
    visit(items);
    return ids;
  };

  /**
   * Liste à plat des identifiants marqués “required” (y compris les champs imbriqués)
   * afin de pouvoir valider l’état “Configurations”.
   */
  const requiredConfigIds = useMemo(() => {
    return collectRequiredConfigIds(selectedConfigItems);
  }, [selectedConfigItems]);

  const hasGlobalMissingRequiredConfig = useMemo(() => {
    if (connectorConnected.length === 0) return false;
    const checkMissing = (configItems: ConfigItem[], values: ConfigValue[]) => {
      const requiredIds = collectRequiredConfigIds(configItems);
      if (requiredIds.length === 0) return false;
      const valueMap = new Map(values.map(({ id, value }) => [id, value]));
      return requiredIds.some((id) => {
        const value = valueMap.get(id);
        if (value === undefined || value === null) return true;
        if (typeof value === "string") {
          return value.trim().length === 0;
        }
        if (Array.isArray(value)) {
          return value.length === 0;
        }
        return false;
      });
    };
    return connectorConnected.some((connector) => {
      const blueprint = connectorAvailable.find(
        (item) =>
          item.connectors_name.toLowerCase() ===
          connector.connectors_name.toLowerCase()
      );
      if (!blueprint?.config_agent_connector) {
        return true;
      }
      const rawConfig = connector.current_connector_config ?? [];
      let normalizedConfig: unknown[] | null = null;
      if (Array.isArray(rawConfig)) {
        normalizedConfig = rawConfig;
      } else if (typeof rawConfig === "string") {
        try {
          normalizedConfig = JSON.parse(rawConfig) as unknown[];
        } catch {
          normalizedConfig = null;
        }
      }
      const savedValues: ConfigValue[] = (
        (Array.isArray(normalizedConfig) ? normalizedConfig : []) as ConfigValue[]
      ).map((item) => ({
        id: item.id,
        value: item.value,
      }));
      return checkMissing(blueprint.config_agent_connector as ConfigItem[], savedValues);
    });
  }, [connectorAvailable, connectorConnected]);

  /**
   * Vérifie si des champs “required” attendent encore une valeur valable.
   */
  const hasMissingRequiredConfig = useMemo(() => {
    if (requiredConfigIds.length === 0) return false;
    const valueMap = new Map(configValues.map(({ id, value }) => [id, value]));
    return requiredConfigIds.some((id) => {
      const value = valueMap.get(id);
      if (value === undefined || value === null) return true;
      if (typeof value === "string") {
        return value.trim().length === 0;
      }
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return false;
    });
  }, [requiredConfigIds, configValues]);

  /**
   * Indique si la section “Details” est complète et si une connexion est active,
   * afin d’alimenter les statuts des coins.
   */
  const areDetailsFilled = useMemo(
    () =>
      !!detailsPrompt.trim().length &&
      !!detailsContext.trim().length,
    [detailsPrompt, detailsContext]
  );

  const hasActiveConnection = countConnectedConnector > 0;
  const hasAnyConnectors =
    countAvailableConnector + countConnectedConnector > 0;

  const sectionStatuses = useMemo<Record<CornerSection, CornerStatus>>(() => {
    const statuses: Record<CornerSection, CornerStatus> = {
      Details: "lock",
      Connexions: "lock",
      BIENTÔT: "lock",
      Configurations: "lock",
    };

    if (!areDetailsFilled) {
      statuses.Details = "unlock";
      return statuses;
    }

    statuses.Details = "available";
    if (!hasAnyConnectors) {
      statuses.Connexions = "available";
      statuses.Configurations = "available";
      return statuses;
    }

    statuses.Connexions = hasActiveConnection ? "available" : "unlock";

    if (!hasActiveConnection) {
      return statuses;
    }

    statuses.Configurations = hasGlobalMissingRequiredConfig ? "unlock" : "available";
    return statuses;
  }, [
    areDetailsFilled,
    hasActiveConnection,
    hasGlobalMissingRequiredConfig,
    hasAnyConnectors,
  ]);

  const isConfigSectionAvailable =
    sectionStatuses.Configurations === "available";
  const isHeaderSwitchDisabled = !isConfigSectionAvailable;
  const displayedHeaderSwitchChecked = isHeaderSwitchDisabled
    ? false
    : headerSwitchOn;

  /** Mise à jour locale des valeurs (en réponse au composant DynamicConfig). */
  const handleConfigChange = (values: ConfigValue[]) => {
    setConfigValues(values);
  };
  /**
   * Récupère les valeurs sauvegardées dans Supabase pour pré-remplir la section
   * lorsque l’utilisateur ouvre Configurations.
   */
  const fetchSavedConfig = useCallback(async () => {
    if (!activeSocial || !selectedAgent) {
      setInitialConfigValues([]);
      setConfigValues([]);
      return;
    }
    setIsConfigLoading(true);
    try {
      const target =
        connectorConnected.find(
          (item) => item.connectors_name.toLowerCase() === activeSocial.toLowerCase()
        ) ?? connectorConnected[0];
      if (!target?.id) {
        setInitialConfigValues([]);
        setConfigValues([]);
        return;
      }
      const { data, error } = await supabase
        .from("connectors_config_agent")
        .select("current_config_connexion")
        .eq("configs_id", selectedAgent.display_id)
        .eq("user_connexion_id", target.id)
        .single();
      console.log(data);
      if (error || !data?.current_config_connexion) {
        setInitialConfigValues([]);
        setConfigValues([]);
        return;
      }
      const raw = data.current_config_connexion;
      const parsed = raw.map((item: { id: string; value: any }) => ({
        id: item.id,
        value: item.value,
      }));
      console.log(parsed);
      setInitialConfigValues(parsed);
      setConfigValues(parsed);
    } finally {
      setIsConfigLoading(false);
    }
  }, [activeSocial, selectedAgent, connectorConnected]);

  useEffect(() => {
    if (activeCorner === "Configurations") {
      fetchSavedConfig();
    }
  }, [activeCorner, fetchSavedConfig]);

  const buildPayload = () => configValues.map(({ id, value }) => ({ id, value }));

  /**
   * Envoie la configuration côté connexion vers Supabase et referme la popup.
   */
  const handleSaveConfig = async () => {
    if (!selectedAgent || !activeSocial) return;
    const target =
      connectorConnected.find(
        (item) => item.connectors_name.toLowerCase() === activeSocial.toLowerCase()
      ) ?? connectorConnected[0];
    if (!target?.id) {
      console.warn("Pas de user_connexion_id pour le connecteur", activeSocial);
      return;
    }
    const payload = buildPayload();
    if (payload.length === 0) return;
    const { error } = await supabase
      .from("connectors_config_agent")
      .update({ current_config_connexion: payload })
      .eq("configs_id", selectedAgent.display_id)
      .eq("user_connexion_id", target.id);
    if (error) {
      console.error("Erreur lors de la sauvegarde", error);
    } else {
      console.log("Config enregistrée");
    }
    setActiveCorner(null);
  };
  // ------------------------------PROMPT---------------------------------
  /**
   * Sauvegarde les champs “Details” (prompt + contexte) dans Supabase.
   */
  const handleSaveDetails = async () => { 
    if (!selectedAgent) return;
    setActiveCorner(null);
    setOldDetailsPrompt(detailsPrompt);
    setOldDetailsContext(detailsContext);
    const { error } = await supabase
      .from("agent_configs")
      .update({
        configs: {
          ...selectedAgent.configs,
          Details: {
            ...selectedAgent.configs.Details,
            prompt: detailsPrompt,
            context: detailsContext,
          },
        },
      })
      .eq("configs_id", selectedAgent.display_id);
    if (error) {
      console.error(error);
      return;
    }
    await refreshDisplayedAgents();
  };

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
          <TabComponent onClick={goToAgentAi} iconSrc="/tabComponentNotSelect.svg" />
          {tabs.map((agent) => {
            const tabId = getAgentTabId(agent);
            return (
              <TabComponent
                key={tabId}
                label={agent.name.toUpperCase()}
                iconSrc={
                  activeTabId === tabId
                    ? "/tabComponentSelect.svg"
                    : "/tabComponentNotSelect.svg"
                }
                closable
                onClick={() => handleSelectTab(agent)}
                onClose={() => handleCloseTab(agent)}
              />
            );
          })}
        </div>
        {selectedAgent && (
          <div className={styles.agentTitleWrapper}>
            <div className={styles.agentTitleText}>
              <h2>{selectedAgent.name.toUpperCase()}</h2>
              <SwitchAnimated
                checked={displayedHeaderSwitchChecked}
                onChange={handleHeaderSwitchChange}
                showLabel={false}
                disabled={isHeaderSwitchDisabled}
              />
            </div>
          </div>
        )}
        <CornerSections
          backgroundImage={selectedAgent?.backgroundSrc}
          onSelect={(section) => setActiveCorner(section)}
          statuses={sectionStatuses}
        />
        {activeCorner && selectedAgent && (
            <div
              className={styles.cornerOverlay}
              onClick={() => {
                setActiveCorner(null);
                setDetailsPrompt(oldDetailsPrompt);
                setDetailsContext(oldDetailsContext);
              }}
            >
            <div
              className={styles.cornerOverlayContent}
              onClick={(event) => event.stopPropagation()}
            >
              {activeCorner === "Configurations" && (
                <>
                  <div className={styles.availableLogosWrapper}>
                    {configurationLogos.map((logo) => (
                      <button
                        key={`${logo.connectors_id}-${logo.connected ? "connected" : "available"}`}
                        type="button"
                        className={`${styles.availableLogoContainer} ${
                          logo.connected ? "" : styles.availableLogoButtonDisabled
                        }`}
                        disabled={!logo.connected}
                        onClick={() => {
                          if (logo.connected) {
                            setActiveSocial(logo.connectors_name.toLowerCase());
                          }
                        }}
                      >
                        <div
                          className={`${styles.availableLogoTrapezoid} ${
                            logo.connected ? "" : styles.availableLogoDisabled
                          } ${logo.connectors_special ? styles.availableLogoSpecial : ""}`}
                        >
                          <img
                            src={`/logoConnectors/${logo.connectors_name.toLowerCase()}.webp`}
                            alt={`${logo.connectors_name} logo`}
                            className={styles.availableLogo}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className={styles.socialComponentPanel}>
                    <div className={styles.socialComponentHeader}>
                      <h1>
                        {activeSocial
                          ? `${activeSocial.toUpperCase()}`
                          : "Configuration"}
                      </h1>
                    </div>
                    {isConfigLoading ? (
                      <div className={styles.socialComponentLoading}>
                        Chargement des configurations...
                      </div>
                    ) : selectedConfigItems.length > 0 ? (
                      <DynamicConfig
                        items={selectedConfigItems}
                        initialValues={initialConfigValues}
                        onChange={handleConfigChange}
                      />
                    ) : (
                      <p className={styles.socialComponentPlaceholder}>
                        Aucune configuration sélectionnée.
                      </p>
                    )}
                  </div>
                </>
              )}
              {activeCorner === "Details" && (
                <>
                  <label
                    className={styles.cornerOverlayLabel}
                    htmlFor="detailsPrompt"
                  >
                    Prompt <span className={styles.requiredAsterisk}>*</span>
                  </label>
                  <textarea
                    id="detailsPrompt"
                    className={styles.cornerOverlayTextarea}
                    value={detailsPrompt}
                    placeholder="Rédige ton prompt..."
                    onChange={(event) => setDetailsPrompt(event.target.value)}
                  />
                  <label
                    className={styles.cornerOverlayLabel}
                    htmlFor="detailsContext"
                  >
                    Contexte <span className={styles.requiredAsterisk}>*</span>
                  </label>
                  <textarea
                    id="detailsContext"
                    className={styles.cornerOverlayTextarea}
                    value={detailsContext}
                    placeholder="Décris le contexte à prendre en compte..."
                    onChange={(event) => setDetailsContext(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.cornerOverlaySave}
                    onClick={handleSaveDetails}
                    disabled={
                      !detailsPrompt.trim() || !detailsContext.trim()
                    }
                  >
                    Enregistrer
                  </button>
                </>
              )}
              {activeCorner === "Connexions" && (
                <div className={styles.connexionSections}>
                  <div className={styles.connexionSection}>
                    <h4>Connecté ({countConnectedConnector})</h4>
                    <div className={styles.connexionSectionCards}>
                      {connectorConnected.map((connector) => (
                        <ConnexionCard
                          key={connector.connectors_id}
                          title={connector.connectors_name.charAt(0).toUpperCase() + connector.connectors_name.slice(1)}
                          description={connector.connector_label ?? ""}
                          imageSrc={connexions[connector.connectors_name].imageSrc}
                          actionLabel="Déconnecter"
                          onAction={connexions[connector.connectors_name].onDisconnect}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={styles.connexionSection}>
                    <h4>Déconnecté ({countAvailableConnector-countConnectedConnector})</h4>
                    <div className={styles.connexionSectionCards}>
                      {availableShow
                        .filter((connector) => !connector.connectors_special)
                        .map((connector) => (
                          <ConnexionCard
                            key={connector.connectors_id}
                            title={
                              connector.connectors_name.charAt(0).toUpperCase() +
                              connector.connectors_name.slice(1)
                            }
                            description={`Connecter ${connector.connectors_name}`}
                            imageSrc={connexions[connector.connectors_name].imageSrc}
                            actionLabel="Connecter"
                            isAvailable={connector.connectors_available}
                            onAction={connexions[connector.connectors_name].onConnect}
                          />
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {activeCorner === "Configurations" && selectedConfigItems.length > 0 && (
              <div className={styles.configurationFooterWrapper}>
                <div className={styles.configurationFooter}>
                  <Button
                    className={buttonStyles.save}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSaveConfig();
                    }}
                    disabled={hasMissingRequiredConfig}
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AgentAi;
