import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
  DragEvent,
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
import { buildConnectorActions } from "../connectors/actions";


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

type ToneOption = "normal" | "friendly" | "funny" | "pro" | "direct";
type ActiveDays = {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
};
type DetailErrors = {
  context?: string;
  contextPdf?: string;
  activeDays?: string;
  timeRange?: string;
  stopText?: string;
  stopLink?: string;
};
type DetailsSnapshot = {
  contextText: string;
  tone: ToneOption;
  activeDays: ActiveDays;
  timeStart: string;
  timeEnd: string;
  stopText: string;
  stopLink: string;
};

const defaultActiveDays: ActiveDays = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};
const defaultTimeRange = { start: "09:00", end: "20:00" };
const PDF_SIZE_LIMIT = 20 * 1024 * 1024;
const CONTEXT_STORAGE_BUCKET = "agent-context";
const CONTEXT_DOCUMENT_FUNCTION_URL =
  "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/context-document-chunk-embeddings";
const toneOptions: { value: ToneOption; label: string; description: string }[] = [
  {
    value: "normal",
    label: "Normal",
    description: "Factuel et neutre pour la majorité des conversations.",
  },
  {
    value: "friendly",
    label: "Amical",
    description: "Ton chaleureux pour rassurer vos interlocuteurs.",
  },
  {
    value: "funny",
    label: "Drôle",
    description: "Une approche légère et détendue (à utiliser avec parcimonie).",
  },
  {
    value: "pro",
    label: "Pro",
    description: "Langage formel, précis et rassurant.",
  },
  {
    value: "direct",
    label: "Direct",
    description: "Aller à l’essentiel avec un ton actif.",
  },
];
const dayLabels: { key: keyof ActiveDays; label: string }[] = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mer" },
  { key: "thu", label: "Jeu" },
  { key: "fri", label: "Ven" },
  { key: "sat", label: "Sam" },
  { key: "sun", label: "Dim" },
];

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

  // Etat de la popup “Details”
  const [contextText, setContextText] = useState("");
  const [contextPdf, setContextPdf] = useState<File | null>(null);
  const [contextPdfError, setContextPdfError] = useState<string | undefined>(
    undefined
  );
  const [tone, setTone] = useState<ToneOption>("normal");
  const [activeDays, setActiveDays] = useState<ActiveDays>({
    ...defaultActiveDays,
  });
  const [timeStart, setTimeStart] = useState(defaultTimeRange.start);
  const [timeEnd, setTimeEnd] = useState(defaultTimeRange.end);
  const [stopText, setStopText] = useState("");
  const [stopLink, setStopLink] = useState("");
  const [errors, setErrors] = useState<DetailErrors>({});
  const [lastSavedDetails, setLastSavedDetails] =
    useState<DetailsSnapshot | null>(null);

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

  const buildSnapshotFromDetails = useCallback(
    (details: Record<string, any> | undefined): DetailsSnapshot => {
      const savedDays = (details?.activeDays ?? {}) as Partial<ActiveDays>;
      return {
        contextText: details?.context ?? "",
        tone: (details?.tone as ToneOption) ?? "normal",
        activeDays: {
          ...defaultActiveDays,
          ...savedDays,
        },
        timeStart: details?.timeStart ?? defaultTimeRange.start,
        timeEnd: details?.timeEnd ?? defaultTimeRange.end,
        stopText: details?.stopText ?? "",
        stopLink: details?.stopLink ?? "",
      };
    },
    []
  );

  const applySnapshot = useCallback((snapshot: DetailsSnapshot | null) => {
    if (!snapshot) {
      setContextText("");
      setTone("normal");
      setActiveDays({ ...defaultActiveDays });
      setTimeStart(defaultTimeRange.start);
      setTimeEnd(defaultTimeRange.end);
      setStopText("");
      setStopLink("");
      return;
    }
    setContextText(snapshot.contextText);
    setTone(snapshot.tone);
    setActiveDays({ ...snapshot.activeDays });
    setTimeStart(snapshot.timeStart);
    setTimeEnd(snapshot.timeEnd);
    setStopText(snapshot.stopText);
    setStopLink(snapshot.stopLink);
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    const savedDetails = (selectedAgent.configs as Record<string, any>)?.Details;
    const snapshot = buildSnapshotFromDetails(savedDetails);
    applySnapshot(snapshot);
    setLastSavedDetails(snapshot);
    setContextPdf(null);
    setContextPdfError(undefined);
    setErrors({});
  }, [applySnapshot, buildSnapshotFromDetails, selectedAgent]);

  const handleCloseDetailsOverlay = useCallback(() => {
    setActiveCorner(null);
  }, []);

  const validateForm = useCallback((): DetailErrors => {
    const nextErrors: DetailErrors = {};
    if (!contextText.trim() && !contextPdf) {
      nextErrors.context = "Ajoute du texte ou un PDF pour décrire ton contexte.";
    }
    if (contextPdfError) {
      nextErrors.contextPdf = contextPdfError;
    }
    const hasActiveDay = Object.values(activeDays).some(Boolean);
    if (!hasActiveDay) {
      nextErrors.activeDays = "Sélectionne au moins un jour actif.";
    }
    if (timeStart >= timeEnd) {
      nextErrors.timeRange =
        "L’horaire de début doit être antérieur à l’horaire de fin.";
    }
    const trimmedLink = stopLink.trim();
    if (trimmedLink) {
      const normalizedLink =
        trimmedLink.startsWith("http://") ||
        trimmedLink.startsWith("https://")
          ? trimmedLink
          : trimmedLink.startsWith("www.")
          ? `https://${trimmedLink}`
          : `https://${trimmedLink}`;
      try {
        new URL(normalizedLink);
      } catch {
        nextErrors.stopLink =
          "Le lien doit être valide (https:// ou www.).";
      }
      if (!stopText.trim()) {
        nextErrors.stopText =
          "Décris le rôle du lien pour que l’agent sache quand s’arrêter.";
      }
    }
    return nextErrors;
  }, [
    contextText,
    contextPdf,
    contextPdfError,
    activeDays,
    timeStart,
    timeEnd,
    stopText,
    stopLink,
  ]);

  useEffect(() => {
    setErrors(validateForm());
  }, [validateForm]);

  const handleFileSelection = useCallback((file: File | null) => {
    if (!file) {
      setContextPdf(null);
      setContextPdfError(undefined);
      return;
    }
    if (file.type !== "application/pdf") {
      setContextPdf(null);
      setContextPdfError("Seuls les PDF sont autorisés.");
      return;
    }
    if (file.size > PDF_SIZE_LIMIT) {
      setContextPdf(null);
      setContextPdfError("Taille max 20 Mo.");
      return;
    }
    setContextPdf(file);
    setContextPdfError(undefined);
  }, []);

  const handlePdfInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handlePdfDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
      handleFileSelection(event.dataTransfer.files[0]);
    }
  };

  const toggleDay = (day: keyof ActiveDays) => {
    setActiveDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };


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


  const connexions = useMemo(
    () =>
      buildConnectorActions({
        configsId: selectedAgent?.display_id ?? null,
        connectorConnected,
        setActivePopup,
      }),
    [selectedAgent?.display_id, connectorConnected, setActivePopup]
  );

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
  const areDetailsFilled = useMemo(() => {
    return contextText.trim().length > 0 || contextPdf !== null;
  }, [contextText, contextPdf]);

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
  const getCurrentDetailsSnapshot = useCallback(
    (): DetailsSnapshot => ({
      contextText,
      tone,
      activeDays: { ...activeDays },
      timeStart,
      timeEnd,
      stopText,
      stopLink,
    }),
    [contextText, tone, activeDays, timeStart, timeEnd, stopText, stopLink]
  );

  const hasValidationErrors = Object.values(errors).some(Boolean);

  // ------------------------------PROMPT---------------------------------
  /**
   * Sauvegarde les champs “Details” (prompt + contexte) dans Supabase.
   */
  const handleSaveDetails = async () => {
    const nextErrors = validateForm();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || !selectedAgent) {
      return;
    }
    if (contextPdf) {
      const agentConfigId =
        selectedAgent.display_id ?? selectedAgent.agent_id ?? selectedAgent.id;
      if (!agentConfigId) {
        setContextPdfError("Impossible de traiter le PDF pour le moment.");
        return;
      }
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session) {
        console.error("Erreur de session Supabase", sessionError);
        setContextPdfError("Impossible d’uploader le PDF : session invalide.");
        return;
      }
      const session = sessionData.session;
      const userId = session.user?.id;
      const accessToken = session.access_token;
      if (!userId || !accessToken) {
        setContextPdfError("Impossible d’uploader le PDF : token manquant.");
        return;
      }
      const storagePath = `user/${userId}/agent_config/${agentConfigId}/context.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(CONTEXT_STORAGE_BUCKET)
        .upload(storagePath, contextPdf, { upsert: true });
      if (uploadError) {
        console.error("Erreur upload PDF", uploadError);
        setContextPdfError(
          "Impossible d’envoyer le PDF. Vérifie ta connexion puis réessaie."
        );
        return;
      }
      try {
        const response = await fetch(CONTEXT_DOCUMENT_FUNCTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            storage_path: storagePath,
            agent_config_id: agentConfigId,
          }),
        });
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Erreur edge function", errorText);
          setContextPdfError("La fonction context document a échoué.");
          return;
        }
        const json = await response.json();
        if (!json.ok) {
          console.error("Fonction context document retourne ok=false", json);
          setContextPdfError(
            json.error ?? "Le traitement du PDF a échoué côté edge function."
          );
          return;
        }
      } catch (error) {
        console.error("Erreur lors de l’appel edge function", error);
        setContextPdfError("La fonction context document n’a pas répondu.");
        return;
      }
    }
    const snapshot = getCurrentDetailsSnapshot();
    const { error } = await supabase
      .from("agent_configs")
      .update({
        configs: {
          ...selectedAgent.configs,
          Details: {
            ...selectedAgent.configs.Details,
            context: contextText,
            tone,
            activeDays: { ...activeDays },
            timeStart,
            timeEnd,
            stopText,
            stopLink: stopLink.trim(),
          },
        },
      })
      .eq("configs_id", selectedAgent.display_id);
    if (error) {
      console.error(error);
      return;
    }
    await refreshDisplayedAgents();
    setLastSavedDetails(snapshot);
    setContextPdf(null);
    setContextPdfError(undefined);
    setErrors({});
    setActiveCorner(null);
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
                if (activeCorner === "Details") {
                  handleCloseDetailsOverlay();
                } else {
                  setActiveCorner(null);
                }
              }}
            >
            <div
              className={`${styles.cornerOverlayContent} ${
                activeCorner === "Configurations" ? styles.configurationOverlayContent : ""
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              {activeCorner === "Configurations" && (
                <>
                  <div className={styles.configurationContent}>
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
                  </div>
                  <div className={styles.configurationFooterWrapper}>
                    {selectedConfigItems.length > 0 && (
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
                    )}
                  </div>
                </>
              )}
              {activeCorner === "Details" && (
                <div className={styles.detailsLayout}>
                  <div className={styles.detailsHeader}>
                    <div>
                      <h3>Configuration de l’agent</h3>
                      <p className={styles.detailsSubtitle}>
                        Donne suffisamment d’éléments pour guider la prise de parole de ton agent IA.
                      </p>
                    </div>
                  </div>
                  <div className={styles.detailsGrid}>
                    <section className={`${styles.detailsCard} ${styles.detailsCardWide}`}>
                      <div className={styles.cardHeader}>
                        <h4 className={styles.cardTitle}>Contexte</h4>
                        <p className={styles.cardDescription}>
                          Texte libre et/ou PDF pour expliquer le ton, le produit et les limites à respecter.
                        </p>
                      </div>
                      <textarea
                        value={contextText}
                        onChange={(event) => setContextText(event.target.value)}
                        placeholder="Décris le contexte à prendre en compte..."
                        className={styles.detailsTextarea}
                      />
                      <div className={styles.dropzoneWrapper}>
                        <label
                          htmlFor="contextPdfInput"
                          className={styles.dropzone}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={handlePdfDrop}
                        >
                          <span>Importer un PDF (max 20 Mo)</span>
                        </label>
                        <input
                          id="contextPdfInput"
                          type="file"
                          accept="application/pdf"
                          className={styles.dropzoneInput}
                          onChange={handlePdfInputChange}
                        />
                        {contextPdf && (
                          <div className={styles.pdfPreview}>
                            <div>
                              <span className={styles.pdfName}>{contextPdf.name}</span>
                              <span className={styles.pdfSize}>
                                {(contextPdf.size / 1024 / 1024).toFixed(1)} Mo
                              </span>
                            </div>
                            <button
                              type="button"
                              className={styles.pdfRemove}
                              onClick={() => handleFileSelection(null)}
                            >
                              Retirer
                            </button>
                          </div>
                        )}
                        {errors.context && (
                          <p className={styles.fieldError}>{errors.context}</p>
                        )}
                        {errors.contextPdf && (
                          <p className={styles.fieldError}>{errors.contextPdf}</p>
                        )}
                      </div>
                    </section>
                    <section className={`${styles.detailsCard} ${styles.toneComingSoon}`}>
                      <div className={styles.cardHeader}>
                        <h4 className={styles.cardTitle}>Ton</h4>
                        <p className={styles.cardDescription}>
                          Choisis la personnalité par défaut que l’agent utilisera à l’écrit.
                        </p>
                      </div>
                      <select
                        value={tone}
                        onChange={(event) =>
                          setTone(event.target.value as ToneOption)
                        }
                        className={styles.toneSelect}
                      >
                        {toneOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className={styles.toneMeta}>
                        {
                          toneOptions.find((option) => option.value === tone)
                            ?.description
                        }
                      </p>
                      <div className={styles.toneComingSoonOverlay}>
                        Bientôt disponible
                      </div>
                    </section>
                    <section className={styles.detailsCard}>
                      <div className={styles.cardHeader}>
                        <h4 className={styles.cardTitle}>Horaires d’activation</h4>
                        <p className={styles.cardDescription}>
                          Défini les jours et la plage horaire à respecter pour ce contexte.
                        </p>
                      </div>
                      <div className={styles.dayToggles}>
                        {dayLabels.map((day) => (
                          <button
                            key={day.key}
                            type="button"
                            className={`${styles.dayToggle} ${
                              activeDays[day.key] ? styles.dayToggleActive : ""
                            }`}
                            aria-pressed={activeDays[day.key]}
                            onClick={() => toggleDay(day.key)}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      <div className={styles.timeFields}>
                        <div className={styles.timeField}>
                          <label htmlFor="timeStart" className={styles.fieldLabel}>
                            De
                          </label>
                          <input
                            id="timeStart"
                            type="time"
                            value={timeStart}
                            onChange={(event) => setTimeStart(event.target.value)}
                            className={styles.timeInput}
                          />
                        </div>
                        <div className={styles.timeField}>
                          <label htmlFor="timeEnd" className={styles.fieldLabel}>
                            À
                          </label>
                          <input
                            id="timeEnd"
                            type="time"
                            value={timeEnd}
                            onChange={(event) => setTimeEnd(event.target.value)}
                            className={styles.timeInput}
                          />
                        </div>
                      </div>
                      {errors.activeDays && (
                        <p className={styles.fieldError}>{errors.activeDays}</p>
                      )}
                      {errors.timeRange && (
                        <p className={styles.fieldError}>{errors.timeRange}</p>
                      )}
                    </section>
                    <section className={styles.detailsCard}>
                      <div className={styles.cardHeader}>
                        <h4 className={styles.cardTitle}>Condition d’arrêt</h4>
                        <p className={styles.cardDescription}>
                          Si vous mettez un lien (ex: Calendly), décrivez à quoi il sert pour que l’agent comprenne quand s’arrêter.
                        </p>
                      </div>
                      <textarea
                        value={stopText}
                        onChange={(event) => setStopText(event.target.value)}
                        placeholder="Décris ce qui doit déclencher l’arrêt."
                        className={styles.stopTextarea}
                      />
                      {errors.stopText && (
                        <p className={styles.fieldError}>{errors.stopText}</p>
                      )}
                      <input
                        type="text"
                        value={stopLink}
                        onChange={(event) => setStopLink(event.target.value)}
                        placeholder="https://"
                        className={styles.detailsInput}
                      />
                      {errors.stopLink && (
                        <p className={styles.fieldError}>{errors.stopLink}</p>
                      )}
                    </section>
                  </div>
                  <div className={styles.detailsFooter}>
                    <button
                      type="button"
                      className={styles.cornerOverlaySave}
                      onClick={handleSaveDetails}
                      disabled={hasValidationErrors}
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
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
          </div>
        )}
      </main>
    </div>
  );
};

export default AgentAi;
