import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ChangeEvent,
  DragEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "../layouts";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import Button from "../components/Button";
import buttonStyles from "../components/Button.module.css";
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
import ToneSelector, {
  ToneOption,
  ToneOptionConfig,
} from "../components/ToneSelector/ToneSelector";
import ToneStatusIndicator, { ToneStatus } from "../components/ToneStatusIndicator/ToneStatusIndicator";
import ProgressiveQuestionModal from "../components/ProgressiveQuestionModal/ProgressiveQuestionModal";
import WATwilioConnect from "../components/WATwilioConnect/WATwilioConnect";
import ConfigTextareaTags from "../components/Tools/TextAreaTags";
import {
  CustomToneAnswers,
  CustomToneKey,
  CustomToneStatus,
  CustomToneQuestion,
} from "../types/customTone";


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
  helpUrl?: string;
  helpTooltip?: string;
};

const ConnexionCard: FunctionComponent<ConnexionCardProps> = ({
  title,
  description,
  imageSrc,
  actionLabel,
  isAvailable = true,
  onAction,
  helpUrl,
  helpTooltip,
}) => {
  return (
    <div
      className={`${styles.connexionCard} ${
        !isAvailable ? styles.connexionCardDisabled : ""
      }`}
    >
      <img src={imageSrc} alt={title} className={styles.connexionCardImage} />
      <div className={styles.connexionCardBody}>
        <div className={styles.connexionCardTitleRow}>
          <h5>{title}</h5>
          {helpUrl && (
            <a
              href={helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.connexionHelpBubble}
              title={helpTooltip}
              onClick={(e) => e.stopPropagation()}
            >
              ?
            </a>
          )}
        </div>
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

type CalendlyEventType = {
  uri: string;
  name: string;
  schedulingUrl: string;
};

type CalendlyMetadataEventType = {
  uri: string;
  name: string;
  slug: string;
  scheduling_url: string;
  active: boolean;
};

const toCalendlyEventType = (raw: CalendlyMetadataEventType): CalendlyEventType => ({
  uri: raw.uri,
  name: raw.name,
  schedulingUrl: raw.scheduling_url,
});

const CalendlyConnexionCard: FunctionComponent<{
  configsId: string;
  connectorLabel: string;
  metadata?: Record<string, any> | null;
  currentEventTypeUri?: string;
  onDisconnect: () => void;
  onSaveEventType: (uri: string) => Promise<void>;
}> = ({ configsId, connectorLabel, metadata, currentEventTypeUri, onDisconnect, onSaveEventType }) => {
  const metadataEventTypes: CalendlyEventType[] = useMemo(
    () => ((metadata?.event_types ?? []) as CalendlyMetadataEventType[]).map(toCalendlyEventType),
    [metadata?.event_types]
  );
  const [eventTypes, setEventTypes] = useState<CalendlyEventType[]>(metadataEventTypes);
  const [selectedUri, setSelectedUri] = useState(currentEventTypeUri ?? "");
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync event types quand metadata change (après refresh ou connexion initiale)
  useEffect(() => {
    if (metadataEventTypes.length > 0) {
      setEventTypes(metadataEventTypes);
    }
  }, [metadataEventTypes]);

  const handleRefreshEventTypes = async () => {
    setIsLoadingEvents(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(
        `https://wxatvxfirhahjalneorq.supabase.co/functions/v1/calendly-oauth/event-types?configs_id=${configsId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const refreshed: CalendlyMetadataEventType[] = data.event_types ?? [];
      setEventTypes(refreshed.map(toCalendlyEventType));
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const accountEmail = metadata?.email as string | undefined;
  const selectedType = eventTypes.find((e) => e.uri === selectedUri);
  const previewUrl = selectedType
    ? `${selectedType.schedulingUrl}?utm_source=leadcontrol&utm_content={conversation_id}`
    : null;
  const isDirty = selectedUri && selectedUri !== currentEventTypeUri;

  return (
    <div className={styles.connexionCard} style={{ alignItems: "flex-start" }}>
      <img
        src="/logoConnectors/calendly.svg"
        alt="Calendly"
        className={styles.connexionCardImage}
        style={{ marginTop: 4 }}
      />
      <div className={styles.connexionCardBody} style={{ gap: 8 }}>
        <div className={styles.connexionCardTitleRow}>
          <h5>Calendly</h5>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
              flexShrink: 0,
              display: "inline-block",
            }}
          />
        </div>
        <p style={{ marginBottom: 2, fontSize: "var(--fs-13)", color: "var(--app-text-secondary)" }}>
          {accountEmail ?? connectorLabel}
        </p>
        <select
          value={selectedUri}
          onChange={(e) => setSelectedUri(e.target.value)}
          disabled={isLoadingEvents}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--app-border)",
            background: "var(--app-bg)",
            color: "var(--app-text)",
            fontSize: "var(--fs-13)",
            cursor: isLoadingEvents ? "wait" : "pointer",
            outline: "none",
          }}
        >
          <option value="">
            {isLoadingEvents
              ? "Chargement…"
              : eventTypes.length === 0
              ? "Aucun event type trouvé"
              : "Choisir un event type"}
          </option>
          {eventTypes.map((et) => (
            <option key={et.uri} value={et.uri}>
              {et.name}
            </option>
          ))}
        </select>
        {previewUrl && (
          <p
            style={{
              fontSize: "var(--fs-11)",
              color: "var(--app-text-secondary)",
              wordBreak: "break-all",
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {previewUrl}
          </p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, marginTop: 4 }}>
        {isDirty && (
          <Button
            className={buttonStyles.save}
            onClick={async () => {
              setIsSaving(true);
              await onSaveEventType(selectedUri);
              setIsSaving(false);
            }}
            disabled={isSaving}
          >
            {isSaving ? "…" : "Enregistrer"}
          </Button>
        )}
        <Button
          className={styles.connexionButton}
          onClick={handleRefreshEventTypes}
          disabled={isLoadingEvents}
          style={{ fontSize: "var(--fs-12)" }}
        >
          {isLoadingEvents ? "…" : "Rafraîchir"}
        </Button>
        <Button
          className={styles.connexionButton}
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#ef4444" }}
          onClick={onDisconnect}
        >
          Déconnecter
        </Button>
      </div>
    </div>
  );
};

type TimeSlot = {
  id: string;
  time: string;
  durationMinutes: number;
};

type SavedTimeSlot = Omit<TimeSlot, "id">;

const DEFAULT_SAVED_SLOTS: SavedTimeSlot[] = [];

const createTimeSlot = (overrides?: Partial<TimeSlot>): TimeSlot => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  time: "09:00",
  durationMinutes: 30,
  ...overrides,
});

const getDefaultSlots = (): TimeSlot[] =>
  DEFAULT_SAVED_SLOTS.map((slot) =>
    createTimeSlot({
      time: slot.time,
      durationMinutes: slot.durationMinutes,
    })
  );

const buildStateSlots = (
  savedSlots: SavedTimeSlot[] | undefined
): TimeSlot[] =>
  savedSlots === undefined
    ? getDefaultSlots()
    : savedSlots.map((slot) =>
        createTimeSlot({
          time: slot.time,
          durationMinutes: slot.durationMinutes,
        })
      );

const normalizeSavedSlots = (value: unknown): SavedTimeSlot[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object"
    )
    .map((slot) => ({
      time:
        typeof slot.time === "string" && slot.time.length > 0
          ? slot.time
          : "09:00",
      durationMinutes:
        typeof slot.durationMinutes === "number" && !Number.isNaN(slot.durationMinutes)
          ? Math.max(1, Math.round(slot.durationMinutes))
          : 30,
    }));
};

const toMinutes = (time: string) => {
  const [hours = "0", minutes = "0"] = time.split(":");
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  return Math.max(0, (Number.isNaN(parsedHours) ? 0 : parsedHours) * 60 + (Number.isNaN(parsedMinutes) ? 0 : parsedMinutes));
};

const isValidTimeFormat = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

type ActiveDays = {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
};


const CUSTOM_TONE_QUESTIONS: CustomToneQuestion[] = [
  {
    key: "q1",
    title: "Q1 — Prospect froid / vague",
    example: "Salut, je suis tombé sur ton contenu, tu proposes quoi exactement ?",
  },
  {
    key: "q2",
    title: "Q2 — Prospect qui partage un problème",
    example: "Honnêtement je galère depuis un moment et je ne sais pas par où commencer.",
  },
  {
    key: "q3",
    title: "Q3 — Prospect intéressé mais prudent",
    example: "Ça a l'air bien, mais je ne sais pas si c'est vraiment pour moi.",
  },
  {
    key: "q4",
    title: "Q4 — Objection prix",
    example: "Ça coûte combien ? Et est-ce que ça vaut vraiment le coup ?",
  },
  {
    key: "q5",
    title: "Q5 — Prospect pressé / direct",
    example: "Vas droit au but, c'est quoi l'intérêt concret pour moi ?",
  },
  {
    key: "q6",
    title: "Q6 — Prospect chaud / prêt à acheter",
    example: "Ok, ça me parle, comment je fais pour rejoindre ?",
  },
];

const createDefaultCustomToneAnswers = (): CustomToneAnswers =>
  CUSTOM_TONE_QUESTIONS.reduce(
    (acc, question) => ({ ...acc, [question.key]: "" }),
    {} as CustomToneAnswers
  );

const buildCustomToneValidationErrors = (
  answers: CustomToneAnswers
): Partial<Record<CustomToneKey, string>> => {
  const errors: Partial<Record<CustomToneKey, string>> = {};
  CUSTOM_TONE_QUESTIONS.forEach((question) => {
    const value = answers[question.key]?.trim() ?? "";
    if (value.length < 200) {
      errors[question.key] =
        "Chaque réponse doit contenir au minimum 200 caractères.";
    } else if (value.length > 900) {
      errors[question.key] =
        "Chaque réponse doit contenir au maximum 900 caractères.";
    }
  });
  return errors;
};
type DetailErrors = {
  context?: string;
  contextPdf?: string;
  activeDays?: string;
  timeRange?: string;
  stopText?: string;
  stopLink?: string;
  productName?: string;
  timeSlots?: string;
};
type DetailsSnapshot = {
  contextText: string;
  tone: ToneOption;
  activeDays: ActiveDays;
  timeStart: string;
  timeEnd: string;
  stopText: string;
  stopLink: string;
  productName: string;
  qualification: string;
  timeSlots?: SavedTimeSlot[];
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
const AGENT_NAME_MAX_LENGTH = 11;
const PDF_SIZE_LIMIT = 20 * 1024 * 1024;
const CONTEXT_STORAGE_BUCKET = "agent-context";
const CONTEXT_DOCUMENT_FUNCTION_URL =
  "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/context-document-chunk-embeddings";
const CONTEXT_PDF_UPLOAD_ENABLED = false;
const toneOptions: ToneOptionConfig[] = [
  {
    value: "normal",
    label: "Normal",
    description: "Factuel et neutre pour la majorité des conversations.",
  },
  {
    value: "custom",
    label: "Personnalisé",
    description:
      "Réponds aux simulations afin de générer un ton personnalisé",
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

type FieldGroupId = "essential" | "optimize" | "advanced";

const FIELD_GROUPS: { id: FieldGroupId; label: string; collapsible: boolean; keys: string[] }[] = [
  { id: "essential", label: "Essentiel", collapsible: false, keys: ["product_name", "context", "stopped_condition"] },
  { id: "optimize", label: "Optimiser l'agent", collapsible: true, keys: ["qualification", "tone"] },
  { id: "advanced", label: "Paramètres avancés", collapsible: true, keys: ["activation_time"] },
];

const REQUIRED_DETAIL_KEYS = ["product_name", "context", "stopped_condition"];

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
  const initialSelectedAgentId = navigationState?.agent
    ? getAgentTabId(navigationState.agent)
    : initialTabs[0]
    ? getAgentTabId(initialTabs[0])
    : undefined;
  const [tabs, setTabs] = useState<AgentInfo[]>(initialTabs);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    initialSelectedAgentId
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
    return undefined;
  }, [displayedAgents, selectedAgentId, tabs]);

  const activeTabId = selectedAgent ? getAgentTabId(selectedAgent) : undefined;
  const [isRenamingAgent, setIsRenamingAgent] = useState(false);
  const [agentRenameValue, setAgentRenameValue] = useState("");
  const [agentRenameError, setAgentRenameError] = useState("");
  const [isAgentRenaming, setIsAgentRenaming] = useState(false);

  // UI state
  type TabId = "agent" | "canaux" | "templates" | "voix" | "automatisations" | "avance";
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const [headerSwitchOn, setHeaderSwitchOn] = useState(false);
  
  // État de la sidebar pour ajuster l'overlay
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("leadcontrol.navCollapsed") === "true";
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const collapsed = window.localStorage.getItem("leadcontrol.navCollapsed") === "true";
      setIsSidebarCollapsed(collapsed);
    };

    window.addEventListener("storage", handleStorageChange);
    
    // Vérifier périodiquement le localStorage car l'événement storage ne se déclenche pas toujours
    const interval = setInterval(handleStorageChange, 100);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);



  // Etat de la popup “Details”
  const [contextText, setContextText] = useState("");
  const [contextPdf, setContextPdf] = useState<File | null>(null);
  const [contextPdfError, setContextPdfError] = useState<string | undefined>(
    undefined
  );
  const [tone, setTone] = useState<ToneOption>("normal");
  const [customToneModalOpen, setCustomToneModalOpen] =
    useState<boolean>(false);
  const [customToneAnswers, setCustomToneAnswers] =
    useState<CustomToneAnswers>(() => createDefaultCustomToneAnswers());
  const [customToneStatus, setCustomToneStatus] =
    useState<CustomToneStatus>("idle");
  const [customToneGeneratedPrompt, setCustomToneGeneratedPrompt] =
    useState("");
  const [customToneLastGeneratedAt, setCustomToneLastGeneratedAt] =
    useState<string | null>(null);
  const [customToneError, setCustomToneError] = useState<string | null>(null);
  const [showWASelector, setShowWASelector] = useState(false);
  const waSelectorAnchorRef = useRef<HTMLDivElement | null>(null);
  const [customToneValidationErrors, setCustomToneValidationErrors] =
    useState<Partial<Record<CustomToneKey, string>>>({});
  const [isGeneratingCustomTone, setIsGeneratingCustomTone] =
    useState(false);
  const [showToneErrors, setShowToneErrors] = useState(false);
  const [touchedQuestions, setTouchedQuestions] = useState<
    Record<CustomToneKey, boolean>
  >(() =>
    CUSTOM_TONE_QUESTIONS.reduce(
      (acc, question) => ({ ...acc, [question.key]: false }),
      {} as Record<CustomToneKey, boolean>
    )
  );
  const [lastGeneratedAnswers, setLastGeneratedAnswers] =
    useState<CustomToneAnswers | null>(null);
  const [activeDays, setActiveDays] = useState<ActiveDays>({
    ...defaultActiveDays,
  });
  const [timeStart, setTimeStart] = useState(defaultTimeRange.start);
  const [timeEnd, setTimeEnd] = useState(defaultTimeRange.end);
  const [stopText, setStopText] = useState("");
  const [stopLink, setStopLink] = useState("");
  const [productName, setProductName] = useState("");
  const [qualification, setQualification] = useState("");
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(() => getDefaultSlots());
  const [errors, setErrors] = useState<DetailErrors>({});
  const [lastSavedDetails, setLastSavedDetails] =
    useState<DetailsSnapshot | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<FieldGroupId>>(new Set<FieldGroupId>(["essential"]));
  const [avgDealValue, setAvgDealValue] = useState<string>("");

  // Voice state
  type VoiceOption = {
    voice_id: string;
    name: string;
    category: string;
    labels: Record<string, string>;
    preview_url: string;
  };
  const [voiceList, setVoiceList] = useState<VoiceOption[]>([]);
  const [voiceListLoading, setVoiceListLoading] = useState(false);
  const [voicePreviewingId, setVoicePreviewingId] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [voiceType, setVoiceType] = useState<"preset" | "cloned" | null>(null);
  const [voiceAutoEnabled, setVoiceAutoEnabled] = useState(false);
  const [voiceTrigger, setVoiceTrigger] = useState<"always" | "first_message" | "on_link_sent">("always");
  // Clone
  const [cloneAudioBlob, setCloneAudioBlob] = useState<Blob | null>(null);
  const [cloneRecording, setCloneRecording] = useState(false);
  const [cloneVoiceName, setCloneVoiceName] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [cloneDragOver, setCloneDragOver] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cloneChunksRef = useRef<Blob[]>([]);

  // Comments (Automatisations) state
  const [commReplyEnabled, setCommReplyEnabled] = useState(false);
  const [commReplyMode, setCommReplyMode] = useState<"always" | "keywords" | "never">("always");
  const [commReplyKeywords, setCommReplyKeywords] = useState<string[]>([]);
  const [commReplyTemplate, setCommReplyTemplate] = useState("");
  const [commDmEnabled, setCommDmEnabled] = useState(false);
  const [commDmMode, setCommDmMode] = useState<"always" | "keywords" | "never">("always");
  const [commDmKeywords, setCommDmKeywords] = useState<string[]>([]);
  const [commDmFirstMessage, setCommDmFirstMessage] = useState("");
  const [commSaveStatus, setCommSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Configuration state
  const [activeSocial, setActiveSocial] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<ConfigValue[]>([]);
  const [initialConfigValues, setInitialConfigValues] = useState<ConfigValue[]>([]);
  const [isConfigLoading, setIsConfigLoading] = useState(false);

  // Templates state
  type WaTemplate = { id: string; name: string; body: string; status: string };
  type Followup = {
    id: string;
    scheduled_at: string;
    status: string;
    template_id: string;
    templateName?: string;
    contactName?: string;
    conversation_id: string;
  };
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const templateBodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (activeTab !== "avance") {
      setActiveSocial(null);
    }
  }, [activeTab]);

  // Détection du retour OAuth Calendly (?calendly_connected=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendly_connected") === "1") {
      setActiveTab("canaux");
      // Nettoyer le param de l'URL sans recharger la page
      params.delete("calendly_connected");
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
      window.history.replaceState(null, "", newUrl);
    }
  }, []);

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

  const handleCloseTab = useCallback(
    (agent: AgentInfo) => {
      const closedTabId = getAgentTabId(agent);
      const nextTabs = tabs.filter(
        (tab) => getAgentTabId(tab) !== closedTabId
      );
      const nextSelectedId =
        selectedAgentId === closedTabId
          ? nextTabs[0]
            ? getAgentTabId(nextTabs[0])
            : undefined
          : selectedAgentId;

      setTabs(nextTabs);
      setSelectedAgentId(nextSelectedId);

      if (nextTabs.length === 0) {
        navigate("/app/agentai", { state: { tabs: [] } });
      }
    },
    [navigate, selectedAgentId, tabs]
  );

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
    if (!selectedAgentId && selectedAgent) {
      setSelectedAgentId(getAgentTabId(selectedAgent));
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    setHeaderSwitchOn(Boolean(selectedAgent?.is_active));
  }, [selectedAgent?.is_active]);

  useEffect(() => {
    if (!selectedAgent) {
      setIsRenamingAgent(false);
      setAgentRenameValue("");
      setAgentRenameError("");
      setIsAgentRenaming(false);
      return;
    }
    setAgentRenameValue(selectedAgent.name);
    setAgentRenameError("");
    setIsRenamingAgent(false);
    setIsAgentRenaming(false);
  }, [selectedAgent?.display_id, selectedAgent?.name]);

  const buildSnapshotFromDetails = useCallback(
    (details: Record<string, any> | undefined): DetailsSnapshot => {
    const savedDays = (details?.activeDays ?? {}) as Partial<ActiveDays>;
    const savedSlots = Array.isArray(details?.timeSlots)
      ? normalizeSavedSlots(details?.timeSlots)
      : undefined;
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
      productName: details?.productName ?? "",
      qualification: details?.qualification ?? "",
      timeSlots: savedSlots,
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
      setProductName("");
      setQualification("");
      setTimeSlots(getDefaultSlots());
      return;
    }
    setContextText(snapshot.contextText);
    setTone(snapshot.tone);
    setActiveDays({ ...snapshot.activeDays });
    setTimeStart(snapshot.timeStart);
    setTimeEnd(snapshot.timeEnd);
    setStopText(snapshot.stopText);
    setStopLink(snapshot.stopLink);
    setProductName(snapshot.productName);
    setQualification(snapshot.qualification);
    setTimeSlots(buildStateSlots(snapshot.timeSlots));
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
    const savedAvgDeal = (selectedAgent.configs as Record<string, any>)?.avg_deal_value;
    setAvgDealValue(savedAvgDeal != null ? String(savedAvgDeal) : "");
    const savedVoice = (selectedAgent.configs as Record<string, any>)?.Voice ?? {};
    setVoiceId(savedVoice.elevenlabs_voice_id ?? null);
    setVoiceName(savedVoice.voice_name ?? null);
    setVoiceType(savedVoice.voice_type ?? null);
    setVoiceAutoEnabled(savedVoice.auto_voice_enabled ?? false);
    setVoiceTrigger(savedVoice.auto_voice_trigger ?? "always");
    const savedComments = (selectedAgent.configs as Record<string, any>)?.Comments ?? {};
    setCommReplyEnabled(savedComments.reply_to_comment_enabled ?? false);
    setCommReplyMode(savedComments.reply_mode ?? "always");
    setCommReplyKeywords(savedComments.reply_keywords ?? []);
    setCommReplyTemplate(savedComments.reply_template ?? "");
    setCommDmEnabled(savedComments.dm_after_comment_enabled ?? false);
    setCommDmMode(savedComments.dm_mode ?? "always");
    setCommDmKeywords(savedComments.dm_keywords ?? []);
    setCommDmFirstMessage(savedComments.dm_first_message ?? "");
    setCommSaveStatus("idle");
  }, [applySnapshot, buildSnapshotFromDetails, selectedAgent]);

  useEffect(() => {
    if (!selectedAgent) {
      setCustomToneAnswers(createDefaultCustomToneAnswers());
      setCustomToneStatus("idle");
      setCustomToneGeneratedPrompt("");
      setCustomToneLastGeneratedAt(null);
      setCustomToneError(null);
      setTouchedQuestions(
        CUSTOM_TONE_QUESTIONS.reduce(
          (acc, question) => ({ ...acc, [question.key]: false }),
          {} as Record<CustomToneKey, boolean>
        )
      );
      setShowToneErrors(false);
      return;
    }
    const savedCustomTone = (
      (selectedAgent.configs as Record<string, any>)?.Details
        ?.custom_tone ?? {}
    ) as {
      answers?: Record<string, string>;
      status?: CustomToneStatus;
      generated_prompt?: string;
      last_generated_at?: string | null;
    };
    if (savedCustomTone.answers) {
      setCustomToneAnswers({
        ...createDefaultCustomToneAnswers(),
        ...Object.fromEntries(
          CUSTOM_TONE_QUESTIONS.map((question) => [
            question.key,
            savedCustomTone.answers?.[question.key] ?? "",
          ])
        ),
      });
    } else {
      setCustomToneAnswers(createDefaultCustomToneAnswers());
    }
    setCustomToneStatus(savedCustomTone.status ?? "idle");
    setCustomToneGeneratedPrompt(savedCustomTone.generated_prompt ?? "");
    setCustomToneLastGeneratedAt(savedCustomTone.last_generated_at ?? null);
    setCustomToneError(null);
  }, [selectedAgent]);

  const handleOpenCustomToneModal = useCallback(() => {
    setCustomToneModalOpen(true);
  }, []);

  const handleCloseCustomToneModal = useCallback(() => {
    setCustomToneModalOpen(false);
  }, []);

  useEffect(() => {
    setCustomToneValidationErrors(
      buildCustomToneValidationErrors(customToneAnswers)
    );
  }, [customToneAnswers]);

  useEffect(() => {
    if (!customToneModalOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseCustomToneModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [customToneModalOpen, handleCloseCustomToneModal]);

  const handleCloseDetailsOverlay = useCallback(() => {
    // no-op in tab layout
  }, []);

  const validateForm = useCallback((): DetailErrors => {
    const activeComponents = selectedAgent?.details_component ?? [];
    const nextErrors: DetailErrors = {};
    if (activeComponents.includes("context")) {
      if (!contextText.trim() && !contextPdf) {
        nextErrors.context = "Ajoute du texte ou un PDF pour décrire ton contexte.";
      }
      if (contextPdfError) {
        nextErrors.contextPdf = contextPdfError;
      }
    }
    if (activeComponents.includes("product_name")) {
      if (!productName.trim()) {
        nextErrors.productName = "Ajoute le nom du produit.";
      }
    }
    if (activeComponents.includes("stopped_condition")) {
      const trimmedStopText = stopText.trim();
      if (!trimmedStopText) {
        nextErrors.stopText = "Décris ce qui doit déclencher l’arrêt.";
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
        if (!trimmedStopText) {
          nextErrors.stopText =
            "Décris le rôle du lien pour que l’agent sache quand s’arrêter.";
        }
      }
    }
    if (activeComponents.includes("activation_time")) {
      const startMinutes = toMinutes(timeStart);
      const endMinutes = toMinutes(timeEnd);
      if (startMinutes >= endMinutes) {
        nextErrors.timeRange =
          "L’horaire de début doit être antérieur à l’horaire de fin.";
      }
      if (timeSlots.length > 0 && startMinutes < endMinutes) {
        for (const slot of timeSlots) {
          if (!isValidTimeFormat(slot.time)) {
            nextErrors.timeSlots =
              "Utilise un format 24h (HH:MM) pour l’heure du créneau.";
            break;
          }
          const slotStart = toMinutes(slot.time);
          const slotEnd = slotStart + slot.durationMinutes;
          if (slot.durationMinutes <= 0) {
            nextErrors.timeSlots =
              "Chaque créneau doit avoir un intervalle supérieur à 0 minute.";
            break;
          }
          if (slotStart < startMinutes || slotStart > endMinutes) {
            nextErrors.timeSlots =
              "Le créneau doit rester dans la plage horaire définie.";
            break;
          }
          if (slotEnd > endMinutes) {
            nextErrors.timeSlots =
              "Le créneau + intervalle ne doit pas dépasser la plage horaire.";
            break;
          }
        }
      }
    }
    return nextErrors;
  }, [
    selectedAgent,
    contextText,
    contextPdf,
    contextPdfError,
    activeDays,
    timeStart,
    timeEnd,
    stopText,
    stopLink,
    productName,
    timeSlots,
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
    if (!CONTEXT_PDF_UPLOAD_ENABLED) {
      event.target.value = "";
      return;
    }
    handleFileSelection(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handlePdfDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!CONTEXT_PDF_UPLOAD_ENABLED) {
      return;
    }
    if (event.dataTransfer.files.length > 0) {
      handleFileSelection(event.dataTransfer.files[0]);
    }
  };

  const toggleDay = (day: keyof ActiveDays) => {
    setActiveDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  const handleAddTimeSlot = useCallback(() => {
    setTimeSlots((prev) => {
      const baseTime = prev[prev.length - 1]?.time ?? timeStart;
      return [
        ...prev,
        createTimeSlot({
          time: baseTime,
          durationMinutes: 30,
        }),
      ];
    });
  }, [timeStart]);

  const handleRemoveTimeSlot = useCallback((slotId: string) => {
    setTimeSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  }, []);

  const handleSlotTimeChange = useCallback((slotId: string, value: string) => {
    setTimeSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              time: value,
            }
          : slot
      )
    );
  }, []);

  const handleSlotDurationChange = useCallback(
    (slotId: string, value: string) => {
      const parsed = Number(value);
      const duration = Number.isNaN(parsed) ? 0 : Math.max(1, Math.round(parsed));
      setTimeSlots((prev) =>
        prev.map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                durationMinutes: duration,
              }
            : slot
        )
      );
    },
    []
  );

  const handleToneSelectionChange = useCallback(
    (nextTone: ToneOption) => {
      setTone(nextTone);
      if (nextTone === "custom") {
        setCustomToneModalOpen(true);
      }
      setShowToneErrors(false);
    },
    []
  );

  const handleQuestionTouch = useCallback((key: CustomToneKey) => {
    setTouchedQuestions((prev) => ({ ...prev, [key]: true }));
  }, []);

  const handleCustomToneAnswerChange = useCallback(
    (key: CustomToneKey, value: string) => {
      setCustomToneAnswers((prev) => ({ ...prev, [key]: value }));
      setCustomToneStatus("idle");
      setCustomToneGeneratedPrompt("");
      setCustomToneLastGeneratedAt(null);
      handleQuestionTouch(key);
    },
    [handleQuestionTouch]
  );

  // ------------------------------CONNEXIONS---------------------------------
  const [activePopup, setActivePopup] = useState<Window | null>(null);
  const {
    connectorAvailable,
    connectorConnected,
    availableShow,
    countAvailableConnector,
    countConnectedConnector,
    isLoaded: connectorsLoaded,
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
    if (!Array.isArray(items)) {
      console.warn("collectRequiredConfigIds: items is not an array", items);
      return [];
    }
    const ids: string[] = [];
    const visit = (entries: ConfigItem[]) => {
      if (!Array.isArray(entries)) {
        console.warn("collectRequiredConfigIds visit: entries is not an array", entries);
        return;
      }
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
      const configItems = Array.isArray(blueprint.config_agent_connector) 
        ? blueprint.config_agent_connector as ConfigItem[]
        : [];
      return checkMissing(configItems, savedValues);
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

  const tabLocked = useMemo<Record<TabId, boolean>>(() => {
    const agentOk = areDetailsFilled;
    const canauxOk = agentOk && (!hasAnyConnectors || hasActiveConnection);
    return {
      agent: false,
      canaux: !agentOk,
      templates: !agentOk,
      automatisations: !agentOk,
      voix: !agentOk,
      avance: !canauxOk,
    };
  }, [areDetailsFilled, hasAnyConnectors, hasActiveConnection]);

  const isConfigSectionAvailable = !tabLocked.avance;
  const isHeaderSwitchDisabled = !isConfigSectionAvailable;
  const displayedHeaderSwitchChecked = !connectorsLoaded
    ? Boolean(selectedAgent?.is_active)
    : isHeaderSwitchDisabled
      ? false
      : headerSwitchOn;

  useEffect(() => {
    if (!connectorsLoaded || !isHeaderSwitchDisabled || !headerSwitchOn || !selectedAgent?.display_id) {
      return;
    }
    setHeaderSwitchOn(false);
    supabase
      .from("agent_configs")
      .update({ is_active: false })
      .eq("configs_id", selectedAgent.display_id)
      .then(({ error }) => {
        if (error) {
          console.error(error);
        } else {
          refreshDisplayedAgents();
        }
      });
  }, [connectorsLoaded, isHeaderSwitchDisabled, headerSwitchOn, selectedAgent?.display_id, refreshDisplayedAgents]);

  const trimmedRenameValue = agentRenameValue.trim();
  const normalizeName = (value: string) =>
    value.replace(/\s+/g, "").toLowerCase();
  const hasChangedName =
    Boolean(selectedAgent) &&
    trimmedRenameValue !== (selectedAgent?.name.trim() ?? "");
  const hasDuplicateName =
    Boolean(trimmedRenameValue) &&
    displayedAgents.some((agent) => {
      if (agent.display_id === selectedAgent?.display_id) {
        return false;
      }
      const candidate = agent.name.trim();
      return normalizeName(candidate) === normalizeName(trimmedRenameValue);
    });
  const renameValidationError =
    !trimmedRenameValue
      ? "Le nom ne peut pas être vide."
      : trimmedRenameValue.length > AGENT_NAME_MAX_LENGTH
      ? `Le nom doit faire ${AGENT_NAME_MAX_LENGTH} caractères maximum.`
      : hasDuplicateName
      ? "Un agent porte déjà ce nom ou un nom similaire."
      : "";
  const canSaveRename =
    Boolean(trimmedRenameValue) &&
    !renameValidationError &&
    hasChangedName &&
    !isAgentRenaming;
  const displayedRenameError =
    isRenamingAgent && renameValidationError
      ? renameValidationError
      : agentRenameError;

  const handleStartRenaming = useCallback(() => {
    if (!selectedAgent) {
      return;
    }
    setAgentRenameValue(selectedAgent.name);
    setAgentRenameError("");
    setIsRenamingAgent(true);
  }, [selectedAgent]);

  const handleCancelRenaming = useCallback(() => {
    setIsRenamingAgent(false);
    setAgentRenameValue(selectedAgent?.name ?? "");
    setAgentRenameError("");
  }, [selectedAgent?.name]);

  const handleSubmitRenaming = useCallback(async () => {
    if (!selectedAgent?.display_id) {
      return;
    }
    if (renameValidationError) {
      setAgentRenameError(renameValidationError);
      return;
    }
    if (!hasChangedName) {
      setIsRenamingAgent(false);
      setAgentRenameError("");
      return;
    }

    setIsAgentRenaming(true);
    setAgentRenameError("");
    const nextName = trimmedRenameValue.slice(0, AGENT_NAME_MAX_LENGTH);
    try {
      const { error } = await supabase
        .from("agent_configs")
        .update({ name_modif: nextName })
        .eq("configs_id", selectedAgent.display_id);

      if (error) {
        console.error(error);
        setAgentRenameError("Impossible de renommer l’agent pour le moment.");
        return;
      }

      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          getAgentTabId(tab) === selectedAgentId ? { ...tab, name: nextName } : tab
        )
      );
      await refreshDisplayedAgents();
      setIsRenamingAgent(false);
      setAgentRenameError("");
    } finally {
      setIsAgentRenaming(false);
    }
  }, [
    hasChangedName,
    refreshDisplayedAgents,
    renameValidationError,
    selectedAgent?.display_id,
    selectedAgentId,
    trimmedRenameValue,
  ]);

  const handleRenameKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSubmitRenaming();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelRenaming();
      }
    },
    [handleCancelRenaming, handleSubmitRenaming]
  );

  /** Mise à jour locale des valeurs (en réponse au composant DynamicConfig). */
  const handleConfigChange = (values: ConfigValue[]) => {
    setConfigValues(values);
  };

  const getTrimmedCustomToneAnswers = useCallback(() => {
    return CUSTOM_TONE_QUESTIONS.reduce(
      (acc, question) => ({
        ...acc,
        [question.key]: customToneAnswers[question.key]?.trim() ?? "",
      }),
      {} as CustomToneAnswers
    );
  }, [customToneAnswers]);

  const handleGenerateCustomTone = useCallback(async () => {
    const validation = buildCustomToneValidationErrors(customToneAnswers);
    setCustomToneValidationErrors(validation);
    if (Object.values(validation).some(Boolean)) {
      setCustomToneError(
        "Chaque réponse doit contenir entre 200 et 900 caractères."
      );
      return;
    }
    setShowToneErrors(true);
    setTouchedQuestions((prev) =>
      CUSTOM_TONE_QUESTIONS.reduce(
        (acc, question) => ({ ...acc, [question.key]: true }),
        {} as Record<CustomToneKey, boolean>
      )
    );
    if (!selectedAgent) {
      setCustomToneError("Impossible de générer le ton pour le moment.");
      return;
    }
    const configId =
      selectedAgent.display_id ??
      selectedAgent.agent_id ??
      selectedAgent.id ??
      "";
    if (!configId) {
      setCustomToneError("Impossible de générer le ton pour le moment.");
      return;
    }
    const answersPayload = getTrimmedCustomToneAnswers();
    setIsGeneratingCustomTone(true);
    setCustomToneError(null);
    setCustomToneStatus("processing");
    try {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        message?: string;
        status?: string;
        generated_prompt?: string;
      }>("generate-custom-tone", {
        body: {
          config_id: configId,
          answers: answersPayload,
        },
      });
      if (error) {
        throw error;
      }
      if (!data?.success) {
        throw new Error(data?.message ?? "La génération du ton a échoué.");
      }
      setCustomToneStatus(data.status === "configured" ? "configured" : "processing");
      if (typeof data.generated_prompt === "string") {
        setCustomToneGeneratedPrompt(data.generated_prompt);
        setCustomToneLastGeneratedAt(new Date().toISOString());
        setLastGeneratedAnswers(answersPayload);
      }
      await refreshDisplayedAgents();
      setCustomToneStatus("configured");
      setShowToneErrors(false);
    } catch (generationError) {
      console.error("Erreur génération ton personnalisé", generationError);
      setCustomToneStatus("failed");
      setCustomToneError(
        generationError instanceof Error
          ? generationError.message
          : "Une erreur est survenue, veuillez réessayer ultérieurement."
      );
    } finally {
      setIsGeneratingCustomTone(false);
    }
  }, [
    customToneAnswers,
    getTrimmedCustomToneAnswers,
    refreshDisplayedAgents,
    selectedAgent,
  ]);

  const trimmedCustomToneAnswers = useMemo(
    () => getTrimmedCustomToneAnswers(),
    [getTrimmedCustomToneAnswers]
  );

  const hasValidCustomToneAnswers = useMemo(
    () => !Object.values(customToneValidationErrors).some(Boolean),
    [customToneValidationErrors]
  );

  const answersChangedSinceGeneration = useMemo(() => {
    if (!lastGeneratedAnswers) {
      return false;
    }
    return CUSTOM_TONE_QUESTIONS.some((question) => {
      const previous = lastGeneratedAnswers[question.key] ?? "";
      const current = trimmedCustomToneAnswers[question.key] ?? "";
      return previous !== current;
    });
  }, [lastGeneratedAnswers, trimmedCustomToneAnswers]);

  const toneStatus = useMemo<ToneStatus>(() => {
    if (tone !== "custom") {
      return "idle";
    }
    if (customToneStatus === "configured" && customToneGeneratedPrompt) {
      return answersChangedSinceGeneration ? "modified" : "configured";
    }
    const allAnswered = CUSTOM_TONE_QUESTIONS.every((question) => {
      const value = trimmedCustomToneAnswers[question.key] ?? "";
      return value.length >= 200 && value.length <= 900;
    });
    if (allAnswered && hasValidCustomToneAnswers) {
      return "answers_saved";
    }
    return "fallback_to_normal";
  }, [
    tone,
    customToneStatus,
    customToneGeneratedPrompt,
    answersChangedSinceGeneration,
    hasValidCustomToneAnswers,
    trimmedCustomToneAnswers,
  ]);

  const selectedToneLabel = useMemo(() => {
    return toneOptions.find((option) => option.value === tone)?.label ?? "Normal";
  }, [tone]);

  const activeToneDescription = useMemo(() => {
    if (tone !== "custom") {
      return `${selectedToneLabel} (actif)`;
    }
    if (toneStatus === "configured" && customToneLastGeneratedAt) {
      const formattedDate = new Date(customToneLastGeneratedAt).toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      return `Ton personnalisé généré le ${formattedDate}`;
    }
    if (toneStatus === "modified") {
      return "Ton personnalisé prêt, régénération recommandée.";
    }
    if (toneStatus === "answers_saved") {
      return "Ton personnalisé prêt à être généré.";
    }
    return "Ton Normal (utilisé tant que le ton personnalisé n’est pas généré).";
  }, [tone, toneStatus, selectedToneLabel, customToneLastGeneratedAt]);
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
      const rawArray = Array.isArray(raw) ? raw : [];
      const parsed = rawArray.map((item: { id: string; value: any }) => ({
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
    if (activeTab === "avance") {
      fetchSavedConfig();
    }
  }, [activeTab, fetchSavedConfig]);

  // Charger les voix ElevenLabs à l'ouverture du panneau Details
  useEffect(() => {
    if (activeTab !== "voix" || voiceList.length > 0) return;
    setVoiceListLoading(true);
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) { setVoiceListLoading(false); return; }
      fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/generate-voice-message/list-voices", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((json) => setVoiceList(json.voices ?? []))
        .catch(console.error)
        .finally(() => setVoiceListLoading(false));
    });
  }, [activeTab, voiceList.length]);

  const buildPayload = () => configValues.map(({ id, value }) => ({ id, value }));

  const handleSaveCalendlyEventType = async (uri: string) => {
    if (!selectedAgent?.display_id) return;
    const { error } = await supabase
      .from("agent_configs")
      .update({
        configs: {
          ...selectedAgent.configs,
          Connexions: {
            ...selectedAgent.configs.Connexions,
            calendly_event_type_uri: uri,
          },
        },
      })
      .eq("configs_id", selectedAgent.display_id);
    if (error) {
      console.error("Erreur sauvegarde Calendly event type", error);
    } else {
      refreshDisplayedAgents();
    }
  };

  // ─── Templates & Followups ──────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("whatsapp_templates")
      .select("id, name, body, status")
      .order("created_at", { ascending: false });
    setWaTemplates((data ?? []) as any[]);
  }, []);

  const fetchFollowups = useCallback(async () => {
    if (!selectedAgent?.display_id) return;
    const { data } = await supabase
      .from("followup_sequences")
      .select("id, scheduled_at, status, template_id, conversation_id, whatsapp_templates(name), conversations(contact_display_name, contact_handle)")
      .eq("agent_config_id", selectedAgent.display_id)
      .neq("status", "sent")
      .order("scheduled_at", { ascending: true });
    const mapped = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      scheduled_at: row.scheduled_at,
      status: row.status,
      template_id: row.template_id,
      templateName: row.whatsapp_templates?.name ?? "—",
      contactName: row.conversations?.contact_display_name ?? row.conversations?.contact_handle ?? "—",
      conversation_id: String(row.conversation_id),
    }));
    setFollowups(mapped);
  }, [selectedAgent?.display_id]);

  useEffect(() => {
    if (activeTab === "avance" || activeTab === "templates") {
      fetchTemplates();
      fetchFollowups();
    }
  }, [activeTab, fetchTemplates, fetchFollowups]);

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateBody.trim()) return;
    setIsCreatingTemplate(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsCreatingTemplate(false); return; }
    const { error } = await supabase.from("whatsapp_templates").insert({
      user_id: user.id,
      agent_config_id: selectedAgent?.display_id ?? null,
      name: newTemplateName.trim(),
      body: newTemplateBody.trim(),
      status: "pending",
    });
    setIsCreatingTemplate(false);
    if (!error) {
      setIsTemplateModalOpen(false);
      setNewTemplateName("");
      setNewTemplateBody("");
      fetchTemplates();
    }
  };

  const handleCancelFollowup = async (followupId: string) => {
    await supabase
      .from("followup_sequences")
      .update({ status: "cancelled" })
      .eq("id", followupId);
    fetchFollowups();
  };

  const insertVariable = (variable: string) => {
    const textarea = templateBodyRef.current;
    if (!textarea) {
      setNewTemplateBody((prev) => prev + variable);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue =
      newTemplateBody.slice(0, start) + variable + newTemplateBody.slice(end);
    setNewTemplateBody(newValue);
    setTimeout(() => {
      textarea.selectionStart = start + variable.length;
      textarea.selectionEnd = start + variable.length;
      textarea.focus();
    }, 0);
  };

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
      productName: productName.trim(),
      qualification: qualification.trim(),
      timeSlots: timeSlots.map(({ time, durationMinutes }) => ({
        time,
        durationMinutes,
      })),
    }),
    [
      contextText,
      tone,
      activeDays,
      timeStart,
      timeEnd,
      stopText,
      stopLink,
      productName,
      qualification,
      timeSlots,
    ]
  );

  const hasValidationErrors = Object.values(errors).some(Boolean);
  const hasCustomToneValidationErrors = useMemo(
    () => Object.values(customToneValidationErrors).some(Boolean),
    [customToneValidationErrors]
  );

  // ------------------------------DETAILS GROUP UI---------------------------------
  const detailsComponents = selectedAgent?.details_component ?? [];

  const activeGroups = useMemo(() =>
    FIELD_GROUPS
      .map(g => ({ ...g, activeKeys: g.keys.filter(k => detailsComponents.includes(k)) }))
      .filter(g => g.activeKeys.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailsComponents.join(",")]
  );

  const keyHasError = useCallback((key: string): boolean => {
    switch (key) {
      case "product_name": return Boolean(errors.productName);
      case "context": return Boolean(errors.context || errors.contextPdf);
      case "stopped_condition": return Boolean(errors.stopText || errors.stopLink);
      case "activation_time": return Boolean(errors.timeRange || errors.timeSlots);
      default: return false;
    }
  }, [errors]);

  const missingRequiredCount = useMemo(() =>
    REQUIRED_DETAIL_KEYS
      .filter(k => detailsComponents.includes(k))
      .filter(k => {
        if (k === "product_name") return !productName.trim();
        if (k === "context") return !contextText.trim() && !contextPdf;
        if (k === "stopped_condition") return !stopText.trim();
        return false;
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailsComponents.join(","), productName, contextText, contextPdf, stopText]
  );

  const tabIncomplete: Record<TabId, boolean> = {
    agent: missingRequiredCount > 0 || hasValidationErrors,
    canaux: hasAnyConnectors && !hasActiveConnection,
    templates: false,
    automatisations: false,
    voix: false,
    avance: hasGlobalMissingRequiredConfig,
  };

  const tabComplete: Record<TabId, boolean> = {
    agent: !tabIncomplete.agent && areDetailsFilled,
    canaux: !tabIncomplete.canaux && hasActiveConnection,
    templates: waTemplates.length > 0,
    automatisations: false,
    voix: Boolean(voiceId),
    avance: !tabIncomplete.avance && isConfigSectionAvailable,
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!lastSavedDetails) return false;
    const current = getCurrentDetailsSnapshot();
    return JSON.stringify(current) !== JSON.stringify(lastSavedDetails);
  }, [lastSavedDetails, getCurrentDetailsSnapshot]);

  const toggleGroup = useCallback((id: FieldGroupId) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const groupsToOpen = FIELD_GROUPS
      .filter(g => g.collapsible)
      .filter(g => g.keys.some(k => detailsComponents.includes(k) && keyHasError(k)))
      .map(g => g.id);
    if (groupsToOpen.length > 0) {
      setOpenGroups(prev => {
        const next = new Set(prev);
        groupsToOpen.forEach(id => next.add(id));
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  // ------------------------------PROMPT---------------------------------
  /**
   * Sauvegarde les champs “Details” (prompt + contexte) dans Supabase.
   */
  const handleSaveComments = async () => {
    if (!selectedAgent) return;
    setCommSaveStatus("saving");
    const { error } = await supabase.from("agent_configs").update({
      configs: {
        ...selectedAgent.configs,
        Comments: {
          reply_to_comment_enabled: commReplyEnabled,
          reply_mode: commReplyMode,
          reply_keywords: commReplyKeywords,
          reply_template: commReplyTemplate,
          dm_after_comment_enabled: commDmEnabled,
          dm_mode: commDmMode,
          dm_keywords: commDmKeywords,
          dm_first_message: commDmFirstMessage,
        },
      },
    }).eq("configs_id", selectedAgent.display_id);
    if (error) {
      setCommSaveStatus("error");
    } else {
      setCommSaveStatus("saved");
      setTimeout(() => setCommSaveStatus("idle"), 2500);
    }
  };

  const handleSaveVoiceSelection = async (voice: VoiceOption) => {
    if (!selectedAgent) return;
    const currentVoice = (selectedAgent.configs as Record<string, any>)?.Voice ?? {};
    const { error } = await supabase.from("agent_configs").update({
      configs: {
        ...selectedAgent.configs,
        Voice: {
          ...currentVoice,
          elevenlabs_voice_id: voice.voice_id,
          voice_name: voice.name,
          voice_type: "preset",
        },
      },
    }).eq("configs_id", selectedAgent.display_id);
    if (!error) {
      setVoiceId(voice.voice_id);
      setVoiceName(voice.name);
      setVoiceType("preset");
    }
  };

  const handlePlayVoicePreview = (previewUrl: string, id: string) => {
    if (voicePreviewingId === id) {
      voicePreviewAudioRef.current?.pause();
      voicePreviewAudioRef.current = null;
      setVoicePreviewingId(null);
      return;
    }
    voicePreviewAudioRef.current?.pause();
    const audio = new Audio(previewUrl);
    voicePreviewAudioRef.current = audio;
    setVoicePreviewingId(id);
    audio.play().catch(console.error);
    audio.onended = () => setVoicePreviewingId(null);
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      cloneChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) cloneChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(cloneChunksRef.current, { type: "audio/webm" });
        setCloneAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setCloneRecording(true);
    } catch (err) {
      console.error("Microphone inaccessible", err);
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setCloneRecording(false);
  };

  const handleCloneDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setCloneDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && ["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm", "audio/x-m4a"].includes(file.type)) {
      setCloneAudioBlob(file);
    }
  };

  const handleCloneVoice = async () => {
    if (!cloneAudioBlob || !cloneVoiceName.trim() || !selectedAgent) return;
    setIsCloning(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setIsCloning(false); return; }
    const reader = new FileReader();
    reader.readAsDataURL(cloneAudioBlob);
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/clone-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            audio_base64: base64,
            voice_name: cloneVoiceName.trim(),
            agent_config_id: selectedAgent.display_id,
          }),
        });
        const json = await res.json();
        if (json.ok) {
          setVoiceId(json.voice_id);
          setVoiceName(json.voice_name);
          setVoiceType("cloned");
          setCloneAudioBlob(null);
          setCloneVoiceName("");
        }
      } catch (err) {
        console.error("Erreur clone voix", err);
      }
      setIsCloning(false);
    };
  };

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
    const trimmedCustomToneAnswers = getTrimmedCustomToneAnswers();
    const customTonePayload =
      tone === "custom"
        ? {
            status: customToneStatus,
            answers: trimmedCustomToneAnswers,
            generated_prompt:
              customToneStatus === "configured"
                ? customToneGeneratedPrompt
                : "",
            last_generated_at:
              customToneStatus === "configured"
                ? customToneLastGeneratedAt
                : null,
          }
        : undefined;
    const snapshot = getCurrentDetailsSnapshot();
    const { error } = await supabase
      .from("agent_configs")
      .update({
        configs: {
          ...selectedAgent.configs,
          avg_deal_value: avgDealValue !== "" ? parseFloat(avgDealValue) : null,
          Voice: {
            ...((selectedAgent.configs as Record<string, any>)?.Voice ?? {}),
            auto_voice_enabled: voiceAutoEnabled,
            auto_voice_trigger: voiceTrigger,
            voice_rules: (selectedAgent.configs as Record<string, any>)?.Voice?.voice_rules ?? [],
          },
          Details: {
            ...selectedAgent.configs.Details,
            context: contextText,
            tone,
            activeDays: Object.fromEntries(dayLabels.map((d) => [d.key, true])),
            timeStart,
            timeEnd,
            stopText,
            stopLink: stopLink.trim(),
            productName: snapshot.productName,
            qualification: snapshot.qualification,
            timeSlots: snapshot.timeSlots,
            timezone: "Europe/Paris",
            schedule_version: (typeof selectedAgent.configs.Details?.schedule_version === "number" 
              ? selectedAgent.configs.Details.schedule_version 
              : 0) + 1,
            ...(customTonePayload ? { custom_tone: customTonePayload } : {}),
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
    setActiveTab("canaux");
  };

  const renderDetailsSection = (key: string, step: number): React.ReactNode => {
    const stepLabel = String(step).padStart(2, "0");
    switch (key) {
      case "context":
        return (
          <section className={styles.modalSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionStep}>{stepLabel}</span>
              <h4 className={styles.sectionTitle}>Contexte</h4>
            </div>
            <p className={styles.sectionDescription}>
              Décris ton produit ou service en détail pour que l'agent puisse répondre à toutes les questions des prospects sur ton offre.
            </p>
            <textarea
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
              placeholder="Exemple : Mon produit est une formation en ligne sur le dropshipping à 497€. Elle comprend 25 modules vidéo, un groupe privé Discord, 3 sessions de coaching en live par mois, et un accès à vie. Les avantages principaux sont : méthode testée sur +1000 élèves, accompagnement personnalisé, garantie remboursé 30j. Le processus : appel découverte gratuit de 30min → présentation de l'offre → paiement en 1x ou 3x sans frais."
              className={styles.contextTextarea}
              rows={8}
            />
            <div className={styles.pdfSection} style={{ display: "none" }}>
              <h5 className={styles.pdfSectionTitle}>Documentation complémentaire</h5>
              <p className={styles.pdfSectionDescription}>
                Importez un PDF avec des informations détaillées que l'agent pourra consulter (brochure produit, FAQ, etc.).
              </p>
              <div className={styles.dropzoneWrapper}>
                <label
                  htmlFor="contextPdfInput"
                  className={`${styles.dropzone} ${!CONTEXT_PDF_UPLOAD_ENABLED ? styles.dropzoneDisabled : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handlePdfDrop}
                  aria-disabled={!CONTEXT_PDF_UPLOAD_ENABLED}
                >
                  <span>
                    {CONTEXT_PDF_UPLOAD_ENABLED
                      ? "Importer un PDF (max 20 Mo)"
                      : "Importer un PDF (Bientôt disponible)"}
                  </span>
                </label>
                <input
                  id="contextPdfInput"
                  type="file"
                  accept="application/pdf"
                  className={styles.dropzoneInput}
                  onChange={handlePdfInputChange}
                  disabled={!CONTEXT_PDF_UPLOAD_ENABLED}
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
            </div>
          </section>
        );
      case "product_name":
        return (
          <section className={styles.modalSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionStep}>{stepLabel}</span>
              <h4 className={styles.sectionTitle}>Produit</h4>
            </div>
            <p className={styles.sectionDescription}>
              Nom du produit ou service que cet agent représente.
            </p>
            <input
              type="text"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Nom du produit"
              className={styles.detailsInput}
            />
            {errors.productName && (
              <p className={styles.fieldError}>{errors.productName}</p>
            )}
          </section>
        );
      case "activation_time":
        return (
          <section className={styles.modalSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionStep}>{stepLabel}</span>
              <h4 className={styles.sectionTitle}>Horaires d'activation</h4>
            </div>
            <p className={styles.sectionDescription}>
              Définissez les jours et créneaux horaires où l'agent sera actif pour répondre aux prospects.
            </p>
            <div className={styles.scheduleSubsection} style={{ display: "none" }}>
              <h5 className={styles.subsectionTitle}>Jours actifs</h5>
              <div className={styles.dayChips}>
                {dayLabels.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    className={`${styles.dayChip} ${activeDays[day.key] ? styles.dayChipActive : ""}`}
                    aria-pressed={activeDays[day.key]}
                    onClick={() => toggleDay(day.key)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.scheduleSubsection}>
              <div className={styles.timeInputGroup}>
                <div className={styles.timeField}>
                  <label htmlFor="timeStart">De</label>
                  <input
                    id="timeStart"
                    type="time"
                    value={timeStart}
                    onChange={(event) => setTimeStart(event.target.value)}
                    className={styles.timeInput}
                  />
                </div>
                <div className={styles.timeField}>
                  <label htmlFor="timeEnd">À</label>
                  <input
                    id="timeEnd"
                    type="time"
                    value={timeEnd}
                    onChange={(event) => setTimeEnd(event.target.value)}
                    className={styles.timeInput}
                  />
                </div>
              </div>
            </div>
            <div className={styles.scheduleSubsection}>
              <div className={styles.slotSectionHeader}>
                <h5 className={styles.subsectionTitle}>Créneaux spécifiques</h5>
                <span className={styles.subsectionOptional}>optionnel</span>
              </div>
              <div className={styles.slotSection}>
                <div className={styles.slotHeader}>
                  <span className={styles.slotHeaderLabel}>Créneaux d'activation</span>
                  <button
                    type="button"
                    className={styles.slotAddButton}
                    onClick={handleAddTimeSlot}
                  >
                    Ajouter un créneau
                  </button>
                </div>
                <div className={styles.slotList}>
                  {timeSlots.map((slot, slotIndex) => (
                    <div key={slot.id} className={styles.slotRow}>
                      <div className={styles.slotFieldGroup}>
                        <label className={styles.fieldLabel}>
                          Heure (créneau {slotIndex + 1})
                        </label>
                        <input
                          type="text"
                          pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
                          value={slot.time}
                          placeholder="HH:MM"
                          inputMode="numeric"
                          onChange={(event) =>
                            handleSlotTimeChange(slot.id, event.target.value)
                          }
                          className={styles.timeInput}
                        />
                      </div>
                      <div className={styles.slotFieldGroup}>
                        <label className={styles.fieldLabel}>
                          Intervalle (minutes)
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={5}
                          value={slot.durationMinutes}
                          onChange={(event) =>
                            handleSlotDurationChange(slot.id, event.target.value)
                          }
                          className={styles.detailsInput}
                        />
                      </div>
                      <button
                        type="button"
                        className={styles.slotRemoveButton}
                        onClick={() => handleRemoveTimeSlot(slot.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
                <p className={styles.slotHelper}>
                  {timeSlots.length > 0 ? (
                    `Le créneau + intervalle doit rester compris entre ${timeStart} et ${timeEnd}.`
                  ) : (
                    <span className={styles.slotFullRange}>
                      L'agent répondra sur toute la plage horaire définie.
                    </span>
                  )}
                </p>
                {errors.timeSlots && (
                  <p className={styles.fieldError}>{errors.timeSlots}</p>
                )}
              </div>
            </div>
            {errors.activeDays && (
              <p className={styles.fieldError}>{errors.activeDays}</p>
            )}
            {errors.timeRange && (
              <p className={styles.fieldError}>{errors.timeRange}</p>
            )}
          </section>
        );
      case "tone":
        return (
          <section className={`${styles.modalSection} ${styles.toneSection}`}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionStep}>{stepLabel}</span>
                <h4 className={styles.sectionTitle}>Ton & Langage</h4>
                <span className={styles.newFeatureBadge}>Nouveau</span>
              </div>
              <p className={styles.sectionDescription}>
                Construis un ton cohérent, le langage est automatiquement inclus.
              </p>
            </div>
            <ToneSelector
              value={tone}
              options={toneOptions}
              onChange={handleToneSelectionChange}
            />
            <div className={styles.languageLine}>
              <span className={styles.languageLabel}>Langage</span>
              <span className={styles.languageValue}>
                Français (automatiquement adapté selon le ton choisi)
              </span>
            </div>
            <div className={styles.toneStateSummary}>
              <div className={styles.toneStateRow}>
                <span className={styles.toneStateLabel}>Ton sélectionné :</span>
                <span className={styles.toneStateValue}>
                  {tone === "custom" ? "Personnalisé" : selectedToneLabel}
                </span>
              </div>
              <div className={styles.toneStateRow}>
                <span className={styles.toneStateLabel}>Agent utilise :</span>
                <span className={styles.toneStateValue}>
                  {activeToneDescription}
                </span>
              </div>
              {tone === "custom" && toneStatus !== "configured" && (
                <p className={styles.toneFallbackNote}>
                  Si le ton personnalisé n'est pas généré, le ton Normal reste
                  actif par défaut.
                </p>
              )}
            </div>
            <div className={styles.toneStatusWrapper}>
              <ToneStatusIndicator
                status={toneStatus}
                lastGenerated={customToneLastGeneratedAt}
                onAction={
                  toneStatus === "idle" ? undefined : handleGenerateCustomTone
                }
                isGenerating={isGeneratingCustomTone}
              />
            </div>
            {tone === "custom" && (
              <Button
                className={styles.customToneActionButton}
                onClick={handleOpenCustomToneModal}
              >
                Modifier les réponses
              </Button>
            )}
          </section>
        );
      case "stopped_condition":
        return (
          <section className={styles.modalSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionStep}>{stepLabel}</span>
                <h4 className={styles.sectionTitle}>Condition d'arrêt</h4>
              </div>
              <p className={styles.sectionDescription}>
                Si vous mettez un lien (ex: Calendly), décrivez à quoi il sert pour que l'agent comprenne quand s'arrêter.
              </p>
            </div>
            <textarea
              value={stopText}
              onChange={(event) => setStopText(event.target.value)}
              placeholder="Décris ce qui doit déclencher l'arrêt."
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
        );
      case "qualification":
        return (
          <section className={styles.modalSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionStep}>{stepLabel}</span>
              <h4 className={styles.sectionTitle}>Qualification</h4>
              <span className={styles.newFeatureBadge}>Bêta</span>
            </div>
            <p className={styles.sectionDescription}>
              Décris les critères que le prospect doit remplir pour que l'agent continue la conversation. Si ce champ est vide, l'agent discutera avec tout le monde.
            </p>
            <textarea
              value={qualification}
              onChange={(event) => setQualification(event.target.value)}
              placeholder="Décris les critères que le prospect doit remplir pour que l'agent continue la conversation (ex : budget minimum, secteur d'activité, localisation...)"
              className={styles.stopTextarea}
              rows={5}
            />
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <div className={styles.rightcomponent}>
        <Header minimal showLogo={false} />
        <div className={styles.tabcomponent}>
          <TabComponent
            label="Mes agents"
            active={false}
            onClick={goToAgentAi}
            iconSrc="/tabComponentNotSelect.svg"
          />
          {tabs.map((agent) => {
            const tabId = getAgentTabId(agent);
            return (
              <TabComponent
                key={tabId}
                label={agent.name.toUpperCase()}
                active={activeTabId === tabId}
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
              <div className={styles.agentNameBlock}>
                {isRenamingAgent ? (
                  <>
                    <div className={styles.renameEditor}>
                      <input
                        className={styles.renameInput}
                        type="text"
                        value={agentRenameValue}
                        onChange={(event) => {
                          setAgentRenameValue(
                            event.target.value.slice(0, AGENT_NAME_MAX_LENGTH)
                          );
                          if (agentRenameError) {
                            setAgentRenameError("");
                          }
                        }}
                        onKeyDown={handleRenameKeyDown}
                        maxLength={AGENT_NAME_MAX_LENGTH}
                        autoFocus
                      />
                      <div className={styles.renameActions}>
                        <button
                          type="button"
                          className={styles.renameSecondaryButton}
                          onClick={handleCancelRenaming}
                          disabled={isAgentRenaming}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className={styles.renamePrimaryButton}
                          onClick={() => {
                            void handleSubmitRenaming();
                          }}
                          disabled={!canSaveRename}
                        >
                          {isAgentRenaming ? "Enregistrement..." : "Enregistrer"}
                        </button>
                      </div>
                    </div>
                    <p className={styles.renameErrorText}>
                      {displayedRenameError || "\u00A0"}
                    </p>
                  </>
                ) : (
                  <div className={styles.agentNameDisplay}>
                    <h2 title={selectedAgent.name.toUpperCase()}>
                      {selectedAgent.name.toUpperCase()}
                    </h2>
                    <button
                      type="button"
                      className={styles.renameAgentButton}
                      onClick={handleStartRenaming}
                    >
                      Renommer
                    </button>
                  </div>
                )}
              </div>
              <SwitchAnimated
                checked={displayedHeaderSwitchChecked}
                onChange={handleHeaderSwitchChange}
                showLabel={false}
                disabled={isHeaderSwitchDisabled}
                className={styles.agentActivationSwitch}
              />
            </div>
          </div>
        )}
        {selectedAgent && (
          <div className={styles.configLayout}>

            {/* ── Tab navigation ── */}
            <nav className={styles.configTabNav}>
              {(["agent","canaux","templates","voix","automatisations","avance"] as TabId[]).map((id) => {
                const labels: Record<TabId, string> = {
                  agent: "Agent",
                  canaux: "Canaux",
                  templates: "Relances",
                  voix: "Voix",
                  automatisations: "Actions",
                  avance: "Avancé",
                };
                const locked = tabLocked[id];
                const incomplete = !locked && tabIncomplete[id];
                const complete = !locked && !incomplete && tabComplete[id];
                return (
                  <button
                    key={id}
                    type="button"
                    title={locked ? "Complétez les étapes précédentes pour accéder à cet onglet" : undefined}
                    className={[
                      styles.configTabBtn,
                      activeTab === id ? styles.configTabBtnActive : "",
                      locked ? styles.configTabBtnLocked : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => { if (!locked) setActiveTab(id); }}
                  >
                    <span className={styles.configTabLabel}>{labels[id]}</span>
                    {incomplete && <span className={styles.configTabAlert}>!</span>}
                    {complete && <span className={styles.configTabCheck}>✓</span>}
                    {locked && <span className={styles.configTabLockDot} />}
                  </button>
                );
              })}
            </nav>

            {/* ── Tab content ── */}
            <div className={styles.configTabContent}>

              {/* ───────────────── AGENT ───────────────── */}
              {activeTab === "agent" && (
                <div className={styles.configTabPanel}>
                  <div className={styles.modalContainer}>
                    {selectedAgent?.details_component?.length ? (
                      activeGroups.map(group => {
                        const isOpen = !group.collapsible || openGroups.has(group.id);
                        const hasError = group.activeKeys.some(k => keyHasError(k));
                        return (
                          <div key={group.id} className={`${styles.detailsGroup} ${hasError ? styles.detailsGroupError : ""}`}>
                            <div
                              className={`${styles.detailsGroupHeader} ${group.collapsible ? styles.detailsGroupHeaderCollapsible : ""}`}
                              onClick={group.collapsible ? () => toggleGroup(group.id) : undefined}
                            >
                              <span className={styles.detailsGroupTitle}>{group.label}</span>
                              <div className={styles.detailsGroupHeaderRight}>
                                {hasError && <span className={styles.detailsGroupErrorDot} />}
                                {group.collapsible && (
                                  <span className={`${styles.detailsGroupChevron} ${isOpen ? styles.detailsGroupChevronOpen : ""}`}>›</span>
                                )}
                              </div>
                            </div>
                            <div className={`${styles.detailsGroupBody} ${!isOpen ? styles.detailsGroupBodyClosed : ""}`.trim()}>
                              {group.activeKeys.map((key, index) => (
                                <React.Fragment key={key}>
                                  {renderDetailsSection(key, index + 1)}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className={styles.noConfigMessage}>
                        <p>Bonne nouvelle !</p>
                        <p>Aucune configuration n'est nécessaire pour cet agent.</p>
                      </div>
                    )}

                    {/* Prix moyen de vente */}
                    {selectedAgent && (
                      <div className={styles.detailsGroup}>
                        <div className={styles.detailsGroupHeader}>
                          <span className={styles.detailsGroupTitle}>Vente</span>
                        </div>
                        <div className={styles.detailsGroupBody}>
                          <section className={styles.modalSection}>
                            <div className={styles.sectionHeading}>
                              <h4 className={styles.sectionTitle}>Prix moyen de vente (€)</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              Valeur pré-remplie dans la modal de closing lors du marquage d'une conversation comme clôturée.
                            </p>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={avgDealValue}
                              onChange={(e) => setAvgDealValue(e.target.value)}
                              placeholder="Ex : 497"
                              className={styles.avgDealInput}
                            />
                          </section>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedAgent ? (
                    <div className={styles.modalFooter}>
                      <p className={styles.footerHint}>
                        {!lastSavedDetails
                          ? "Complétez les champs requis"
                          : hasUnsavedChanges
                          ? "Changements non enregistrés"
                          : "Tout est à jour"}
                      </p>
                      <button
                        type="button"
                        className={styles.saveButton}
                        onClick={handleSaveDetails}
                        disabled={hasValidationErrors}
                      >
                        Enregistrer
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* ───────────────── CANAUX ───────────────── */}
              {activeTab === "canaux" && (
                <div className={styles.configTabPanel}>
                  <div className={styles.connexionSections}>
                    <div className={styles.connexionSection}>
                      <h4>Connecté ({countConnectedConnector})</h4>
                      <div className={styles.connexionSectionCards}>
                        {connectorConnected.map((connector) =>
                          connector.connectors_name === "calendly" ? (
                            <CalendlyConnexionCard
                              key={connector.connectors_id}
                              configsId={selectedAgent?.display_id ?? ""}
                              connectorLabel={connector.connector_label ?? ""}
                              metadata={connector.metadata}
                              currentEventTypeUri={
                                (selectedAgent?.configs as Record<string, any>)?.Connexions
                                  ?.calendly_event_type_uri
                              }
                              onDisconnect={connexions["calendly"].onDisconnect}
                              onSaveEventType={handleSaveCalendlyEventType}
                            />
                          ) : (
                            <ConnexionCard
                              key={connector.connectors_id}
                              title={connector.connectors_name.charAt(0).toUpperCase() + connector.connectors_name.slice(1)}
                              description={connector.connector_label ?? ""}
                              imageSrc={connexions[connector.connectors_name].imageSrc}
                              actionLabel="Déconnecter"
                              onAction={connexions[connector.connectors_name].onDisconnect}
                              helpUrl={connector.connectors_name === "whatsapp" ? "https://lautopreneur.notion.site/Connecter-WhatsApp-LeadControl-331392824e1a812c9657d8d56c77c4e7?source=copy_link" : undefined}
                              helpTooltip={connector.connectors_name === "whatsapp" ? "Besoin d'aide pour connecter votre compte WhatsApp ?" : undefined}
                            />
                          )
                        )}
                      </div>
                    </div>
                    <div className={styles.connexionSection}>
                      <h4>Déconnecté ({countAvailableConnector-countConnectedConnector})</h4>
                      <div className={styles.connexionSectionCards}>
                        {availableShow
                          .filter((connector) => !connector.connectors_special)
                          .map((connector) =>
                            connector.connectors_name === "whatsapp" ? (
                              <div key={connector.connectors_id} ref={waSelectorAnchorRef}>
                                <ConnexionCard
                                  title="Whatsapp"
                                  description="Connecter whatsapp"
                                  imageSrc={connexions["whatsapp"].imageSrc}
                                  actionLabel="Connecter"
                                  isAvailable={connector.connectors_available}
                                  onAction={() => setShowWASelector(true)}
                                  helpUrl="https://lautopreneur.notion.site/Connecter-WhatsApp-LeadControl-331392824e1a812c9657d8d56c77c4e7?source=copy_link"
                                  helpTooltip="Besoin d'aide pour connecter votre compte WhatsApp ?"
                                />
                              </div>
                            ) : (
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
                            )
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────── VOIX ───────────────── */}
              {activeTab === "voix" && (
                <div className={styles.configTabPanel}>
                  <div className={styles.modalContainer}>
                    {selectedAgent && (
                      <div className={styles.detailsGroup}>
                        <div className={styles.detailsGroupHeader}>
                          <span className={styles.detailsGroupTitle}>Voice</span>
                        </div>
                        <div className={styles.detailsGroupBody}>

                          {/* 4.1 Bibliothèque */}
                          <section className={styles.modalSection}>
                            <div className={styles.sectionHeading}>
                              <h4 className={styles.sectionTitle}>Bibliothèque de voix</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              Choisissez une voix parmi la bibliothèque ElevenLabs pour que votre agent parle à votre place.
                            </p>
                            {!voiceListLoading && voiceList.length === 0 && !voiceId ? (
                              <div className={styles.tabEmptyState}>
                                <span className={styles.tabEmptyStateIcon}>🎙</span>
                                <p className={styles.tabEmptyStateTitle}>Aucune voix disponible</p>
                                <p className={styles.tabEmptyStateDesc}>Configurez votre clé API ElevenLabs depuis vos paramètres pour accéder à la bibliothèque de voix.</p>
                              </div>
                            ) : voiceId ? (
                              <div className={styles.voiceActiveCard}>
                                <div className={styles.voiceActiveInfo}>
                                  <span className={styles.voiceActiveName}>{voiceName}</span>
                                  <span className={styles.voiceActiveType}>
                                    {voiceType === "cloned" ? "Voix clonée" : "Bibliothèque"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className={styles.voiceChangeBtn}
                                  onClick={() => { setVoiceId(null); setVoiceName(null); setVoiceType(null); }}
                                >
                                  Changer
                                </button>
                              </div>
                            ) : voiceListLoading ? (
                              <p className={styles.voiceLoadingText}>Chargement des voix…</p>
                            ) : (
                              <div className={styles.voiceGrid}>
                                {voiceList.map((v) => (
                                  <div key={v.voice_id} className={styles.voiceCard}>
                                    <span className={styles.voiceCardName}>{v.name}</span>
                                    <div className={styles.voiceCardActions}>
                                      <button
                                        type="button"
                                        className={styles.voicePreviewBtn}
                                        onClick={() => handlePlayVoicePreview(v.preview_url, v.voice_id)}
                                      >
                                        {voicePreviewingId === v.voice_id ? "⏹" : "▶"}
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.voiceSelectBtn}
                                        onClick={() => handleSaveVoiceSelection(v)}
                                      >
                                        Sélectionner
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          {/* 4.2 Clone vocal */}
                          <section className={styles.modalSection}>
                            <div className={styles.sectionHeading}>
                              <h4 className={styles.sectionTitle}>Cloner ma voix</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              Enregistrez ou déposez un fichier audio pour créer un clone de votre voix.
                            </p>
                            <div
                              className={`${styles.cloneDropZone} ${cloneDragOver ? styles.cloneDropZoneActive : ""} ${cloneAudioBlob ? styles.cloneDropZoneReady : ""}`}
                              onDragOver={(e) => { e.preventDefault(); setCloneDragOver(true); }}
                              onDragLeave={() => setCloneDragOver(false)}
                              onDrop={handleCloneDrop}
                            >
                              {cloneAudioBlob
                                ? "✓ Fichier audio prêt"
                                : "Déposez un fichier audio ici (mp3, wav, m4a…)"}
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              {!cloneRecording ? (
                                <button type="button" className={styles.cloneStartBtn} onClick={handleStartRecording}>
                                  🎙 Enregistrer
                                </button>
                              ) : (
                                <button type="button" className={styles.cloneStopBtn} onClick={handleStopRecording}>
                                  ⏹ Arrêter
                                </button>
                              )}
                            </div>
                            {cloneAudioBlob && (
                              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                                <input
                                  type="text"
                                  className={styles.cloneNameInput}
                                  placeholder="Nom de la voix (ex: Louis)"
                                  value={cloneVoiceName}
                                  onChange={(e) => setCloneVoiceName(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className={styles.cloneSubmitBtn}
                                  onClick={handleCloneVoice}
                                  disabled={isCloning || !cloneVoiceName.trim()}
                                >
                                  {isCloning ? "Clonage…" : "Créer le clone"}
                                </button>
                              </div>
                            )}
                          </section>

                          {/* 4.3 Auto-send */}
                          <section className={styles.modalSection}>
                            <div className={styles.sectionHeading}>
                              <h4 className={styles.sectionTitle}>Envoi automatique</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              L'agent envoie automatiquement un message vocal selon le déclencheur choisi.
                            </p>
                            <div className={styles.voiceAutoRow}>
                              <SwitchAnimated
                                checked={voiceAutoEnabled}
                                onChange={(val) => setVoiceAutoEnabled(val)}
                                showLabel
                              />
                              {voiceAutoEnabled && (
                                <select
                                  className={styles.voiceTriggerSelect}
                                  value={voiceTrigger}
                                  onChange={(e) => setVoiceTrigger(e.target.value as "always" | "first_message" | "on_link_sent")}
                                >
                                  <option value="always">À chaque message</option>
                                  <option value="first_message">Premier message seulement</option>
                                  <option value="on_link_sent">Après envoi du lien Calendly</option>
                                </select>
                              )}
                            </div>
                          </section>

                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.modalFooter}>
                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={handleSaveDetails}
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              )}

              {/* ───────────────── AUTOMATISATIONS ───────────────── */}
              {activeTab === "automatisations" && (
                <div className={styles.configTabPanel}>
                  <div className={styles.modalContainer}>
                    {selectedAgent && (
                      <div className={styles.detailsGroup}>
                        <div className={styles.detailsGroupHeader}>
                          <span className={styles.detailsGroupTitle}>Automatisations</span>
                        </div>
                        <div className={styles.detailsGroupBody}>

                          {/* Bloc 1 — Répondre aux commentaires */}
                          <section className={styles.modalSection}>
                            <div className={styles.sectionHeading}>
                              <h4 className={styles.sectionTitle}>Répondre aux commentaires</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              L'agent répond automatiquement aux commentaires Instagram.
                            </p>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                              <SwitchAnimated
                                checked={commReplyEnabled}
                                onChange={setCommReplyEnabled}
                                showLabel
                              />
                              {commReplyEnabled ? "Activé" : "Désactivé"}
                            </div>
                            {commReplyEnabled && (
                              <>
                                <div style={{ marginBottom: 8 }}>
                                  <label style={{ fontSize: 13, fontWeight: 600 }}>Mode de déclenchement</label>
                                  <select
                                    className={styles.voiceTriggerSelect}
                                    value={commReplyMode}
                                    onChange={(e) => setCommReplyMode(e.target.value as "always" | "keywords" | "never")}
                                    style={{ marginTop: 4, width: "100%" }}
                                  >
                                    <option value="always">Toujours</option>
                                    <option value="keywords">Sur mots-clés</option>
                                    <option value="never">Jamais</option>
                                  </select>
                                </div>
                                {commReplyMode === "keywords" && (
                                  <div style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600 }}>Mots-clés déclencheurs</label>
                                    <ConfigTextareaTags
                                      label="Mots-clés"
                                      placeholder="Ajouter un mot-clé…"
                                      initialTags={commReplyKeywords}
                                      onTagsChange={setCommReplyKeywords}
                                    />
                                  </div>
                                )}
                                <div>
                                  <label style={{ fontSize: 13, fontWeight: 600 }}>Template de réponse</label>
                                  <textarea
                                    className={styles.commTextarea}
                                    value={commReplyTemplate}
                                    onChange={(e) => setCommReplyTemplate(e.target.value)}
                                    placeholder="Merci pour ton commentaire ! Réponds en DM pour en savoir plus 🙌"
                                    rows={3}
                                  />
                                </div>
                              </>
                            )}
                          </section>

                          {/* Bloc 2 — Envoyer un DM après commentaire */}
                          <section className={styles.modalSection}>
                            <div className={styles.sectionHeading}>
                              <h4 className={styles.sectionTitle}>Envoyer un DM après commentaire</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              L'agent envoie automatiquement un DM aux personnes qui commentent.
                            </p>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                              <SwitchAnimated
                                checked={commDmEnabled}
                                onChange={setCommDmEnabled}
                                showLabel
                              />
                              {commDmEnabled ? "Activé" : "Désactivé"}
                            </div>
                            {commDmEnabled && (
                              <>
                                <div style={{ marginBottom: 8 }}>
                                  <label style={{ fontSize: 13, fontWeight: 600 }}>Mode de déclenchement</label>
                                  <select
                                    className={styles.voiceTriggerSelect}
                                    value={commDmMode}
                                    onChange={(e) => setCommDmMode(e.target.value as "always" | "keywords" | "never")}
                                    style={{ marginTop: 4, width: "100%" }}
                                  >
                                    <option value="always">Toujours</option>
                                    <option value="keywords">Sur mots-clés</option>
                                    <option value="never">Jamais</option>
                                  </select>
                                </div>
                                {commDmMode === "keywords" && (
                                  <div style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600 }}>Mots-clés déclencheurs</label>
                                    <ConfigTextareaTags
                                      label="Mots-clés"
                                      placeholder="Ajouter un mot-clé…"
                                      initialTags={commDmKeywords}
                                      onTagsChange={setCommDmKeywords}
                                    />
                                  </div>
                                )}
                                <div>
                                  <label style={{ fontSize: 13, fontWeight: 600 }}>Premier message DM</label>
                                  <textarea
                                    className={styles.commTextarea}
                                    value={commDmFirstMessage}
                                    onChange={(e) => setCommDmFirstMessage(e.target.value)}
                                    placeholder="Hey {{prenom}}, j'ai vu ton commentaire ! Tu veux en savoir plus ?"
                                    rows={3}
                                  />
                                </div>
                              </>
                            )}
                          </section>

                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.commSaveRow}>
                    <button
                      type="button"
                      className={styles.commSaveBtn}
                      onClick={handleSaveComments}
                      disabled={commSaveStatus === "saving"}
                    >
                      {commSaveStatus === "saving" ? "Sauvegarde…" : "Sauvegarder"}
                    </button>
                    {commSaveStatus === "saved" && (
                      <span className={styles.commToastSuccess}>✓ Sauvegardé</span>
                    )}
                    {commSaveStatus === "error" && (
                      <span className={styles.commToastError}>Erreur, réessayez</span>
                    )}
                  </div>
                </div>
              )}

              {/* ───────────────── AVANCÉ ───────────────── */}
              {activeTab === "avance" && (
                <div className={styles.configTabPanel}>
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
                              src={
                                ["appel", "instagram"].includes(
                                  logo.connectors_name.toLowerCase()
                                )
                                  ? `/logoConnectors/${logo.connectors_name.toLowerCase()}.svg`
                                  : `/logoConnectors/${logo.connectors_name.toLowerCase()}.webp`
                              }
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

                </div>
              )}

              {/* ───────────────── TEMPLATES ───────────────── */}
              {activeTab === "templates" && (
                <div className={styles.configTabPanel}>
                  <div className={styles.templatesSections}>
                    <div className={styles.templatesSection}>
                      <div className={styles.templatesSectionHeader}>
                        <h4>Templates WhatsApp ({waTemplates.length})</h4>
                        <Button
                          className={styles.connexionButton}
                          style={{ margin: 0, padding: "8px 14px", fontSize: "var(--fs-13)" }}
                          onClick={() => setIsTemplateModalOpen(true)}
                        >
                          + Nouveau template
                        </Button>
                      </div>
                      {waTemplates.length === 0 ? (
                        <div className={styles.tabEmptyState}>
                          <span className={styles.tabEmptyStateIcon}>📄</span>
                          <p className={styles.tabEmptyStateTitle}>Aucun template WhatsApp</p>
                          <p className={styles.tabEmptyStateDesc}>Créez un template pour envoyer des messages standardisés et relancer vos leads automatiquement.</p>
                          <Button
                            className={styles.connexionButton}
                            style={{ margin: 0 }}
                            onClick={() => setIsTemplateModalOpen(true)}
                          >
                            + Créer un template
                          </Button>
                        </div>
                      ) : (
                        waTemplates.map((tpl) => (
                          <div key={tpl.id} className={styles.templateRow}>
                            <div className={styles.templateRowBody}>
                              <p className={styles.templateRowName}>{tpl.name}</p>
                              <p className={styles.templateRowPreview}>{tpl.body.slice(0, 80)}{tpl.body.length > 80 ? "…" : ""}</p>
                            </div>
                            <span className={`${styles.templateStatusBadge} ${
                              tpl.status === "approved" ? styles.templateStatusApproved
                              : tpl.status === "rejected" ? styles.templateStatusRejected
                              : styles.templateStatusPending
                            }`}>
                              {tpl.status === "approved" ? "Approuvé" : tpl.status === "rejected" ? "Rejeté" : "En validation"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className={styles.templatesSection}>
                      <div className={styles.templatesSectionHeader}>
                        <h4>Relances planifiées ({followups.filter(f => f.status === "pending").length})</h4>
                      </div>
                      {followups.length === 0 ? (
                        <p className={styles.templateEmpty}>Aucune relance planifiée.</p>
                      ) : (
                        followups.map((f) => (
                          <div key={f.id} className={styles.followupRow}>
                            <div className={styles.followupRowBody}>
                              <p className={styles.followupRowContact}>{f.contactName}</p>
                              <p className={styles.followupRowMeta}>
                                {f.templateName} · {new Date(f.scheduled_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            <span className={`${styles.followupStatusBadge} ${
                              f.status === "sent" ? styles.followupStatusSent
                              : f.status === "cancelled" ? styles.followupStatusCancelled
                              : styles.followupStatusPending
                            }`}>
                              {f.status === "sent" ? "Envoyé" : f.status === "cancelled" ? "Annulé" : "Planifiée"}
                            </span>
                            {f.status === "pending" && (
                              <button
                                type="button"
                                className={styles.followupCancelBtn}
                                onClick={() => handleCancelFollowup(f.id)}
                              >
                                Annuler
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Modal création de template */}
        {isTemplateModalOpen && (
          <div className={styles.templateModalBackdrop} onClick={() => setIsTemplateModalOpen(false)}>
            <div className={styles.templateModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.templateModalHeader}>
                <h3>Nouveau template</h3>
                <button type="button" className={styles.templateModalClose} onClick={() => setIsTemplateModalOpen(false)}>×</button>
              </div>
              <div className={styles.templateModalField}>
                <label>Nom du template</label>
                <input
                  className={styles.templateModalInput}
                  type="text"
                  placeholder="Ex: Relance J+3"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                />
              </div>
              <div className={styles.templateModalField}>
                <label>Message</label>
                <div className={styles.templateVariableChips}>
                  {["{{prenom}}", "{{lien_calendly}}"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={styles.templateVariableChip}
                      onClick={() => insertVariable(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={templateBodyRef}
                  className={styles.templateModalTextarea}
                  placeholder="Bonjour {{prenom}}, ..."
                  value={newTemplateBody}
                  onChange={(e) => setNewTemplateBody(e.target.value)}
                />
                <p className={styles.templateModalHint}>Ce template sera soumis à validation Meta avant utilisation.</p>
              </div>
              <div className={styles.templateModalFooter}>
                <Button
                  className={styles.connexionButton}
                  style={{ margin: 0, background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  onClick={() => setIsTemplateModalOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  className={styles.connexionButton}
                  style={{ margin: 0 }}
                  onClick={handleCreateTemplate}
                  disabled={isCreatingTemplate || !newTemplateName.trim() || !newTemplateBody.trim()}
                >
                  {isCreatingTemplate ? "…" : "Enregistrer"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {selectedAgent?.display_id && (
          <WATwilioConnect
            isOpen={showWASelector}
            onClose={() => setShowWASelector(false)}
            anchorEl={waSelectorAnchorRef.current}
            configsId={selectedAgent.display_id}
            onOAuthConnect={connexions["whatsapp"]?.onConnect ?? (() => {})}
          />
        )}
        <ProgressiveQuestionModal
          open={customToneModalOpen}
          questions={CUSTOM_TONE_QUESTIONS}
          answers={customToneAnswers}
          validationErrors={customToneValidationErrors}
          showValidationErrors={showToneErrors}
          touched={touchedQuestions}
          onAnswerChange={handleCustomToneAnswerChange}
          onFieldTouch={handleQuestionTouch}
          onClose={handleCloseCustomToneModal}
          onGenerate={handleGenerateCustomTone}
          isGenerating={isGeneratingCustomTone}
        />
      </div>
    </AppLayout>
  );
};

export default AgentAi;
