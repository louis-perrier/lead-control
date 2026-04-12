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
import { useLocation } from "react-router-dom";

import { AppLayout } from "../layouts";
import Header from "../components/Header";
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
const TEMPLATE_VARIABLES = ["{{prenom}}", "{{lien_calendly}}"];

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

const CUSTOM_TONE_MIN_LENGTH = 200;
const CUSTOM_TONE_MAX_LENGTH = 900;
const LAST_CUSTOM_TONE_QUESTION_KEY =
  CUSTOM_TONE_QUESTIONS[CUSTOM_TONE_QUESTIONS.length - 1].key;

const isCustomToneAnswerReady = (value: string) => {
  const length = value.trim().length;
  return length >= CUSTOM_TONE_MIN_LENGTH && length <= CUSTOM_TONE_MAX_LENGTH;
};

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
    if (value.length < CUSTOM_TONE_MIN_LENGTH) {
      errors[question.key] =
        `Chaque réponse doit contenir au minimum ${CUSTOM_TONE_MIN_LENGTH} caractères.`;
    } else if (value.length > CUSTOM_TONE_MAX_LENGTH) {
      errors[question.key] =
        `Chaque réponse doit contenir au maximum ${CUSTOM_TONE_MAX_LENGTH} caractères.`;
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

type VoiceType = "preset" | "cloned";
type VoiceTrigger = "always" | "first_message" | "on_link_sent";
type VoiceSnapshot = {
  voiceId: string | null;
  voiceName: string | null;
  voiceType: VoiceType | null;
  voiceAutoEnabled: boolean;
  voiceTrigger: VoiceTrigger;
};

type CommentsMode = "always" | "keywords" | "never";
type CommentsSnapshot = {
  replyEnabled: boolean;
  replyMode: CommentsMode;
  replyKeywords: string[];
  replyTemplate: string;
  dmEnabled: boolean;
  dmMode: CommentsMode;
  dmKeywords: string[];
  dmFirstMessage: string;
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
const CLONE_AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".webm"];
const CLONE_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/webm",
]);
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
  { id: "essential", label: "Essentiel", collapsible: true, keys: ["product_name", "context", "qualification", "stopped_condition"] },
  { id: "optimize", label: "Optimiser l'agent", collapsible: true, keys: ["tone"] },
  { id: "advanced", label: "Paramètres avancés", collapsible: true, keys: ["activation_time"] },
];

const FIELD_GROUP_PRESENTATION: Record<
  FieldGroupId,
  { title: string; description: string; singleColumn?: boolean }
> = {
  essential: {
    title: "Offre et contexte",
    description:
      "Renseigne ce que Clara vend, son contexte, les critères utiles, et quand elle doit passer le relais.",
  },
  optimize: {
    title: "Ton, langage et structure des messages",
    description:
      "Définis la manière d'écrire de Clara et la structure de ses réponses.",
    singleColumn: true,
  },
  advanced: {
    title: "Horaires d'activation",
    description:
      "Définis les heures globales de Clara. Les créneaux précis sont optionnels.",
    singleColumn: true,
  },
};

const REQUIRED_DETAIL_KEYS = ["product_name", "context", "stopped_condition"];

const getAgentTabId = (agent: AgentInfo) =>
  agent.display_id ?? agent.agent_id ?? agent.id;

const AgentAi: FunctionComponent = () => {
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



  // Etat de la popup "Details"
  const [contextText, setContextText] = useState("");
  const [contextPdf, setContextPdf] = useState<File | null>(null);
  const [contextPdfError, setContextPdfError] = useState<string | undefined>(
    undefined
  );
  const [tone, setTone] = useState<ToneOption>("normal");
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
  const [activeCustomToneQuestionKey, setActiveCustomToneQuestionKey] =
    useState<CustomToneKey>(CUSTOM_TONE_QUESTIONS[0].key);
  const [isLastCustomToneQuestionValidated, setIsLastCustomToneQuestionValidated] =
    useState(false);
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
  const [openGroups, setOpenGroups] = useState<Set<FieldGroupId>>(
    new Set<FieldGroupId>()
  );
  const [avgDealValue, setAvgDealValue] = useState<string>("");

  useEffect(() => {
    setOpenGroups(new Set<FieldGroupId>());
  }, [selectedAgentId]);

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
  const [voiceType, setVoiceType] = useState<VoiceType | null>(null);
  const [voiceAutoEnabled, setVoiceAutoEnabled] = useState(false);
  const [voiceTrigger, setVoiceTrigger] = useState<VoiceTrigger>("always");
  const [lastSavedVoice, setLastSavedVoice] = useState<VoiceSnapshot | null>(null);
  // Clone
  const [cloneAudioBlob, setCloneAudioBlob] = useState<Blob | null>(null);
  const [cloneAudioPreviewUrl, setCloneAudioPreviewUrl] = useState<string | null>(null);
  const [cloneRecording, setCloneRecording] = useState(false);
  const [cloneVoiceName, setCloneVoiceName] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [cloneDragOver, setCloneDragOver] = useState(false);
  const [cloneFeedback, setCloneFeedback] = useState<{
    tone: "neutral" | "info" | "success" | "error";
    message: string;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cloneChunksRef = useRef<Blob[]>([]);
  const cloneFileInputRef = useRef<HTMLInputElement | null>(null);

  // Comments (Automatisations) state
  const [commReplyEnabled, setCommReplyEnabled] = useState(false);
  const [commReplyMode, setCommReplyMode] = useState<CommentsMode>("always");
  const [commReplyKeywords, setCommReplyKeywords] = useState<string[]>([]);
  const [commReplyTemplate, setCommReplyTemplate] = useState("");
  const [commDmEnabled, setCommDmEnabled] = useState(false);
  const [commDmMode, setCommDmMode] = useState<CommentsMode>("always");
  const [commDmKeywords, setCommDmKeywords] = useState<string[]>([]);
  const [commDmFirstMessage, setCommDmFirstMessage] = useState("");
  const [commSaveStatus, setCommSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedComments, setLastSavedComments] = useState<CommentsSnapshot | null>(null);

  // Configuration state
  const [activeSocial, setActiveSocial] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<ConfigValue[]>([]);
  const [initialConfigValues, setInitialConfigValues] = useState<ConfigValue[]>([]);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [configSaveStatus, setConfigSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
      setConfigSaveStatus("idle");
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

  const buildVoiceSnapshot = useCallback(
    (voiceConfig: Record<string, any> | undefined): VoiceSnapshot => ({
      voiceId: voiceConfig?.elevenlabs_voice_id ?? null,
      voiceName: voiceConfig?.voice_name ?? null,
      voiceType: (voiceConfig?.voice_type as VoiceType | null) ?? null,
      voiceAutoEnabled: voiceConfig?.auto_voice_enabled ?? false,
      voiceTrigger: (voiceConfig?.auto_voice_trigger as VoiceTrigger) ?? "always",
    }),
    []
  );

  const getCurrentVoiceSnapshot = useCallback(
    (): VoiceSnapshot => ({
      voiceId,
      voiceName: voiceName?.trim() || null,
      voiceType,
      voiceAutoEnabled,
      voiceTrigger,
    }),
    [voiceAutoEnabled, voiceId, voiceName, voiceTrigger, voiceType]
  );

  const buildCommentsSnapshot = useCallback(
    (commentsConfig: Record<string, any> | undefined): CommentsSnapshot => ({
      replyEnabled: commentsConfig?.reply_to_comment_enabled ?? false,
      replyMode: (commentsConfig?.reply_mode as CommentsMode) ?? "always",
      replyKeywords: commentsConfig?.reply_keywords ?? [],
      replyTemplate: commentsConfig?.reply_template ?? "",
      dmEnabled: commentsConfig?.dm_after_comment_enabled ?? false,
      dmMode: (commentsConfig?.dm_mode as CommentsMode) ?? "always",
      dmKeywords: commentsConfig?.dm_keywords ?? [],
      dmFirstMessage: commentsConfig?.dm_first_message ?? "",
    }),
    []
  );

  const getCurrentCommentsSnapshot = useCallback(
    (): CommentsSnapshot => ({
      replyEnabled: commReplyEnabled,
      replyMode: commReplyMode,
      replyKeywords: commReplyKeywords,
      replyTemplate: commReplyTemplate,
      dmEnabled: commDmEnabled,
      dmMode: commDmMode,
      dmKeywords: commDmKeywords,
      dmFirstMessage: commDmFirstMessage,
    }),
    [
      commDmEnabled,
      commDmFirstMessage,
      commDmKeywords,
      commDmMode,
      commReplyEnabled,
      commReplyKeywords,
      commReplyMode,
      commReplyTemplate,
    ]
  );

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
    const voiceSnapshot = buildVoiceSnapshot(savedVoice);
    setVoiceId(voiceSnapshot.voiceId);
    setVoiceName(voiceSnapshot.voiceName);
    setVoiceType(voiceSnapshot.voiceType);
    setVoiceAutoEnabled(voiceSnapshot.voiceAutoEnabled);
    setVoiceTrigger(voiceSnapshot.voiceTrigger);
    setLastSavedVoice(voiceSnapshot);
    setCloneAudioBlob(null);
    setCloneVoiceName("");
    setCloneDragOver(false);
    setCloneRecording(false);
    setCloneFeedback({
      tone: "neutral",
      message: "Étape 1: importez ou enregistrez un extrait. Étape 2: écoutez-le. Étape 3: cliquez sur Créer le clone.",
    });
    const savedComments = (selectedAgent.configs as Record<string, any>)?.Comments ?? {};
    const commentsSnapshot = buildCommentsSnapshot(savedComments);
    setCommReplyEnabled(commentsSnapshot.replyEnabled);
    setCommReplyMode(commentsSnapshot.replyMode);
    setCommReplyKeywords(commentsSnapshot.replyKeywords);
    setCommReplyTemplate(commentsSnapshot.replyTemplate);
    setCommDmEnabled(commentsSnapshot.dmEnabled);
    setCommDmMode(commentsSnapshot.dmMode);
    setCommDmKeywords(commentsSnapshot.dmKeywords);
    setCommDmFirstMessage(commentsSnapshot.dmFirstMessage);
    setLastSavedComments(commentsSnapshot);
    setCommSaveStatus("idle");
  }, [applySnapshot, buildCommentsSnapshot, buildSnapshotFromDetails, buildVoiceSnapshot, selectedAgent]);

  useEffect(() => {
    if (!cloneAudioBlob) {
      setCloneAudioPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(cloneAudioBlob);
    setCloneAudioPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [cloneAudioBlob]);

  useEffect(() => {
    if (!selectedAgent) {
      setCustomToneAnswers(createDefaultCustomToneAnswers());
      setCustomToneStatus("idle");
      setCustomToneGeneratedPrompt("");
      setCustomToneLastGeneratedAt(null);
      setCustomToneError(null);
      setIsLastCustomToneQuestionValidated(false);
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
    const nextCustomToneAnswers = savedCustomTone.answers
      ? {
        ...createDefaultCustomToneAnswers(),
        ...Object.fromEntries(
          CUSTOM_TONE_QUESTIONS.map((question) => [
            question.key,
            savedCustomTone.answers?.[question.key] ?? "",
          ])
        ),
      }
      : createDefaultCustomToneAnswers();
    setCustomToneAnswers(nextCustomToneAnswers);
    setCustomToneStatus(savedCustomTone.status ?? "idle");
    setCustomToneGeneratedPrompt(savedCustomTone.generated_prompt ?? "");
    setCustomToneLastGeneratedAt(savedCustomTone.last_generated_at ?? null);
    setCustomToneError(null);
    const firstPendingQuestion =
      CUSTOM_TONE_QUESTIONS.find((question) => {
        const value = nextCustomToneAnswers[question.key]?.trim() ?? "";
        return (
          value.length === 0 ||
          value.length < CUSTOM_TONE_MIN_LENGTH ||
          value.length > CUSTOM_TONE_MAX_LENGTH
        );
      }) ?? null;
    const allLoadedAnswersReady = CUSTOM_TONE_QUESTIONS.every((question) =>
      isCustomToneAnswerReady(nextCustomToneAnswers[question.key] ?? "")
    );
    setIsLastCustomToneQuestionValidated(allLoadedAnswersReady);
    setActiveCustomToneQuestionKey(
      firstPendingQuestion?.key ?? LAST_CUSTOM_TONE_QUESTION_KEY
    );
  }, [selectedAgent]);

  useEffect(() => {
    setCustomToneValidationErrors(
      buildCustomToneValidationErrors(customToneAnswers)
    );
  }, [customToneAnswers]);

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
      if (key === LAST_CUSTOM_TONE_QUESTION_KEY) {
        setIsLastCustomToneQuestionValidated(false);
      }
      handleQuestionTouch(key);
    },
    [handleQuestionTouch]
  );

  const handleOpenCustomToneQuestion = useCallback((key: CustomToneKey) => {
    if (key === LAST_CUSTOM_TONE_QUESTION_KEY) {
      setIsLastCustomToneQuestionValidated(false);
    }
    setActiveCustomToneQuestionKey(key);
  }, []);

  const handleClearCustomToneAnswer = useCallback((key: CustomToneKey) => {
    setCustomToneAnswers((prev) => ({ ...prev, [key]: "" }));
    setTouchedQuestions((prev) => ({ ...prev, [key]: false }));
    setShowToneErrors(false);
    setCustomToneStatus("idle");
    setCustomToneGeneratedPrompt("");
    setCustomToneLastGeneratedAt(null);
    setCustomToneError(null);
    if (key === LAST_CUSTOM_TONE_QUESTION_KEY) {
      setIsLastCustomToneQuestionValidated(false);
    }
    setActiveCustomToneQuestionKey(key);
  }, []);

  const handleAdvanceCustomToneQuestion = useCallback((key: CustomToneKey) => {
    const currentIndex = CUSTOM_TONE_QUESTIONS.findIndex(
      (question) => question.key === key
    );
    const nextQuestion = CUSTOM_TONE_QUESTIONS[currentIndex + 1];
    if (nextQuestion) {
      setActiveCustomToneQuestionKey(nextQuestion.key);
    }
  }, []);

  const handleValidateLastCustomToneQuestion = useCallback(() => {
    const value = customToneAnswers[LAST_CUSTOM_TONE_QUESTION_KEY] ?? "";
    handleQuestionTouch(LAST_CUSTOM_TONE_QUESTION_KEY);
    setShowToneErrors(true);
    if (!isCustomToneAnswerReady(value)) {
      return;
    }
    setCustomToneError(null);
    setIsLastCustomToneQuestionValidated(true);
  }, [customToneAnswers, handleQuestionTouch]);

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
   * Les logos affichés dans la zone "Configurations" sont triés pour prioriser
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

  const activeSocialDisplayName = useMemo(() => {
    if (!activeSocial) return null;
    const activeLogo = configurationLogos.find(
      (logo) => logo.connectors_name.toLowerCase() === activeSocial.toLowerCase()
    );
    return activeLogo?.connectors_name ?? activeSocial;
  }, [activeSocial, configurationLogos]);

  const connectedConfigurationCount = useMemo(
    () => configurationLogos.filter((logo) => logo.connected).length,
    [configurationLogos]
  );

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
   * Liste à plat des identifiants marqués "required" (y compris les champs imbriqués)
   * afin de pouvoir valider l'état "Configurations".
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
   * Vérifie si des champs "required" attendent encore une valeur valable.
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
   * Indique si la section "Details" est complète et si une connexion est active,
   * afin d’alimenter les statuts des coins.
   */
  const areDetailsFilled = useMemo(() => {
    return contextText.trim().length > 0 || contextPdf !== null;
  }, [contextText, contextPdf]);

  const hasActiveConnection = countConnectedConnector > 0;
  const hasAnyConnectors =
    countAvailableConnector + countConnectedConnector > 0;
  const isCalendlyConnected = useMemo(
    () =>
      connectorConnected.some(
        (connector) => connector.connectors_name.toLowerCase() === "calendly"
      ),
    [connectorConnected]
  );

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
    setConfigSaveStatus("idle");
  };

  const serializeConfigValues = useCallback(
    (values: ConfigValue[]) =>
      JSON.stringify(
        [...values]
          .map(({ id, value }) => ({ id, value }))
          .sort((a, b) => a.id.localeCompare(b.id))
      ),
    []
  );

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
        `Chaque réponse doit contenir entre ${CUSTOM_TONE_MIN_LENGTH} et ${CUSTOM_TONE_MAX_LENGTH} caractères.`
      );
      return;
    }
    if (!isLastCustomToneQuestionValidated) {
      setCustomToneError(
        "Valide la dernière réponse avant de générer le ton personnalisé."
      );
      setActiveCustomToneQuestionKey(LAST_CUSTOM_TONE_QUESTION_KEY);
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
    isLastCustomToneQuestionValidated,
    refreshDisplayedAgents,
    selectedAgent,
  ]);

  const trimmedCustomToneAnswers = useMemo(
    () => getTrimmedCustomToneAnswers(),
    [getTrimmedCustomToneAnswers]
  );

  const customToneRevealCount = useMemo(() => {
    const firstPendingIndex = CUSTOM_TONE_QUESTIONS.findIndex((question) => {
      const value = trimmedCustomToneAnswers[question.key] ?? "";
      return !isCustomToneAnswerReady(value);
    });
    const highestStartedIndex = CUSTOM_TONE_QUESTIONS.reduce(
      (highestIndex, question, index) => {
        const value = trimmedCustomToneAnswers[question.key] ?? "";
        return value.length > 0 ? index : highestIndex;
      },
      -1
    );
    const nextProgressIndex =
      firstPendingIndex === -1
        ? CUSTOM_TONE_QUESTIONS.length
        : firstPendingIndex + 1;
    const retainedProgressIndex = Math.max(1, highestStartedIndex + 1);
    return Math.max(nextProgressIndex, retainedProgressIndex);
  }, [trimmedCustomToneAnswers]);

  const customToneFirstPendingIndex = useMemo(() => {
    const firstPendingIndex = CUSTOM_TONE_QUESTIONS.findIndex((question) => {
      const value = trimmedCustomToneAnswers[question.key] ?? "";
      return !isCustomToneAnswerReady(value);
    });
    return firstPendingIndex === -1
      ? CUSTOM_TONE_QUESTIONS.length - 1
      : firstPendingIndex;
  }, [trimmedCustomToneAnswers]);

  const visibleCustomToneQuestions = useMemo(
    () => CUSTOM_TONE_QUESTIONS.slice(0, customToneRevealCount),
    [customToneRevealCount]
  );

  const hiddenCustomToneCount = CUSTOM_TONE_QUESTIONS.length - customToneRevealCount;

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
      return isCustomToneAnswerReady(value);
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

  const customToneInvalidCount = useMemo(() => {
    return CUSTOM_TONE_QUESTIONS.filter((question) =>
      Boolean(customToneValidationErrors[question.key])
    ).length;
  }, [customToneValidationErrors]);

  const customToneActionLabel = useMemo(() => {
    if (isGeneratingCustomTone) {
      return "Génération en cours...";
    }
    if (toneStatus === "configured" || toneStatus === "modified") {
      return "Régénérer le ton personnalisé";
    }
    return "Générer le ton personnalisé";
  }, [isGeneratingCustomTone, toneStatus]);

  const customToneHelperText = useMemo(() => {
    if (hiddenCustomToneCount > 0) {
      return `Encore ${hiddenCustomToneCount} question${
        hiddenCustomToneCount > 1 ? "s" : ""
      } à remplir pour terminer la personnalisation.`;
    }
    if (customToneInvalidCount > 0) {
      return `${customToneInvalidCount} réponse${
        customToneInvalidCount > 1 ? "s" : ""
      } à compléter avant génération.`;
    }
    if (!isLastCustomToneQuestionValidated) {
      return "Valide la dernière réponse pour afficher la génération.";
    }
    return "Tes réponses sont prêtes pour générer le ton personnalisé.";
  }, [
    customToneInvalidCount,
    hiddenCustomToneCount,
    isLastCustomToneQuestionValidated,
  ]);

  const shouldShowCustomToneActions =
    hiddenCustomToneCount === 0 &&
    customToneInvalidCount === 0 &&
    isLastCustomToneQuestionValidated;

  useEffect(() => {
    if (tone !== "custom") {
      return;
    }
    const visibleKeys = visibleCustomToneQuestions.map((question) => question.key);
    if (visibleKeys.includes(activeCustomToneQuestionKey)) {
      return;
    }
    const fallbackQuestion =
      visibleCustomToneQuestions[
        Math.min(customToneFirstPendingIndex, visibleCustomToneQuestions.length - 1)
      ] ?? CUSTOM_TONE_QUESTIONS[0];
    setActiveCustomToneQuestionKey(fallbackQuestion.key);
  }, [
    activeCustomToneQuestionKey,
    customToneFirstPendingIndex,
    tone,
    visibleCustomToneQuestions,
  ]);

  /**
   * Récupère les valeurs sauvegardées dans Supabase pour pré-remplir la section
   * lorsque l’utilisateur ouvre Configurations.
   */
  const fetchSavedConfig = useCallback(async () => {
    if (!activeSocial || !selectedAgent) {
      setInitialConfigValues([]);
      setConfigValues([]);
      setConfigSaveStatus("idle");
      return;
    }
    setIsConfigLoading(true);
    setConfigSaveStatus("idle");
    try {
      const target =
        connectorConnected.find(
          (item) => item.connectors_name.toLowerCase() === activeSocial.toLowerCase()
        ) ?? connectorConnected[0];
      if (!target?.id) {
        setInitialConfigValues([]);
        setConfigValues([]);
        setConfigSaveStatus("idle");
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
        setConfigSaveStatus("idle");
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
      setConfigSaveStatus("idle");
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

  const canCreateTemplate =
    !isCreatingTemplate &&
    Boolean(newTemplateName.trim()) &&
    Boolean(newTemplateBody.trim());
  const templateBodyCharCount = newTemplateBody.length;

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
      setConfigSaveStatus("error");
      return;
    }
    const payload = buildPayload();
    if (payload.length === 0) return;
    setConfigSaveStatus("saving");
    const { error } = await supabase
      .from("connectors_config_agent")
      .update({ current_config_connexion: payload })
      .eq("configs_id", selectedAgent.display_id)
      .eq("user_connexion_id", target.id);
    if (error) {
      console.error("Erreur lors de la sauvegarde", error);
      setConfigSaveStatus("error");
    } else {
      console.log("Config enregistrée");
      setInitialConfigValues(payload);
      setConfigValues(payload);
      setConfigSaveStatus("saved");
      setTimeout(() => setConfigSaveStatus("idle"), 2500);
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

  const canSaveAgentDetails =
    Boolean(selectedAgent) && !hasValidationErrors && hasUnsavedChanges;

  const agentFooterHintText = !lastSavedDetails
    ? "Complétez les champs requis"
    : hasValidationErrors
    ? "Corrigez les champs en erreur pour enregistrer"
    : hasUnsavedChanges
    ? "Changements non enregistrés"
    : "Tout est à jour";

  const agentFooterHintClassName = [
    styles.footerHint,
    !lastSavedDetails
      ? styles.footerHintNeutral
      : hasValidationErrors
      ? styles.footerHintError
      : hasUnsavedChanges
      ? styles.footerHintWarning
      : styles.footerHintSuccess,
  ]
    .filter(Boolean)
    .join(" ");

  const hasUnsavedVoiceChanges = useMemo(() => {
    if (!lastSavedVoice) return false;
    const current = getCurrentVoiceSnapshot();
    return JSON.stringify(current) !== JSON.stringify(lastSavedVoice);
  }, [getCurrentVoiceSnapshot, lastSavedVoice]);

  const canSaveVoiceSettings = Boolean(selectedAgent) && hasUnsavedVoiceChanges;

  const voiceFooterHintText = !selectedAgent
    ? "Sélectionnez un agent"
    : hasUnsavedVoiceChanges
    ? "Changements non enregistrés"
    : voiceId
    ? "Tout est à jour"
    : "Sélectionnez une voix pour activer les vocaux";

  const voiceFooterHintClassName = [
    styles.footerHint,
    !selectedAgent
      ? styles.footerHintNeutral
      : hasUnsavedVoiceChanges
      ? styles.footerHintWarning
      : voiceId
      ? styles.footerHintSuccess
      : styles.footerHintNeutral,
  ]
    .filter(Boolean)
    .join(" ");

  const hasUnsavedCommentsChanges = useMemo(() => {
    if (!lastSavedComments) return false;
    const current = getCurrentCommentsSnapshot();
    return JSON.stringify(current) !== JSON.stringify(lastSavedComments);
  }, [getCurrentCommentsSnapshot, lastSavedComments]);

  const canSaveComments = Boolean(selectedAgent) && hasUnsavedCommentsChanges && commSaveStatus !== "saving";

  const commentsFooterHintText = !selectedAgent
    ? "Sélectionnez un agent"
    : commSaveStatus === "error"
    ? "Erreur lors de l’enregistrement"
    : commSaveStatus === "saving"
    ? "Enregistrement en cours"
    : hasUnsavedCommentsChanges
    ? "Changements non enregistrés"
    : "Tout est à jour";

  const commentsFooterHintClassName = [
    styles.footerHint,
    !selectedAgent
      ? styles.footerHintNeutral
      : commSaveStatus === "error"
      ? styles.footerHintError
      : hasUnsavedCommentsChanges
      ? styles.footerHintWarning
      : styles.footerHintSuccess,
  ]
    .filter(Boolean)
    .join(" ");

  const hasUnsavedConfigChanges = useMemo(() => {
    return serializeConfigValues(configValues) !== serializeConfigValues(initialConfigValues);
  }, [configValues, initialConfigValues, serializeConfigValues]);

  const canSaveAdvancedConfig =
    Boolean(selectedAgent) &&
    Boolean(activeSocial) &&
    selectedConfigItems.length > 0 &&
    hasUnsavedConfigChanges &&
    !hasMissingRequiredConfig &&
    configSaveStatus !== "saving";

  const advancedFooterHintText = !selectedAgent
    ? "Sélectionnez un agent"
    : !activeSocial
    ? "Choisissez un connecteur à configurer"
    : configSaveStatus === "error"
    ? "Erreur lors de l’enregistrement"
    : configSaveStatus === "saving"
    ? "Enregistrement en cours"
    : selectedConfigItems.length === 0
    ? "Aucune configuration disponible pour ce connecteur"
    : hasMissingRequiredConfig
    ? "Complétez les champs requis"
    : hasUnsavedConfigChanges
    ? "Changements non enregistrés"
    : "Tout est à jour";

  const advancedFooterHintClassName = [
    styles.footerHint,
    !selectedAgent || !activeSocial || selectedConfigItems.length === 0
      ? styles.footerHintNeutral
      : configSaveStatus === "error"
      ? styles.footerHintError
      : hasMissingRequiredConfig
      ? styles.footerHintError
      : hasUnsavedConfigChanges
      ? styles.footerHintWarning
      : styles.footerHintSuccess,
  ]
    .filter(Boolean)
    .join(" ");

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
   * Sauvegarde les champs "Details" (prompt + contexte) dans Supabase.
   */
  const handleSaveComments = async () => {
    if (!selectedAgent) return;
    setCommSaveStatus("saving");
    const snapshot = getCurrentCommentsSnapshot();
    const { error } = await supabase.from("agent_configs").update({
      configs: {
        ...selectedAgent.configs,
        Comments: {
          reply_to_comment_enabled: snapshot.replyEnabled,
          reply_mode: snapshot.replyMode,
          reply_keywords: snapshot.replyKeywords,
          reply_template: snapshot.replyTemplate,
          dm_after_comment_enabled: snapshot.dmEnabled,
          dm_mode: snapshot.dmMode,
          dm_keywords: snapshot.dmKeywords,
          dm_first_message: snapshot.dmFirstMessage,
        },
      },
    }).eq("configs_id", selectedAgent.display_id);
    if (error) {
      setCommSaveStatus("error");
    } else {
      setLastSavedComments(snapshot);
      setCommSaveStatus("saved");
      setTimeout(() => setCommSaveStatus("idle"), 2500);
    }
  };

  const handleSaveVoiceSelection = (voice: VoiceOption) => {
    setVoiceId(voice.voice_id);
    setVoiceName(voice.name);
    setVoiceType("preset");
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
      setCloneFeedback({
        tone: "info",
        message: "Enregistrement en cours. Cliquez sur Arrêter quand l’extrait vous convient.",
      });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) cloneChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(cloneChunksRef.current, { type: "audio/webm" });
        setCloneAudioBlob(blob);
        setCloneFeedback({
          tone: "info",
          message: "Extrait prêt. Écoutez-le puis cliquez sur Créer le clone pour lancer le clonage.",
        });
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setCloneRecording(true);
    } catch (err) {
      console.error("Microphone inaccessible", err);
      setCloneFeedback({
        tone: "error",
        message: "Impossible d’accéder au micro pour enregistrer un extrait.",
      });
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setCloneRecording(false);
  };

  const isAcceptedCloneAudioFile = useCallback((file: File) => {
    const fileName = file.name.toLowerCase();
    return (
      file.type.startsWith("audio/") ||
      CLONE_AUDIO_MIME_TYPES.has(file.type) ||
      CLONE_AUDIO_EXTENSIONS.some((extension) => fileName.endsWith(extension))
    );
  }, []);

  const handleCloneFileSelection = useCallback((file: File | null) => {
    if (!file) {
      return;
    }
    if (!isAcceptedCloneAudioFile(file)) {
      setCloneFeedback({
        tone: "error",
        message: "Format non pris en charge. Utilisez un fichier mp3, wav, m4a ou webm.",
      });
      return;
    }
    setCloneAudioBlob(file);
    setCloneFeedback({
      tone: "info",
      message: "Fichier importé. Écoutez-le puis cliquez sur Créer le clone pour lancer le clonage.",
    });
  }, [isAcceptedCloneAudioFile]);

  const handleClearCloneAudio = useCallback(() => {
    setCloneAudioBlob(null);
    setCloneFeedback({
      tone: "neutral",
      message: "Importez ou enregistrez un extrait pour préparer le clonage.",
    });
  }, []);

  const handleCloneInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleCloneFileSelection(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handleCloneZoneClick = () => {
    cloneFileInputRef.current?.click();
  };

  const handleCloneZoneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cloneFileInputRef.current?.click();
    }
  };

  const handleCloneDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setCloneDragOver(true);
  };

  const handleCloneDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!cloneDragOver) {
      setCloneDragOver(true);
    }
  };

  const handleCloneDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setCloneDragOver(false);
  };

  const handleCloneDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setCloneDragOver(false);
    handleCloneFileSelection(e.dataTransfer.files[0] ?? null);
  };

  const handleCloneVoice = async () => {
    if (!cloneAudioBlob || !cloneVoiceName.trim() || !selectedAgent) return;
    setIsCloning(true);
    setCloneFeedback({
      tone: "info",
      message: "Clonage en cours. Attendez la confirmation avant d’enregistrer l’onglet Voix.",
    });
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setCloneFeedback({
        tone: "error",
        message: "Session invalide. Impossible de lancer le clonage pour le moment.",
      });
      setIsCloning(false);
      return;
    }
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
          setCloneFeedback({
            tone: "success",
            message: "Clone créé avec succès. Cliquez maintenant sur Enregistrer en bas pour l’appliquer à l’agent.",
          });
        } else {
          setCloneFeedback({
            tone: "error",
            message: json.error ?? "Le clonage a échoué. Réessayez avec un autre extrait audio.",
          });
        }
      } catch (err) {
        console.error("Erreur clone voix", err);
        setCloneFeedback({
          tone: "error",
          message: "Le clonage a échoué. Réessayez avec un autre extrait audio.",
        });
      }
      setIsCloning(false);
    };
  };

  const handleSaveVoiceSettings = async () => {
    if (!selectedAgent) return;
    const voiceSnapshot = getCurrentVoiceSnapshot();
    const currentVoice = (selectedAgent.configs as Record<string, any>)?.Voice ?? {};
    const { error } = await supabase
      .from("agent_configs")
      .update({
        configs: {
          ...selectedAgent.configs,
          Voice: {
            ...currentVoice,
            elevenlabs_voice_id: voiceSnapshot.voiceId,
            voice_name: voiceSnapshot.voiceName,
            voice_type: voiceSnapshot.voiceType,
            auto_voice_enabled: voiceSnapshot.voiceAutoEnabled,
            auto_voice_trigger: voiceSnapshot.voiceTrigger,
            voice_rules: currentVoice.voice_rules ?? [],
          },
        },
      })
      .eq("configs_id", selectedAgent.display_id);

    if (error) {
      console.error(error);
      return;
    }

    await refreshDisplayedAgents();
    setLastSavedVoice(voiceSnapshot);
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

  const renderDetailsSection = (key: string): React.ReactNode => {
    switch (key) {
      case "context":
        return (
          <div className={`${styles.formField} ${styles.formFieldFull}`}>
            <label className={styles.compactLabel}>Contexte de vente</label>
            <p className={styles.fieldAssist}>
              Explique l'offre, la promesse, le type de client, les objections fréquentes et le parcours de conversion.
            </p>
            <div className={styles.textareaFieldShell}>
              <textarea
                value={contextText}
                onChange={(event) => setContextText(event.target.value)}
                placeholder="Exemple : Mon produit est une formation en ligne sur le dropshipping à 497€. Elle comprend 25 modules vidéo, un groupe privé Discord, 3 sessions de coaching en live par mois, et un accès à vie. Les avantages principaux sont : méthode testée sur +1000 élèves, accompagnement personnalisé, garantie remboursé 30j. Le processus : appel découverte gratuit de 30min → présentation de l'offre → paiement en 1x ou 3x sans frais."
                className={styles.contextTextarea}
                rows={8}
              />
            </div>
            {errors.context && (
              <p className={styles.fieldError}>{errors.context}</p>
            )}
          </div>
        );
      case "product_name":
        return (
          <div className={styles.formField}>
            <label className={styles.compactLabel}>Offre</label>
            <p className={styles.fieldAssist}>
              Indique le nom de l'offre, du service ou de l'accompagnement que
              Clara doit présenter.
            </p>
            <input
              type="text"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Nom de l'offre ou du service"
              className={styles.detailsInput}
            />
            {errors.productName && (
              <p className={styles.fieldError}>{errors.productName}</p>
            )}
          </div>
        );
      case "activation_time":
        return (
          <div
            className={`${styles.formField} ${styles.formFieldFull} ${styles.availabilityField}`}
          >
            <div className={styles.availabilityPanel}>
              <section className={styles.availabilitySegment}>
                <div className={styles.availabilitySegmentHeader}>
                  <div className={styles.availabilitySegmentCopy}>
                    <p className={styles.availabilitySegmentTitle}>Plage principale</p>
                    <p className={styles.availabilitySegmentLead}>
                      Cette plage sert de cadre général. Si tu ne rajoutes aucun créneau,
                      Clara répondra pendant toute cette amplitude.
                    </p>
                  </div>
                  <span className={styles.availabilitySummaryChip}>
                    {timeStart} - {timeEnd}
                  </span>
                </div>
                <div className={styles.timeInputGroup}>
                  <div className={styles.timeField}>
                    <label htmlFor="timeStart">Heure de début</label>
                    <input
                      id="timeStart"
                      type="time"
                      step={300}
                      value={timeStart}
                      onChange={(event) => setTimeStart(event.target.value)}
                      className={styles.timeInput}
                    />
                  </div>
                  <div className={styles.timeField}>
                    <label htmlFor="timeEnd">Heure de fin</label>
                    <input
                      id="timeEnd"
                      type="time"
                      step={300}
                      value={timeEnd}
                      onChange={(event) => setTimeEnd(event.target.value)}
                      className={styles.timeInput}
                    />
                  </div>
                </div>
                {errors.timeRange && (
                  <p className={styles.fieldError}>{errors.timeRange}</p>
                )}
              </section>

              <section className={`${styles.availabilitySegment} ${styles.slotSection}`}>
                <div className={styles.slotHeader}>
                  <div className={styles.slotHeaderCopy}>
                    <div className={styles.slotHeaderTitleRow}>
                      <span className={styles.slotHeaderLabel}>Créneaux spécifiques</span>
                      <span className={styles.slotCounter}>
                        {timeSlots.length > 0
                          ? `${timeSlots.length} ${
                              timeSlots.length > 1 ? "créneaux" : "créneau"
                            }`
                          : "Optionnel"}
                      </span>
                    </div>
                    <p className={styles.slotHeaderAssist}>
                      Ajoute seulement les moments précis où Clara doit intervenir à
                      l'intérieur de la plage principale.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.slotAddButton}
                    onClick={handleAddTimeSlot}
                  >
                    Ajouter un créneau
                  </button>
                </div>

                {timeSlots.length > 0 ? (
                  <>
                    <div className={styles.slotList}>
                      {timeSlots.map((slot, slotIndex) => (
                        <div key={slot.id} className={styles.slotRow}>
                          <div className={styles.slotRowHeader}>
                            <span className={styles.slotRowIndex}>
                              Créneau {slotIndex + 1}
                            </span>
                          </div>
                          <div className={styles.slotRowFields}>
                            <div className={styles.slotFieldGroup}>
                              <label
                                className={styles.fieldLabel}
                                htmlFor={`slot-time-${slot.id}`}
                              >
                                Heure de début
                              </label>
                              <input
                                id={`slot-time-${slot.id}`}
                                type="time"
                                min={timeStart}
                                max={timeEnd}
                                step={300}
                                value={slot.time}
                                onChange={(event) =>
                                  handleSlotTimeChange(slot.id, event.target.value)
                                }
                                className={styles.timeInput}
                              />
                            </div>
                            <div className={styles.slotFieldGroup}>
                              <label
                                className={styles.fieldLabel}
                                htmlFor={`slot-duration-${slot.id}`}
                              >
                                Durée (minutes)
                              </label>
                              <input
                                id={`slot-duration-${slot.id}`}
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
                          </div>
                          <button
                            type="button"
                            className={styles.slotRemoveButton}
                            onClick={() => handleRemoveTimeSlot(slot.id)}
                          >
                            Supprimer ce créneau
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className={styles.slotHelper}>
                      Chaque créneau doit rester compris entre {timeStart} et {timeEnd}.
                    </p>
                  </>
                ) : (
                  <div className={styles.slotEmptyState}>
                    <span className={styles.slotFullRange}>Aucun créneau ajouté</span>
                    <p className={styles.slotHelper}>
                      Clara répondra simplement sur toute la plage principale définie
                      ci-dessus.
                    </p>
                  </div>
                )}

                {errors.timeSlots && (
                  <p className={styles.fieldError}>{errors.timeSlots}</p>
                )}
              </section>
            </div>
          </div>
        );
      case "tone":
        return (
          <div
            className={`${styles.formField} ${styles.formFieldFull} ${styles.toneFieldBlock}`}
          >
            <label className={styles.compactLabel}>
              Ton & Langage{" "}
              <span className={styles.newFeatureBadge}>Nouveau</span>
            </label>
            <p className={styles.fieldAssist}>
              Choisis la manière d'écrire de Clara. Le mode personnalisé sert si tu veux un ton plus proche de ta marque.
            </p>
            <ToneSelector
              value={tone}
              options={toneOptions}
              onChange={handleToneSelectionChange}
            />
            {tone === "custom" && (
              <>
                <div className={styles.customToneInlineSection}>
                  <div className={styles.customToneInlineHeader}>
                    <p className={styles.customToneInlineTitle}>
                      Personnalisation du ton
                    </p>
                    <p className={styles.customToneInlineLead}>
                      Réponds une situation à la fois pour entraîner Clara sur
                      ton style.
                    </p>
                  </div>
                  <div className={styles.customToneQuestions}>
                    {visibleCustomToneQuestions.map((question, index) => {
                      const value = customToneAnswers[question.key] ?? "";
                      const answerLength = value.trim().length;
                      const isReady = isCustomToneAnswerReady(value);
                      const isLastQuestion =
                        question.key === LAST_CUSTOM_TONE_QUESTION_KEY;
                      const isExpanded =
                        activeCustomToneQuestionKey === question.key;
                      const isCollapsed =
                        !isExpanded ||
                        (isLastQuestion && isLastCustomToneQuestionValidated);
                      const nextQuestion =
                        CUSTOM_TONE_QUESTIONS[index + 1] ?? null;
                      const canUnlockNext = isReady;
                      const stepHint = !nextQuestion
                        ? canUnlockNext
                          ? "Dernière étape avant la génération."
                          : `Minimum ${CUSTOM_TONE_MIN_LENGTH} caractères pour valider cette réponse.`
                        : "";
                      const hasError = Boolean(
                        customToneValidationErrors[question.key]
                      );
                      const shouldShowError =
                        hasError &&
                        (showToneErrors || touchedQuestions[question.key]);
                      const [questionLabel, questionTitle] =
                        question.title.includes("—")
                          ? question.title
                              .split("—")
                              .map((segment) => segment.trim())
                          : [
                              `Q${index + 1}`,
                              question.title,
                            ];

                      if (isCollapsed && !isReady) {
                        return null;
                      }

                      if (isCollapsed) {
                        return (
                          <div
                            key={question.key}
                            className={[
                              styles.customToneQuestion,
                              styles.customToneQuestionCollapsed,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <div className={styles.customToneQuestionCompact}>
                              <div className={styles.customToneQuestionCompactMain}>
                                <p className={styles.customToneQuestionTitle}>
                                  {questionTitle}
                                </p>
                              </div>
                              <div className={styles.customToneQuestionCompactMeta}>
                                <div className={styles.customToneQuestionHeaderMeta}>
                                  <span className={styles.customToneQuestionBadge}>
                                    {questionLabel}
                                  </span>
                                  <span
                                    className={[
                                      styles.customToneQuestionState,
                                      isReady
                                        ? styles.customToneQuestionStateReady
                                        : styles.customToneQuestionStateDraft,
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    {isReady
                                      ? "Réponse prête"
                                      : `${answerLength} caractères`}
                                  </span>
                                </div>
                                <div
                                  className={styles.customToneQuestionCompactActions}
                                >
                                  <button
                                    type="button"
                                    className={styles.customToneCompactButton}
                                    onClick={() =>
                                      handleOpenCustomToneQuestion(question.key)
                                    }
                                  >
                                    Modifier
                                  </button>
                                  <button
                                    type="button"
                                    className={[
                                      styles.customToneCompactButton,
                                      styles.customToneCompactButtonDanger,
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    onClick={() =>
                                      handleClearCustomToneAnswer(question.key)
                                    }
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={question.key}
                          className={styles.customToneQuestion}
                        >
                          <div className={styles.customToneQuestionHeader}>
                            <div>
                              <p className={styles.customToneQuestionTitle}>
                                {questionTitle}
                              </p>
                              <p className={styles.customToneQuestionExample}>
                                {question.example}
                              </p>
                            </div>
                            <span className={styles.customToneQuestionBadge}>
                              {questionLabel}
                            </span>
                          </div>
                          <textarea
                            className={[
                              styles.customToneTextarea,
                              shouldShowError
                                ? styles.customToneTextareaWarning
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            placeholder="Écris ici comment tu répondrais naturellement dans cette situation..."
                            value={value}
                            onChange={(event) =>
                              handleCustomToneAnswerChange(
                                question.key,
                                event.target.value
                              )
                            }
                            onBlur={() => handleQuestionTouch(question.key)}
                            rows={5}
                          />
                          <div className={styles.customToneQuestionFooter}>
                            {shouldShowError ? (
                              <p className={styles.customToneInlineFieldError}>
                                {customToneValidationErrors[question.key]}
                              </p>
                            ) : (
                              <div />
                            )}
                            <span
                              className={[
                                styles.customToneCharCount,
                                value.length > 900
                                  ? styles.customToneCharCountError
                                  : value.length < 200 &&
                                    (showToneErrors ||
                                      touchedQuestions[question.key])
                                  ? styles.customToneCharCountWarning
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {value.length} / 900 caractères
                              <span className={styles.customToneCharCountHint}>
                                {" "}
                                · minimum {CUSTOM_TONE_MIN_LENGTH}
                              </span>
                            </span>
                          </div>
                          <div className={styles.customToneQuestionActions}>
                            {stepHint ? (
                              <p className={styles.customToneStepHint}>
                                {stepHint}
                              </p>
                            ) : null}
                            <div className={styles.customToneQuestionActionButtons}>
                              <button
                                type="button"
                                className={styles.customToneClearButton}
                                onClick={() =>
                                  handleClearCustomToneAnswer(question.key)
                                }
                              >
                                Supprimer la réponse
                              </button>
                              {nextQuestion ? (
                                <button
                                  type="button"
                                  className={styles.customToneNextButton}
                                  onClick={() =>
                                    handleAdvanceCustomToneQuestion(question.key)
                                  }
                                  disabled={!canUnlockNext}
                                >
                                  Question suivante
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.customToneNextButton}
                                  onClick={handleValidateLastCustomToneQuestion}
                                  disabled={!canUnlockNext}
                                >
                                  Valider la réponse
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {customToneError && (
                    <p className={styles.customToneInlineError}>
                      {customToneError}
                    </p>
                  )}
                  {shouldShowCustomToneActions ? (
                    <div className={styles.customToneInlineActions}>
                      <p
                        className={[
                          styles.customToneInlineHelper,
                          customToneInvalidCount > 0
                            ? styles.customToneInlineHelperWarning
                            : styles.customToneInlineHelperReady,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {customToneHelperText}
                      </p>
                      <Button
                        className={styles.customToneActionButton}
                        onClick={handleGenerateCustomTone}
                        disabled={
                          customToneInvalidCount > 0 || isGeneratingCustomTone
                        }
                      >
                        {customToneActionLabel}
                      </Button>
                    </div>
                  ) : (
                    <p className={styles.customToneRevealHint}>
                      {customToneHelperText}
                    </p>
                  )}
                </div>
                {toneStatus !== "answers_saved" ? (
                  <div className={styles.toneStatusWrapper}>
                    <ToneStatusIndicator
                      status={toneStatus}
                      lastGenerated={customToneLastGeneratedAt}
                      isGenerating={isGeneratingCustomTone}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        );
      case "stopped_condition":
        return (
          <div className={`${styles.formField} ${styles.formFieldFull}`}>
            <label className={styles.compactLabel}>Passage de relais</label>
            <p className={styles.fieldAssist}>
              Décris le moment où Clara doit arrêter l'automatisation et, si besoin, le lien à envoyer.
            </p>
            <div className={styles.textareaFieldShell}>
              <textarea
                value={stopText}
                onChange={(event) => setStopText(event.target.value)}
                placeholder="Décris ce qui doit déclencher l'arrêt."
                className={styles.stopTextarea}
              />
            </div>
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
          </div>
        );
      case "qualification":
        return (
          <div className={`${styles.formField} ${styles.formFieldFull}`}>
            <label className={styles.compactLabel}>
              Qualification{" "}
              <span className={styles.newFeatureBadge}>Bêta</span>
            </label>
            <p className={styles.fieldAssist}>
              Liste les critères à vérifier avant qu'un prospect soit considéré comme pertinent.
            </p>
            <div className={styles.textareaFieldShell}>
              <textarea
                value={qualification}
                onChange={(event) => setQualification(event.target.value)}
                placeholder="Décris les critères que le prospect doit remplir pour que l'agent continue la conversation (ex : budget minimum, secteur d'activité, localisation...)"
                className={styles.stopTextarea}
                rows={5}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderAvgDealValueField = (): React.ReactNode => (
    <div key="avg_deal_value" className={styles.formField}>
      <label className={styles.compactLabel}>Prix moyen de vente (EUR)</label>
      <p className={styles.fieldAssist}>
        Sert a donner un repere economique a Clara pendant la qualification.
      </p>
      <input
        type="number"
        min={0}
        step={1}
        value={avgDealValue}
        onChange={(e) => setAvgDealValue(e.target.value)}
        placeholder="Ex : 497"
        className={styles.detailsInput}
        style={{ maxWidth: 220 }}
      />
    </div>
  );

  const getOrderedGroupKeys = useCallback(
    (groupId: FieldGroupId, keys: string[]) => {
      if (groupId !== "essential") {
        return keys;
      }

      const ordered = [...keys];
      const productIdx = ordered.indexOf("product_name");
      if (productIdx >= 0) {
        ordered.splice(productIdx + 1, 0, "__avg_deal_value__");
      } else {
        ordered.unshift("__avg_deal_value__");
      }
      return ordered;
    },
    []
  );

  const renderAgentDetailSections = (): React.ReactNode => (
    <div className={styles.agentDetailsSections}>
      {activeGroups.map((group, groupIndex) => {
        const presentation = FIELD_GROUP_PRESENTATION[group.id];
        const isOpen = !group.collapsible || openGroups.has(group.id);
        const hasGroupError = group.activeKeys.some((key) => keyHasError(key));
        const orderedKeys = getOrderedGroupKeys(group.id, group.activeKeys);

        return (
          <section
            key={group.id}
            className={[
              styles.detailsGroup,
              styles.agentDetailsSection,
              hasGroupError ? styles.detailsGroupError : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              className={[
                styles.detailsGroupHeader,
                styles.agentDetailsSectionHeader,
                group.collapsible ? styles.detailsGroupHeaderCollapsible : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={group.collapsible ? () => toggleGroup(group.id) : undefined}
              onKeyDown={
                group.collapsible
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleGroup(group.id);
                      }
                    }
                  : undefined
              }
              role={group.collapsible ? "button" : undefined}
              tabIndex={group.collapsible ? 0 : undefined}
              aria-expanded={group.collapsible ? isOpen : undefined}
            >
              <div className={styles.agentDetailsSectionIntro}>
                <span className={styles.agentDetailsSectionIndex}>
                  {String(groupIndex + 1).padStart(2, "0")}
                </span>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>{presentation.title}</h3>
                  <p className={styles.sectionDescription}>{presentation.description}</p>
                </div>
              </div>
              <div className={styles.detailsGroupHeaderRight}>
                {hasGroupError && <span className={styles.detailsGroupErrorDot} />}
                {group.collapsible && (
                  <>
                    <span className={styles.detailsGroupActionHint}>
                      {isOpen ? "Section ouverte" : "Ouvrir pour remplir"}
                    </span>
                    <span
                      className={[
                        styles.detailsGroupChevron,
                        !isOpen ? styles.detailsGroupChevronClosed : "",
                        isOpen ? styles.detailsGroupChevronOpen : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {"\u203A"}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div
              className={[
                styles.detailsGroupBody,
                styles.agentDetailsSectionBody,
                !isOpen ? styles.detailsGroupBodyClosed : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div
                className={[
                  styles.agentFormCard,
                  styles.agentTabFormCard,
                  styles.agentSectionGrid,
                  presentation.singleColumn ? styles.agentSectionGridSingle : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {orderedKeys.map((key) =>
                  key === "__avg_deal_value__" ? (
                    renderAvgDealValueField()
                  ) : (
                    <React.Fragment key={key}>{renderDetailsSection(key)}</React.Fragment>
                  )
                )}
              </div>
              {group.collapsible && isOpen && (
                <div className={styles.detailsGroupFooter}>
                  <button
                    type="button"
                    className={styles.detailsGroupFooterAction}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span className={styles.detailsGroupActionHint}>
                      Refermer ce bloc
                    </span>
                    <span
                      className={[
                        styles.detailsGroupChevron,
                        styles.detailsGroupChevronCollapse,
                        styles.detailsGroupChevronFooter,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {"\u203A"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <AppLayout>
      <div className={styles.rightcomponent}>
        <Header minimal showLogo={false} />
        {selectedAgent && (
          <div className={styles.configLayout}>
            <div className={styles.agentPanelHeader}>
              <div className={styles.agentPanelHeaderInner}>
                <div className={styles.agentPanelIdentity}>
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
                        <p className={styles.renameErrorText}>
                          {displayedRenameError || "\u00A0"}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className={styles.agentNameDisplay}>
                      <p
                        className={styles.agentNameCaption}
                        title={selectedAgent.name}
                      >
                        {selectedAgent.name}
                      </p>
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
                <div className={styles.agentPanelSwitchRow}>
                  <SwitchAnimated
                    checked={displayedHeaderSwitchChecked}
                    onChange={handleHeaderSwitchChange}
                    showLabel={false}
                    disabled={isHeaderSwitchDisabled}
                    className={styles.agentActivationSwitch}
                  />
                </div>
              </div>
            </div>

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
                <div
                  className={[styles.configTabPanel, styles.agentTabPanel]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div
                    className={[styles.modalContainer, styles.agentTabModalContainer]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {selectedAgent?.details_component?.length ? (
                      <div className={styles.agentDetailsSectionsWrapper}>
                        {renderAgentDetailSections()}
                      </div>
                    ) : (
                      <div className={styles.noConfigMessage}>
                        <p>Bonne nouvelle !</p>
                        <p>Aucune configuration n'est nécessaire pour cet agent.</p>
                      </div>
                    )}
                  </div>

                  {selectedAgent ? (
                    <div
                      className={[styles.modalFooter, styles.agentTabFooter]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <p className={agentFooterHintClassName} aria-live="polite">
                        {agentFooterHintText}
                      </p>
                      <button
                        type="button"
                        className={[styles.saveButton, styles.agentTabSaveButton]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={handleSaveDetails}
                        disabled={!canSaveAgentDetails}
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
                <div className={`${styles.configTabPanel} ${styles.voiceTabPanel}`}>
                  <div className={styles.modalContainer}>
                    {selectedAgent && (
                      <div className={styles.agentFormCard}>

                        {/* Bibliothèque */}
                        <div className={`${styles.formField} ${styles.formFieldFull}`}>
                          <div className={styles.voiceSectionCard}>
                            <div className={styles.voiceLibraryHeader}>
                              <label className={styles.compactLabel}>Bibliothèque de voix</label>
                              {!voiceListLoading && voiceList.length > 0 && !voiceId && (
                                <span className={styles.voiceLibraryCount}>{voiceList.length} voix</span>
                              )}
                            </div>

                            {!voiceListLoading && voiceList.length === 0 && !voiceId ? (
                              <div className={styles.tabEmptyState}>
                                <span className={styles.tabEmptyStateIcon}>🎙</span>
                                <p className={styles.tabEmptyStateTitle}>Aucune voix disponible</p>
                                <p className={styles.tabEmptyStateDesc}>Configurez votre clé API ElevenLabs depuis vos paramètres pour accéder à la bibliothèque de voix.</p>
                              </div>
                            ) : voiceId ? (
                              <div className={styles.voiceActiveCard}>
                                <div className={styles.voiceActiveInfo}>
                                  <span className={styles.voiceActiveEyebrow}>Voix active</span>
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
                                    <div className={styles.voiceCardHeader}>
                                      <span className={styles.voiceCardName}>{v.name}</span>
                                      <span className={styles.voiceCardTag}>Aperçu instantané</span>
                                    </div>
                                    <div className={styles.voiceCardActions}>
                                      <button
                                        type="button"
                                        className={styles.voicePreviewBtn}
                                        onClick={() => handlePlayVoicePreview(v.preview_url, v.voice_id)}
                                      >
                                        <span className={styles.voicePreviewBtnIcon}>
                                          {voicePreviewingId === v.voice_id ? "\u23F9" : "\u25B6"}
                                        </span>
                                        <span>{voicePreviewingId === v.voice_id ? "Stopper" : "Écouter"}</span>
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
                          </div>
                        </div>

                        {/* Clone vocal */}
                        <div className={styles.formField}>
                          <div className={`${styles.voiceSectionCard} ${styles.voiceUtilityCard}`}>
                            <label className={styles.compactLabel}>Cloner ma voix</label>
                            <input
                              ref={cloneFileInputRef}
                              type="file"
                              accept=".mp3,.wav,.m4a,.webm,audio/*"
                              className={styles.voiceFileInput}
                              onChange={handleCloneInputChange}
                            />
                            <div
                              className={`${styles.cloneDropZone} ${cloneDragOver ? styles.cloneDropZoneActive : ""} ${cloneAudioBlob ? styles.cloneDropZoneReady : ""}`}
                              role="button"
                              tabIndex={0}
                              onClick={handleCloneZoneClick}
                              onKeyDown={handleCloneZoneKeyDown}
                              onDragEnter={handleCloneDragEnter}
                              onDragOver={handleCloneDragOver}
                              onDragLeave={handleCloneDragLeave}
                              onDrop={handleCloneDrop}
                            >
                              <span className={styles.cloneDropZoneTitle}>
                                {cloneAudioBlob ? "✓ Fichier audio prêt" : "Importer un fichier audio"}
                              </span>
                              <span className={styles.cloneDropZoneHint}>
                                {cloneAudioBlob
                                  ? cloneAudioBlob instanceof File
                                    ? cloneAudioBlob.name
                                    : "Enregistrement vocal prêt"
                                  : "Cliquez pour choisir un fichier ou glissez-déposez un extrait (mp3, wav, m4a, webm)."}
                              </span>
                              <span className={styles.cloneDropZoneAction}>
                                {cloneAudioBlob ? "Changer le fichier" : "Choisir un fichier"}
                              </span>
                            </div>
                            {cloneFeedback && (
                              <p
                                className={[
                                  styles.cloneFeedback,
                                  cloneFeedback.tone === "success"
                                    ? styles.cloneFeedbackSuccess
                                    : cloneFeedback.tone === "error"
                                    ? styles.cloneFeedbackError
                                    : cloneFeedback.tone === "info"
                                    ? styles.cloneFeedbackInfo
                                    : styles.cloneFeedbackNeutral,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {cloneFeedback.message}
                              </p>
                            )}
                            <div className={styles.cloneActionRow}>
                              {!cloneRecording ? (
                                <button type="button" className={styles.cloneStartBtn} onClick={handleStartRecording}>
                                  🎙 Enregistrer un extrait
                                </button>
                              ) : (
                                <button type="button" className={styles.cloneStopBtn} onClick={handleStopRecording}>
                                  {"\u23F9"} Arrêter
                                </button>
                              )}
                              {cloneAudioBlob && (
                                <button
                                  type="button"
                                  className={styles.cloneClearBtn}
                                  onClick={handleClearCloneAudio}
                                >
                                  Supprimer l&apos;audio
                                </button>
                              )}
                            </div>
                            {cloneAudioPreviewUrl && (
                              <div className={styles.clonePreviewRow}>
                                <audio
                                  controls
                                  className={styles.clonePreviewAudio}
                                  src={cloneAudioPreviewUrl}
                                >
                                  Votre navigateur ne prend pas en charge l&apos;aperçu audio.
                                </audio>
                              </div>
                            )}
                            {cloneAudioBlob && (
                              <div className={styles.cloneSubmitRow}>
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
                          </div>
                        </div>

                        {/* Envoi automatique */}
                        <div className={`${styles.formField} ${styles.voiceCompactField}`}>
                          <div className={`${styles.voiceSectionCard} ${styles.voiceUtilityCard} ${styles.voiceAutoCard}`}>
                            <label className={styles.compactLabel}>Envoi automatique</label>
                            <div className={styles.voiceAutoRow}>
                              <SwitchAnimated
                                checked={voiceAutoEnabled}
                                onChange={(val) => setVoiceAutoEnabled(val)}
                                showLabel={false}
                              />
                            </div>
                            {voiceAutoEnabled && (
                              <select
                                className={styles.voiceTriggerSelect}
                                value={voiceTrigger}
                                onChange={(e) => setVoiceTrigger(e.target.value as VoiceTrigger)}
                              >
                                <option value="always">À chaque message</option>
                                <option value="first_message">Premier message seulement</option>
                                <option value="on_link_sent">Après envoi du lien Calendly</option>
                              </select>
                            )}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                  {selectedAgent ? (
                    <div
                      className={[styles.modalFooter, styles.agentTabFooter]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <p className={voiceFooterHintClassName} aria-live="polite">
                        {voiceFooterHintText}
                      </p>
                      <button
                        type="button"
                        className={[styles.saveButton, styles.agentTabSaveButton]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={handleSaveVoiceSettings}
                        disabled={!canSaveVoiceSettings}
                      >
                        Enregistrer
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* ───────────────── AUTOMATISATIONS ───────────────── */}
              {activeTab === "automatisations" && (
                <div className={`${styles.configTabPanel} ${styles.actionsTabPanel}`}>
                  <div className={styles.modalContainer}>
                    {selectedAgent && (
                      <div className={styles.agentFormCard}>

                        {/* Répondre aux commentaires */}
                        <div className={styles.formField}>
                          <label className={styles.compactLabel}>Répondre aux commentaires</label>
                          <div className={styles.voiceAutoRow}>
                            <SwitchAnimated
                              checked={commReplyEnabled}
                              onChange={setCommReplyEnabled}
                              showLabel={false}
                            />
                          </div>
                          {commReplyEnabled && (
                            <>
                              <div className={styles.formField}>
                                <label className={styles.compactLabel}>Mode de déclenchement</label>
                                <select
                                  className={styles.voiceTriggerSelect}
                                  value={commReplyMode}
                                  onChange={(e) => setCommReplyMode(e.target.value as "always" | "keywords" | "never")}
                                >
                                  <option value="always">Toujours</option>
                                  <option value="keywords">Sur mots-clés</option>
                                  <option value="never">Jamais</option>
                                </select>
                              </div>
                              {commReplyMode === "keywords" && (
                                <div className={styles.formField}>
                                  <label className={styles.compactLabel}>Mots-clés déclencheurs</label>
                                  <ConfigTextareaTags
                                    label="Mots-clés"
                                    placeholder="Ajouter un mot-clé…"
                                    initialTags={commReplyKeywords}
                                    onTagsChange={setCommReplyKeywords}
                                  />
                                </div>
                              )}
                              <div className={styles.formField}>
                                <label className={styles.compactLabel}>Template de réponse</label>
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
                        </div>

                        {/* Envoyer un DM après commentaire */}
                        <div className={styles.formField}>
                          <label className={styles.compactLabel}>Envoyer un DM après commentaire</label>
                          <div className={styles.voiceAutoRow}>
                            <SwitchAnimated
                              checked={commDmEnabled}
                              onChange={setCommDmEnabled}
                              showLabel={false}
                            />
                          </div>
                          {commDmEnabled && (
                            <>
                              <div className={styles.formField}>
                                <label className={styles.compactLabel}>Mode de déclenchement</label>
                                <select
                                  className={styles.voiceTriggerSelect}
                                  value={commDmMode}
                                  onChange={(e) => setCommDmMode(e.target.value as "always" | "keywords" | "never")}
                                >
                                  <option value="always">Toujours</option>
                                  <option value="keywords">Sur mots-clés</option>
                                  <option value="never">Jamais</option>
                                </select>
                              </div>
                              {commDmMode === "keywords" && (
                                <div className={styles.formField}>
                                  <label className={styles.compactLabel}>Mots-clés déclencheurs</label>
                                  <ConfigTextareaTags
                                    label="Mots-clés"
                                    placeholder="Ajouter un mot-clé…"
                                    initialTags={commDmKeywords}
                                    onTagsChange={setCommDmKeywords}
                                  />
                                </div>
                              )}
                              <div className={styles.formField}>
                                <label className={styles.compactLabel}>Premier message DM</label>
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
                        </div>

                      </div>
                    )}
                  </div>

                  {selectedAgent ? (
                    <div
                      className={[styles.modalFooter, styles.agentTabFooter]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <p className={commentsFooterHintClassName} aria-live="polite">
                        {commentsFooterHintText}
                      </p>
                      <button
                        type="button"
                        className={[styles.saveButton, styles.agentTabSaveButton]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={handleSaveComments}
                        disabled={!canSaveComments}
                      >
                        {commSaveStatus === "saving" ? "Enregistrement..." : "Enregistrer"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* ───────────────── AVANCÉ ───────────────── */}
              {activeTab === "avance" && (
                <div className={`${styles.configTabPanel} ${styles.advancedTabPanel}`}>
                  <div className={styles.advancedTabLayout}>
                    <section className={styles.advancedSectionCard}>
                      <label className={styles.compactLabel}>Connecteurs ({connectedConfigurationCount}/{configurationLogos.length})</label>

                      <div className={styles.advancedConnectorGrid}>
                        {configurationLogos.map((logo) => {
                          const logoKey = logo.connectors_name.toLowerCase();
                          const isActive = activeSocial === logoKey;

                          return (
                            <button
                              key={`${logo.connectors_id}-${logo.connected ? "connected" : "available"}`}
                              type="button"
                              className={[
                                styles.availableLogoContainer,
                                styles.advancedConnectorButton,
                                logo.connected ? "" : styles.availableLogoButtonDisabled,
                                isActive ? styles.advancedConnectorButtonActive : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              disabled={!logo.connected}
                              onClick={() => {
                                if (logo.connected) {
                                  setActiveSocial(logoKey);
                                }
                              }}
                            >
                              <div
                                className={[
                                  styles.availableLogoTrapezoid,
                                  styles.advancedConnectorIconShell,
                                  logo.connected ? "" : styles.availableLogoDisabled,
                                  logo.connectors_special ? styles.availableLogoSpecial : "",
                                  isActive ? styles.advancedConnectorIconShellActive : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                <img
                                  src={
                                    connexions[logoKey as keyof typeof connexions]?.imageSrc ??
                                    (["appel", "instagram"].includes(logoKey)
                                      ? `/logoConnectors/${logoKey}.svg`
                                      : `/logoConnectors/${logoKey}.webp`)
                                  }
                                  alt={`${logo.connectors_name} logo`}
                                  className={[styles.availableLogo, styles.advancedConnectorLogo]
                                    .filter(Boolean)
                                    .join(" ")}
                                />
                              </div>

                              <div className={styles.advancedConnectorText}>
                                <span className={styles.advancedConnectorName}>
                                  {logo.connectors_name}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className={styles.advancedSectionCard}>
                      <label className={styles.compactLabel}>
                        {activeSocialDisplayName
                          ? `Configuration ${activeSocialDisplayName}`
                          : "Configuration avancée"}
                      </label>

                      <div className={styles.advancedWorkspaceSurface}>
                        {isConfigLoading ? (
                          <div className={styles.advancedLoadingState}>
                            Chargement des paramètres...
                          </div>
                        ) : selectedConfigItems.length > 0 ? (
                          <DynamicConfig
                            items={selectedConfigItems}
                            initialValues={initialConfigValues}
                            onChange={handleConfigChange}
                          />
                        ) : (
                          <div className={styles.tabEmptyState}>
                            <div className={styles.tabEmptyStateContent}>
                              <span className={styles.tabEmptyStateBadge}>Avancé</span>
                              <p className={styles.tabEmptyStateTitle}>
                                {activeSocialDisplayName
                                  ? "Aucun réglage disponible"
                                  : "Choisissez un connecteur"}
                              </p>
                              <p className={styles.tabEmptyStateDesc}>
                                {activeSocialDisplayName
                                  ? "Ce connecteur ne propose pas encore de configuration supplémentaire pour cet agent."
                                  : "Sélectionnez un connecteur connecté dans la liste ci-dessus pour afficher ses paramètres avancés."}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  {selectedAgent ? (
                    <div
                      className={[styles.modalFooter, styles.agentTabFooter, styles.advancedTabFooter]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <p className={advancedFooterHintClassName} aria-live="polite">
                        {advancedFooterHintText}
                      </p>
                      <button
                        type="button"
                        className={[styles.saveButton, styles.agentTabSaveButton]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={handleSaveConfig}
                        disabled={!canSaveAdvancedConfig}
                      >
                        {configSaveStatus === "saving" ? "Enregistrement..." : "Enregistrer"}
                      </button>
                    </div>
                  ) : null}

                </div>
              )}

              {/* ───────────────── TEMPLATES ───────────────── */}
              {activeTab === "templates" && (
                <div className={styles.configTabPanel}>
                  <div className={styles.templatesSections}>
                    <div className={styles.templatesSection}>
                      <div className={styles.templatesSectionHeader}>
                        <div className={styles.templatesSectionHeading}>
                          <div className={styles.templatesSectionTitleRow}>
                            <h4>Templates WhatsApp</h4>
                            <span className={styles.templatesSectionCount}>
                              {waTemplates.length}
                            </span>
                          </div>
                          <p className={styles.templatesSectionLead}>
                            Prépare ici les messages validés que Clara utilisera
                            sur WhatsApp.
                          </p>
                        </div>
                        {waTemplates.length > 0 ? (
                          <Button
                            className={[
                              styles.connexionButton,
                              styles.templatesPrimaryAction,
                              styles.templatesSectionHeaderAction,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => setIsTemplateModalOpen(true)}
                          >
                            + Nouveau template
                          </Button>
                        ) : null}
                      </div>
                      {waTemplates.length === 0 ? (
                        <div className={styles.tabEmptyState}>
                          <div className={styles.tabEmptyStateContent}>
                            <span
                              className={[
                                styles.tabEmptyStateIconShell,
                                styles.tabEmptyStateIconShellWhatsapp,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-hidden="true"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className={styles.tabEmptyStateIconSvg}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M7 19.5L7.8 16.7C6.66 15.48 6 13.89 6 12.2C6 8.5 8.91 5.5 12.5 5.5C16.09 5.5 19 8.5 19 12.2C19 15.9 16.09 18.9 12.5 18.9H7Z" />
                                <path d="M9.7 11.1H15.3" />
                                <path d="M9.7 13.8H13.2" />
                              </svg>
                            </span>
                            <p className={styles.tabEmptyStateTitle}>Aucun template WhatsApp</p>
                            <p className={styles.tabEmptyStateDesc}>Créez un template pour envoyer des messages standardisés et relancer vos leads automatiquement.</p>
                          </div>
                          <div className={styles.tabEmptyStateAction}>
                            <Button
                              className={[styles.connexionButton, styles.templatesPrimaryAction]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => setIsTemplateModalOpen(true)}
                            >
                              + Créer un template
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.templatesSectionList}>
                          {waTemplates.map((tpl) => (
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
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={[styles.templatesSection, styles.followupSection]
                      .filter(Boolean)
                      .join(" ")}>
                      <div className={styles.templatesSectionHeader}>
                        <div className={styles.templatesSectionHeading}>
                          <div className={styles.templatesSectionTitleRow}>
                            <h4>Relances planifiées</h4>
                            <span className={styles.templatesSectionCount}>
                              {followups.filter(f => f.status === "pending").length}
                            </span>
                          </div>
                          <p className={styles.templatesSectionLead}>
                            Suis ici les relances déjà programmées et leur état
                            d’envoi.
                          </p>
                        </div>
                      </div>
                      {followups.length === 0 ? (
                        <div className={styles.tabEmptyState}>
                          <div className={styles.tabEmptyStateContent}>
                            <span
                              className={[
                                styles.tabEmptyStateIconShell,
                                styles.tabEmptyStateIconShellFollowup,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-hidden="true"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className={styles.tabEmptyStateIconSvg}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 7.2V12L15.1 14.1" />
                                <circle cx="12" cy="12" r="6.8" />
                                <path d="M7.5 4.8L5.7 3.2" />
                                <path d="M16.5 4.8L18.3 3.2" />
                              </svg>
                            </span>
                            <p className={styles.tabEmptyStateTitle}>
                              Aucune relance planifiée
                            </p>
                            <p className={styles.tabEmptyStateDesc}>
                              Les relances programmées apparaîtront ici dès qu’un
                              lead aura une prochaine action prévue.
                            </p>
                          </div>
                          <div
                            className={styles.tabEmptyStateActionSpacer}
                            aria-hidden="true"
                          />
                        </div>
                      ) : (
                        <div className={styles.templatesSectionList}>
                          {followups.map((f) => (
                            <div key={f.id} className={styles.followupRow}>
                              <div className={styles.followupRowBody}>
                                <p className={styles.followupRowContact}>
                                  {f.contactName}
                                </p>
                                <p className={styles.followupRowMeta}>
                                  <span className={styles.followupRowTemplate}>
                                    {f.templateName}
                                  </span>
                                  <span className={styles.followupRowMetaDot}>•</span>
                                  <span>
                                    {new Date(f.scheduled_at).toLocaleDateString("fr-FR", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </p>
                              </div>
                              <div className={styles.followupRowAside}>
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
                            </div>
                          ))}
                        </div>
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
          <div
            className={styles.templateModalBackdrop}
            onClick={() => setIsTemplateModalOpen(false)}
          >
            <div
              className={styles.templateModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="template-modal-title"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsTemplateModalOpen(false);
                  return;
                }
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key === "Enter" &&
                  canCreateTemplate
                ) {
                  event.preventDefault();
                  void handleCreateTemplate();
                }
              }}
            >
              <div className={styles.templateModalHeader}>
                <div className={styles.templateModalHeaderCopy}>
                  <p className={styles.templateModalEyebrow}>Relances WhatsApp</p>
                  <h3 id="template-modal-title">Créer un template</h3>
                  <p className={styles.templateModalLead}>
                    Prépare un message réutilisable que Clara pourra envoyer
                    dans tes relances WhatsApp.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.templateModalClose}
                  aria-label="Fermer la fenêtre"
                  onClick={() => setIsTemplateModalOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className={styles.templateModalBody}>
                <div className={styles.templateModalField}>
                  <label htmlFor="template-name-input">Nom du template</label>
                  <p className={styles.templateModalFieldHint}>
                    Choisis un nom court pour le retrouver facilement dans tes
                    relances.
                  </p>
                  <input
                    id="template-name-input"
                    className={styles.templateModalInput}
                    type="text"
                    placeholder="Ex: Relance J+3"
                    value={newTemplateName}
                    autoFocus
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                </div>
                <div className={styles.templateModalField}>
                  <div className={styles.templateModalFieldHeader}>
                    <label htmlFor="template-body-input">Message</label>
                    <span className={styles.templateModalCounter}>
                      {templateBodyCharCount} caractères
                    </span>
                  </div>
                  <p className={styles.templateModalFieldHint}>
                    Rédige un message clair puis ajoute, si besoin, une variable
                    pour personnaliser l’envoi.
                  </p>
                  <div className={styles.templateVariablesPanel}>
                    <div className={styles.templateVariablesHeader}>
                      <span className={styles.templateVariablesLabel}>
                        Variables rapides
                      </span>
                      <span className={styles.templateVariablesHint}>
                        Clique pour insérer
                      </span>
                    </div>
                    <div className={styles.templateVariableChips}>
                      {TEMPLATE_VARIABLES.map((v) => (
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
                  </div>
                  <textarea
                    id="template-body-input"
                    ref={templateBodyRef}
                    className={styles.templateModalTextarea}
                    placeholder="Bonjour {{prenom}}, je reviens vers vous suite à notre dernier échange..."
                    value={newTemplateBody}
                    onChange={(e) => setNewTemplateBody(e.target.value)}
                  />
                  <div className={styles.templateModalInfoRow}>
                    <p className={styles.templateModalHint}>
                      Ce template sera soumis à validation Meta avant
                      utilisation.
                    </p>
                    <span className={styles.templateModalShortcut}>
                      Ctrl + Entrée pour enregistrer
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.templateModalFooter}>
                <p className={styles.templateModalFooterNote}>
                  Enregistre ce brouillon pour l’envoyer ensuite en validation.
                </p>
                <div className={styles.templateModalFooterActions}>
                  <Button
                    className={[
                      styles.connexionButton,
                      styles.templateModalSecondaryButton,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setIsTemplateModalOpen(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    className={[
                      styles.connexionButton,
                      styles.templateModalPrimaryButton,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={handleCreateTemplate}
                    disabled={!canCreateTemplate}
                  >
                    {isCreatingTemplate ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
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
      </div>
    </AppLayout>
  );
};

export default AgentAi;
