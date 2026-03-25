import {
  ChangeEvent,
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "../layouts";
import ConfirmationDialog from "../components/ConfirmationDialog";
import {
  IconConversationPlay,
  IconConversationStop,
  IconDetailsComingSoon,
} from "../components/DashboardIcons";
import styles from "./Dashboard.module.css";
import useAgents from "../hooks/useAgents";
import useClaraConversations from "../hooks/useClaraConversations";
import supabase from "../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import AudioMessageBubble, {
  TranscriptStatus,
} from "../components/AudioMessageBubble";

type ChannelOption = "Instagram" | "WhatsApp" | "Telegram";
type ChannelFilterOption = ChannelOption | "All";
type StatusOption = "Ouvert" | "Clos" | "Handoff";
type PeriodOption = "7" | "30" | "90";
type SortOption = "recent" | "unread" | "messages";
type TabOption = "stats" | "conversation";
type MessageDirection = "inbound" | "outbound";

type Attachment = {
  type: "image" | "file" | "audio";
  label: string;
  mediaPath?: string;
};

type Message = {
  id: string;
  direction: MessageDirection;
  text: string;
  sentAt: string;
  attachment?: Attachment;
  mediaPath?: string;
  transcriptStatus?: TranscriptStatus;
  transcript?: string | null;
  transcriptError?: string | null;
  authorType?: "agent" | "human" | "customer";
  automationStart?: string | null;
  automationEnd?: string | null;
};

type Conversation = {
  id: string;
  contactName: string;
  contactHandle: string;
  channel: ChannelOption;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
  status: StatusOption;
  messages: Message[];
  tags: string[];
  metadata?: Record<string, unknown>;
  automationState: string;
  lastErrorMessage?: string | null;
  nextReplyAt?: string | null;
  summary?: string | null;
};

const channelFilterOptions: ChannelFilterOption[] = [
  "All",
  "Instagram",
  "WhatsApp",
  "Telegram",
];

const channelFilterIcons: Record<ChannelOption, string> = {
  Instagram: "/logoConnectors/instagram.svg",
  WhatsApp: "/logoConnectors/whatsapp.webp",
  Telegram: "https://cdn.simpleicons.org/telegram/229ED9",
};

const periodOptions: { label: string; value: PeriodOption }[] = [
  { label: "7j", value: "7" },
  { label: "30j", value: "30" },
  { label: "90j", value: "90" },
];

const statusFilterOptions = ["Tous", "Ouvert", "Clos"] as const;
const sortOptionLabels: Record<SortOption, string> = {
  recent: "Recent",
  unread: "Non lus",
  messages: "Plus de messages envoyes",
};
const sortOptions: SortOption[] = ["recent", "unread", "messages"];

const channelColors: Record<ChannelOption, string> = {
  Instagram: "var(--app-primary)",
  WhatsApp: "var(--app-success)",
  Telegram: "var(--app-accent)",
};

const periodMultipliers: Record<PeriodOption, number> = {
  "7": 1,
  "30": 1.35,
  "90": 1.75,
};

const channelCycle: ChannelOption[] = ["Instagram", "WhatsApp", "Telegram"];

const demoAudioMessage: Message = {
  id: "demo-audio-message",
  direction: "inbound",
  text: "",
  sentAt: new Date().toISOString(),
  authorType: "customer",
  mediaPath:
    "https://cdn.pixabay.com/download/audio/2021/08/04/audio_1f67d0c1c6.mp3?filename=rain-49749.mp3",
  transcriptStatus: "done",
  transcript: "Transcription de démonstration d’un message vocal.",
  transcriptError: null,
};

const formatRelativeTime = (iso: string) => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.round((now - then) / 60000));
  if (diffMinutes < 60) {
    return `il y a ${diffMinutes} min`;
  }
  if (diffMinutes < 1440) {
    return `il y a ${Math.floor(diffMinutes / 60)} h`;
  }
  return `il y a ${Math.floor(diffMinutes / 1440)} j`;
};

const formatDateSeparator = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    return "Aujourd'hui";
  }
  if (messageDate.getTime() === yesterday.getTime()) {
    return "Hier";
  }

  // Si c'est cette semaine, afficher le jour
  const daysDiff = Math.floor((today.getTime() - messageDate.getTime()) / (24 * 60 * 60 * 1000));
  if (daysDiff < 7 && daysDiff >= 2) {
    return date.toLocaleDateString("fr-FR", { weekday: "long" });
  }

  // Sinon, afficher la date complète
  return date.toLocaleDateString("fr-FR", { 
    day: "numeric", 
    month: "long" 
  });
};

const normalizeChannel = (platform?: string): ChannelOption => {
  const normalized = platform?.toLowerCase();
  if (normalized === "instagram") {
    return "Instagram";
  }
  if (normalized === "whatsapp") {
    return "WhatsApp";
  }
  if (normalized === "telegram") {
    return "Telegram";
  }
  return "Instagram";
};

const mapConversationRecord = (record: any): Conversation => {
  const channel = normalizeChannel(record.platform);
  const messages =
    (record.conversation_messages ?? [])
      .map((message: any) => {
        // Gestion spécifique des messages vocaux (message_type = 'audio')
        const isAudioMessage = message.message_type === "audio";
        let mediaPath: string | null = null;
        let transcriptStatus: TranscriptStatus | undefined = undefined;
        let transcriptContent: string | null = null;
        let transcriptError: string | null = null;
        let attachment: any = undefined;

        if (isAudioMessage) {
          // Message vocal : utiliser les colonnes directes
          mediaPath = message.media_path || null;
          const rawTranscriptStatus = message.transcript_status;
          transcriptStatus = rawTranscriptStatus === "none" ? undefined : rawTranscriptStatus;
          transcriptContent = message.transcript || null;
          transcriptError = message.transcript_error || null;
          
          // Toujours créer un attachment pour les messages audio (même sans media_path)
          attachment = {
            type: "audio" as const,
            label: mediaPath ? "Message vocal" : "Message vocal (fichier manquant)",
            mediaPath: mediaPath || undefined,
          };
        } else {
          // Message non-vocal : vérifier les attachments
          const firstAttachment = Array.isArray(message.attachments)
            ? message.attachments[0]
            : null;
          if (firstAttachment) {
            const attachmentType =
              firstAttachment?.type === "audio"
                ? "audio"
                : firstAttachment?.type === "file"
                ? "file"
                : "image";
            const attachmentMediaPath =
              firstAttachment?.media_path ??
              firstAttachment?.mediaPath ??
              firstAttachment?.path ??
              firstAttachment?.url ??
              null;
            
            attachment = {
              type: attachmentType,
              label: firstAttachment.label ?? "Pièce jointe",
              mediaPath: attachmentMediaPath ?? undefined,
            };
            
            if (attachmentType === "audio") {
              mediaPath = attachmentMediaPath;
              transcriptStatus =
                (message.transcript_status as TranscriptStatus | undefined) ??
                (message.transcription_status as TranscriptStatus | undefined) ??
                undefined;
              transcriptContent =
                message.transcription ??
                message.transcript ??
                message.transcribed_text ??
                null;
              transcriptError =
                message.transcription_error ??
                message.transcript_error ??
                null;
            }
          }
        }
        return {
          id: `${record.id}-${message.id}`,
          direction: message.direction === "out" ? "outbound" : "inbound",
          text: message.body_text ?? "",
          sentAt: message.sent_at ?? message.created_at ?? new Date().toISOString(),
          attachment,
          mediaPath: mediaPath ?? undefined,
          transcriptStatus,
          transcript: transcriptContent,
          transcriptError,
          authorType:
            message.author_type === "human"
              ? "human"
              : message.author_type === "customer"
              ? "customer"
              : "agent",
          automationStart: message.automation_start ?? null,
          automationEnd: message.automation_end ?? null,
        };
      })
      .sort(
        (a: Message, b: Message) =>
          new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
      ) ?? [];
  const lastMessage = record.last_message_preview ?? messages[messages.length - 1]?.text ?? "";
  return {
    id: String(record.id),
    contactName: record.contact_display_name ?? record.contact_handle ?? "Contact",
    contactHandle: record.contact_handle ?? "",
    channel,
    lastMessage,
    lastAt:
      record.last_message_at ??
      record.updated_at ??
      record.created_at ??
      new Date().toISOString(),
    unreadCount: record.unread_count ?? 0,
    status:
      record.automation_state === "stopped"
        ? "Clos"
        : record.automation_state === "scheduled"
        ? "Handoff"
        : "Ouvert",
    messages,
    tags: record.heat_tag ? [record.heat_tag] : [],
    metadata: record.metadata ?? {},
    automationState: record.automation_state ?? "idle",
    lastErrorMessage:
      record.last_error_message ?? record.error_message ?? null,
    nextReplyAt: record.next_reply_at ?? null,
    summary: record.summary ?? null,
  };
};

const heatTagStyles: Record<
  string,
  { background: string; border: string; color: string }
> = {
  cold: {
    background: "rgba(37, 99, 235, 0.12)",
    border: "rgba(37, 99, 235, 0.4)",
    color: "var(--app-primary)",
  },
  warm: {
    background: "rgba(245, 158, 11, 0.15)",
    border: "rgba(245, 158, 11, 0.4)",
    color: "var(--app-warning)",
  },
  hot: {
    background: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.4)",
    color: "var(--app-error)",
  },
  unknown: {
    background: "var(--app-bg)",
    border: "var(--app-border)",
    color: "var(--app-text-secondary)",
  },
};

const getHeatTagStyle = (tag?: string) => {
  if (!tag) {
    return {};
  }
  const normalized = tag.toLowerCase();
  return heatTagStyles[normalized] ?? heatTagStyles.unknown;
};

const ChannelBadge: FunctionComponent<{ channel: ChannelOption }> = ({
  channel,
}) => (
  <span
    className={styles.channelBadge}
    style={{ backgroundColor: channelColors[channel] }}
  >
    {channel}
  </span>
);

const truncateLabel = (value: string, maxLength = 18) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

const KpiCard: FunctionComponent<{
  label: string;
  value: string;
  delta: string;
  note?: string;
}> = ({ label, value, delta, note }) => (
  <article className={styles.claraKpiCard}>
    <div className={styles.claraKpiCardValue}>{value}</div>
    <div className={styles.claraKpiCardLabel}>{label}</div>
    {note && <div className={styles.claraKpiCardNote}>{note}</div>}
    {false&&<div className={styles.claraKpiCardDelta}>{delta}</div>}
  </article>
);

const TabButton: FunctionComponent<{
  label: string;
  active?: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    className={`${styles.claraTabButton} ${
      active ? styles.claraTabButtonActive : ""
    }`}
    onClick={onClick}
  >
    {label}
  </button>
);

const ChannelFilterGroup: FunctionComponent<{
  active: ChannelFilterOption;
  onChange: (value: ChannelFilterOption) => void;
  className?: string;
}> = ({ active, onChange, className = "" }) => (
  <div className={`${styles.channelFilterRow} ${className}`.trim()}>
    {channelFilterOptions.map((option) => (
      <button
        key={option}
        type="button"
        className={`${styles.channelChip} ${
          active === option ? styles.channelChipActive : ""
        }`}
        onClick={() => onChange(option)}
      >
        {option === "All" ? (
          "Tous"
        ) : (
          <>
            <img
              className={styles.channelChipIcon}
              src={channelFilterIcons[option]}
              alt=""
              aria-hidden="true"
              onError={(event) => {
                if (option === "Telegram") {
                  event.currentTarget.src = "/logoConnectors/telegram.svg";
                }
              }}
            />
            <span>{option}</span>
          </>
        )}
      </button>
    ))}
  </div>
);

const formatNextReply = (iso?: string | null) => {
  if (!iso) {
    return null;
  }
  const time = new Date(iso);
  const relativeMinutes = Math.max(
    0,
    Math.round((time.getTime() - Date.now()) / 60000),
  );
  const relative =
    relativeMinutes < 60
      ? `dans ${relativeMinutes} min`
      : `dans ${Math.round(relativeMinutes / 60)} h`;
  return {
    time: time.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    relative,
  };
};

const ConversationItem: FunctionComponent<{
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
}> = ({ conversation, isActive, onSelect }) => {
  const initials = conversation.contactName
    .split(" ")
    .map((token) => token.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <button
      type="button"
      className={`${styles.conversationItem} ${
        isActive ? styles.conversationItemActive : ""
      } ${
        conversation.automationState === "stopped"
          ? styles.conversationItemStopped
          : conversation.automationState === "error"
          ? styles.conversationItemError
          : conversation.automationState === "condition_stop"
          ? styles.conversationItemCondition
          : ""
      }`.trim()}
      onClick={onSelect}
    >
      <span className={styles.conversationAvatar}>{initials}</span>
      <div className={styles.conversationDetails}>
        <div className={styles.conversationTop}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>{conversation.contactName}</span>
            {conversation.contactHandle && (
              <span style={{ fontSize: '0.75em', color: 'var(--app-text-secondary)' }}>
                @{conversation.contactHandle}
              </span>
            )}
          </div>
          <div className={styles.conversationTopMeta}>
            <ChannelBadge channel={conversation.channel} />
      {conversation.automationState === "pending" && (
        <span className={styles.pendingBadge}>
          <span className={styles.pendingDot} />
          <span className={styles.pendingDot} />
          <span className={styles.pendingDot} />
          Agent en attente
        </span>
      )}
      {conversation.automationState === "scheduled" && (
        <span className={styles.scheduledBadge}>
          <span className={styles.scheduledDot} />
          {conversation.nextReplyAt ? (
            (() => {
              const formatted = formatNextReply(conversation.nextReplyAt);
              return formatted
                ? `Réponse prévue à ${formatted.time} (${formatted.relative})`
                : "Réponse planifiée";
            })()
          ) : (
            "Réponse planifiée"
          )}
        </span>
      )}
      {conversation.automationState === "error" && (
        <span className={styles.errorBadge}>
          <span className={styles.errorDot} />
          Erreur détectée
        </span>
      )}
      {conversation.automationState === "condition_stop" && (
        <span className={styles.conditionBadge}>
          <span className={styles.conditionDot} />
          condition stop
        </span>
      )}
      {conversation.automationState === "stopped" && (
        <span className={styles.stoppedBadge}>
          <span className={styles.stoppedDot} />
          Conversation arrêtée
        </span>
      )}
          </div>
        </div>
        <p className={styles.conversationPreview}>
          {conversation.lastMessage.length > 70 
            ? conversation.lastMessage.slice(0, 70) + "..." 
            : conversation.lastMessage}
        </p>
      {conversation.automationState === "error" && conversation.lastErrorMessage && (
        <div className={styles.conversationErrorMessage}>
          {conversation.lastErrorMessage}
        </div>
      )}
        <div className={styles.conversationBottom}>
          <span className={styles.conversationTime}>
            {formatRelativeTime(conversation.lastAt)}
          </span>
          {conversation.unreadCount > 0 && (
            <span className={styles.unreadDot} aria-label="Messages non lus" />
          )}
        </div>
      </div>
      {conversation.tags.length > 0 && (
        <span
          className={styles.tagChip}
          style={getHeatTagStyle(conversation.tags[0])}
        >
          {conversation.tags.join(" • ")}
        </span>
      )}
    </button>
  );
};

const ChatBubble: FunctionComponent<{ message: Message }> = ({ message }) => {
  const isOutbound = message.direction === "outbound";
  const label =
    message.authorType === "human"
      ? "Humain"
      : message.authorType === "agent"
      ? "Agent"
      : "Client";
  return (
    <div
      className={`${styles.chatBubble} ${
        isOutbound ? styles.chatBubbleOutbound : styles.chatBubbleInbound
      }`}
    >
      {label && (
        <span className={styles.chatBubbleSender}>{label}</span>
      )}
      <p style={{ whiteSpace: "pre-wrap" }}>{message.text}</p>
      {message.attachment && (
        <div className={styles.attachmentChip}>
          <span>
            {message.attachment.type === "image"
              ? "Image"
              : message.attachment.type === "audio"
              ? "Vocal"
              : "Fichier"} :
          </span>
          <strong>{message.attachment.label}</strong>
        </div>
      )}
      <span className={styles.chatBubbleTimestamp}>
        {new Date(message.sentAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
};

const DateSeparator: FunctionComponent<{ dateString: string }> = ({ dateString }) => {
  return (
    <div className={styles.dateSeparator}>
      <div className={styles.dateSeparatorLine} />
      <div className={styles.dateSeparatorText}>
        {formatDateSeparator(dateString)}
      </div>
      <div className={styles.dateSeparatorLine} />
    </div>
  );
};

const ConversationMessageItem: FunctionComponent<{ message: Message }> = ({
  message,
}) => {
  const isMine = message.direction === "outbound";
  
  // Afficher AudioMessageBubble si c'est un message vocal (même sans media_path)
  const isAudioMessage = message.mediaPath || message.attachment?.type === "audio";
  
  if (isAudioMessage) {
    return (
      <AudioMessageBubble
        messageId={message.id}
        mediaPath={message.mediaPath || ""}
        transcriptStatus={message.transcriptStatus ?? "processing"}
        transcript={message.transcript ?? undefined}
        transcriptError={message.transcriptError ?? undefined}
        isMine={isMine}
        createdAt={message.sentAt}
      />
    );
  }
  return <ChatBubble message={message} />;
};

const Dashboard: FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = (searchParams.get("tab") ?? "stats") as TabOption;
  const currentTab: TabOption = rawTab === "conversation" ? "conversation" : "stats";
  const [period, setPeriod] = useState<PeriodOption>("7");
  const [channelFilter, setChannelFilter] =
    useState<ChannelFilterOption>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("recent");
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusFilterOptions)[number]>("Tous");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    null
  );
  const [composerText, setComposerText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [isConfigMenuOpen, setConfigMenuOpen] = useState(false);
  const configMenuRef = useRef<HTMLDivElement | null>(null);
  const [isSortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const { displayedAgents } = useAgents();
  const agentConfigOptions = useMemo(
    () =>
      displayedAgents.map((agent) => {
        const value = agent.display_id ?? agent.agent_id;
        return {
          value,
          label: agent.name,
          agentDefaultName: agent.agent_default_name ?? agent.name,
        };
      }),
    [displayedAgents],
  );

  const selectedAgent = useMemo(
    () => displayedAgents.find(
      (agent) => (agent.display_id ?? agent.agent_id) === selectedConfigId
    ),
    [displayedAgents, selectedConfigId],
  );

  const activeTabs = selectedAgent?.dashboard_tab_component ?? [];
  const effectiveCurrentTab: TabOption = activeTabs.includes(currentTab)
    ? currentTab
    : (activeTabs[0] as TabOption) ?? "stats";

  const {
    data: rawConversations = [],
    isLoading: conversationsLoading,
    isError: conversationsError,
    error: conversationsErrorDetails,
  } = useClaraConversations(selectedConfigId ?? undefined);
  const conversationData = useMemo(
    () => rawConversations.map(mapConversationRecord),
    [rawConversations],
  );
  const [isStopDialogOpen, setStopDialogOpen] = useState(false);
  const [isDetailsOverlayOpen, setDetailsOverlayOpen] = useState(false);
  const [isSummaryModalOpen, setSummaryModalOpen] = useState(false);
  const [isErrorDetailOpen, setErrorDetailOpen] = useState(false);

  const handleConfigChange = (value: string) => {
    setSelectedConfigId(value);
    setConfigMenuOpen(false);
  };

  useEffect(() => {
    if (agentConfigOptions.length === 0) {
      if (selectedConfigId !== null) {
        setSelectedConfigId(null);
      }
      setConfigMenuOpen(false);
      return;
    }
    if (
      !selectedConfigId ||
      !agentConfigOptions.some((option) => option.value === selectedConfigId)
    ) {
      setSelectedConfigId(agentConfigOptions[0].value);
    }
  }, [agentConfigOptions, selectedConfigId]);

  useEffect(() => {
    if (!isConfigMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (
        configMenuRef.current &&
        !configMenuRef.current.contains(event.target as Node)
      ) {
        setConfigMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isConfigMenuOpen]);

  useEffect(() => {
    if (!isSortMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(event.target as Node)
      ) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSortMenuOpen]);

  const activeConfigOption = agentConfigOptions.find(
    (option) => option.value === selectedConfigId,
  );

  useEffect(() => {
    if (conversationsLoading) {
      return;
    }
    if (conversationData.length === 0) {
      setSelectedConversationId(null);
      return;
    }
    if (
      !selectedConversationId ||
      !conversationData.some(
        (conversation) => conversation.id === selectedConversationId,
      )
    ) {
      setSelectedConversationId(conversationData[0].id);
    }
  }, [conversationData, conversationsLoading, selectedConversationId]);

  const updateTab = (value: TabOption) => {
    if (value === currentTab) {
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    setSearchParams(params);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredConversations = useMemo(
    () =>
      conversationData.filter((conversation) => {
        const matchesChannel =
          channelFilter === "All" || conversation.channel === channelFilter;
        const matchesStatus =
          statusFilter === "Tous" || conversation.status === statusFilter;
        const inSearch =
          !normalizedSearch ||
          conversation.contactName.toLowerCase().includes(normalizedSearch) ||
          conversation.lastMessage.toLowerCase().includes(normalizedSearch) ||
          conversation.messages.some((message) =>
            message.text.toLowerCase().includes(normalizedSearch)
          );
        return matchesChannel && matchesStatus && inSearch;
      }),
    [conversationData, channelFilter, statusFilter, normalizedSearch]
  );

  const sortedConversations = useMemo(() => {
    const copy = [...filteredConversations];
    if (sortOption === "recent") {
      copy.sort(
        (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
      );
    } else if (sortOption === "unread") {
      copy.sort((a, b) => b.unreadCount - a.unreadCount);
    } else {
      copy.sort((a, b) => b.messages.length - a.messages.length);
    }
    return copy;
  }, [filteredConversations, sortOption]);

  const visibleConversationCount = filteredConversations.length;

  useEffect(() => {
    if (
      selectedConversationId &&
      !sortedConversations.some(
        (conversation) => conversation.id === selectedConversationId
      )
    ) {
      setSelectedConversationId(sortedConversations[0]?.id ?? null);
    }
  }, [sortedConversations, selectedConversationId]);

  const activeConversation =
    sortedConversations.find(
      (conversation) => conversation.id === selectedConversationId
    ) ?? sortedConversations[0] ??
    null;
  const isConversationStopped = Boolean(
    activeConversation &&
      ["stopped", "condition_stop", "error"].includes(
        activeConversation.automationState,
      ),
  );
  const isConditionStop =
    activeConversation?.automationState === "condition_stop";
  const messagesForDisplay = useMemo(() => {
    if (!activeConversation) {
      return [];
    }
    const messages = activeConversation.messages;
    const messagesWithSeparators: Array<Message | { type: 'date-separator'; date: string; id: string }> = [];

    for (let i = 0; i < messages.length; i++) {
      const currentMessage = messages[i];
      const currentDate = new Date(currentMessage.sentAt);
      const currentDayString = currentDate.toDateString();

      // Vérifier si on doit ajouter un séparateur de date
      if (i === 0) {
        // Premier message, toujours ajouter un séparateur
        messagesWithSeparators.push({
          type: 'date-separator',
          date: currentMessage.sentAt,
          id: `date-${currentDayString}`
        });
      } else {
        const previousMessage = messages[i - 1];
        const previousDate = new Date(previousMessage.sentAt);
        const previousDayString = previousDate.toDateString();

        // Si le jour a changé, ajouter un séparateur
        if (currentDayString !== previousDayString) {
          messagesWithSeparators.push({
            type: 'date-separator',
            date: currentMessage.sentAt,
            id: `date-${currentDayString}`
          });
        }
      }

      messagesWithSeparators.push(currentMessage);
    }

    return messagesWithSeparators;
  }, [activeConversation]);

  const previousConversationRef = useRef<{
    id: string | null;
    messagesLength: number;
  }>({ id: null, messagesLength: 0 });

  useEffect(() => {
    if (!activeConversation) {
      return;
    }
    const previous = previousConversationRef.current;
    const currentId = activeConversation.id;
    const currentLength = activeConversation.messages.length;

    if (
      previous.id === currentId &&
      previous.messagesLength !== currentLength
    ) {
      // Scroll smooth pour les nouveaux messages dans la même conversation
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: "smooth"
        });
      }
    }

    previousConversationRef.current = {
      id: currentId,
      messagesLength: currentLength,
    };
  }, [activeConversation]);

  // Scroll vers le bas quand on change de conversation ou au chargement initial
  useEffect(() => {
    if (messagesForDisplay.length > 0 && messagesContainerRef.current) {
      // Utiliser un petit délai pour s'assurer que le DOM est mis à jour
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 100);
    }
  }, [selectedConversationId, messagesForDisplay.length]);

  useEffect(() => {
    setErrorDetailOpen(false);
  }, [activeConversation?.id, activeConversation?.lastErrorMessage]);

  const stats = useMemo(() => {
    const periodMultiplier = periodMultipliers[period];
    const days = period === "7" ? 7 : period === "30" ? 30 : 90;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let totalResponseMs = 0;
    let responsePairs = 0;
    const responses = filteredConversations.reduce((acc, conversation) => {
      acc += conversation.messages.filter(
        (message) => message.authorType === "agent" && new Date(message.sentAt) >= cutoffDate,
      ).length;
      for (const message of conversation.messages) {
        if (
          message.authorType !== "agent" ||
          new Date(message.sentAt) < cutoffDate ||
          !message.automationStart ||
          !message.automationEnd
        ) {
          continue;
        }
        const diff =
          new Date(message.automationEnd).getTime() -
          new Date(message.automationStart).getTime();
        if (diff > 0) {
          totalResponseMs += diff;
          responsePairs += 1;
        }
      }
      return acc;
    }, 0);
    const messagesReceived = filteredConversations.reduce(
      (acc, conversation) =>
        acc +
        conversation.messages.filter(
          (message) => message.direction === "inbound" && new Date(message.sentAt) >= cutoffDate,
        ).length,
      0,
    );
    const activeConversations = filteredConversations.filter(
      (conversation) => conversation.status === "Ouvert",
    ).length;
    const averageResponseSeconds =
      responsePairs === 0 ? 0 : Math.round((totalResponseMs / responsePairs) / 1000);
    return {
      responses: responses,
      messages: messagesReceived,
      active: activeConversations,
      responseTime: averageResponseSeconds,
    };
  }, [filteredConversations, period]);

  const evolutionData = useMemo(() => {
    const days = period === "7" ? 7 : period === "30" ? 30 : 90;
    const now = new Date();
    const dataPoints: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const targetDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const targetDateString = targetDate.toDateString();
      
      let messagesCount = 0;
      
      filteredConversations.forEach(conversation => {
        conversation.messages.forEach(message => {
          const messageDate = new Date(message.sentAt);
          if (message.authorType === "agent" && 
              message.direction === "outbound" && 
              messageDate.toDateString() === targetDateString) {
            messagesCount++;
          }
        });
      });
      
      dataPoints.push(messagesCount);
    }
    
    return dataPoints;
  }, [filteredConversations, period]);

  const deltas = {
    responses: period === "7" ? "+12% vs précédent" : "+8% vs précédent",
    messages: period === "7" ? "+10% vs précédent" : "+6% vs précédent",
    active: period === "7" ? "+3% vs précédent" : "+1% vs précédent",
    responseTime:
      period === "7"
        ? "-24 s vs précédent"
        : period === "30"
        ? "-36 s vs précédent"
        : "-54 s vs précédent",
  };

  const kpiCards = [
    {
      label: "Réponses envoyées de l'agent",
      value: `${stats.responses.toLocaleString("fr-FR")}`,
      delta: deltas.responses,
      note: "Agent uniquement",
    },
    {
      label: "Messages reçus",
      value: `${stats.messages.toLocaleString("fr-FR")}`,
      delta: deltas.messages,
    },
    {
      label: "Conversations actives",
      value: `${stats.active}`,
      delta: deltas.active,
    },
      {
        label: "Temps de réponse moyen",
        value: `${stats.responseTime.toLocaleString("fr-FR")} s`,
        delta: deltas.responseTime,
      },
  ];

  const channelStats = useMemo(() => {
    const days = period === "7" ? 7 : period === "30" ? 30 : 90;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const bucket: Record<ChannelOption, number> = {
      Instagram: 0,
      WhatsApp: 0,
      Telegram: 0,
    };
    
    filteredConversations.forEach((conversation) => {
      const agentMessages = conversation.messages.filter(
        (message) => message.direction === "outbound" && 
                    message.authorType === "agent" &&
                    new Date(message.sentAt) >= cutoffDate
      ).length;
      bucket[conversation.channel] += agentMessages;
    });
    
    const maxBucket = Math.max(...Object.values(bucket), 1);
    return channelCycle.map((channel) => ({
      channel,
      count: bucket[channel],
      normalized: Math.round((bucket[channel] / maxBucket) * 100),
    }));
  }, [filteredConversations, period]);

  const maxChannelCount =
    Math.max(...channelStats.map((stat) => stat.count)) || 1;

  const sparklineMax = Math.max(...evolutionData, 1);

  const topConversations = sortedConversations.slice(0, 5);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSortChange = (value: SortOption) => {
    setSortOption(value);
    setSortMenuOpen(false);
  };

  const queryClient = useQueryClient();

  const handleSendMessage = async () => {
    if (!composerText.trim() || !activeConversation || !selectedConfigId) {
      return;
    }

    const messageText = composerText.trim();
    const tempId = `temp-${Date.now()}`;
    
    // 1. Créer le message optimiste
    const optimisticMessage = {
      id: `${activeConversation.id}-${tempId}`,
      direction: "outbound" as const,
      text: messageText,
      sentAt: new Date().toISOString(),
      attachment: undefined,
      mediaPath: undefined,
      transcriptStatus: undefined,
      transcript: null,
      transcriptError: null,
      authorType: "human" as const,
      automationStart: null,
      automationEnd: null,
    };

    // 2. Mettre à jour React Query optimistiquement
    const queryKey = ["clara-conversations", selectedConfigId];
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      
      return oldData.map((conv: any) =>
        conv.id === activeConversation.id
          ? {
              ...conv,
              messages: [
                ...conv.messages,
                optimisticMessage
              ]
            }
          : conv
      );
    });

    // 3. Vider le champ immédiatement
    setComposerText("");

    try {
      // 4. Envoyer à l'API
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        console.error("Impossible de récupérer la session", sessionError);
        throw new Error("Session error");
      }
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        console.error("Token d'accès manquant pour envoyer le message");
        throw new Error("Access token missing");
      }
      
      const response = await fetch(
        "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/callback-relay/insta/send-message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            conversation_id: Number(activeConversation.id),
            platform: activeConversation.channel,
            text: messageText,
          }),
        }
      );
      
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) {
        console.error(
          "Impossible d'envoyer le message via la fonction callback",
          payload
        );
        throw new Error("API error");
      }

      // 5. Succès : React Query sera mis à jour via Realtime
      // Le message optimiste sera remplacé par le vrai message
      
    } catch (error) {
      console.error("Erreur lors de l'envoi du message", error);
      
      // 6. Rollback en cas d'erreur
      queryClient.setQueryData(queryKey, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        
        return oldData.map((conv: any) =>
          conv.id === activeConversation.id
            ? {
                ...conv,
                messages: conv.messages.filter((msg: any) => msg.id !== optimisticMessage.id)
              }
            : conv
        );
      });
      
      // Remettre le texte dans le champ
      setComposerText(messageText);
    }
  };

  const updateConversation = async (updates: Record<string, unknown>) => {
    if (!activeConversation) {
      return;
    }
    const { error } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", Number(activeConversation.id));
    if (error) {
      console.error("Impossible de mettre à jour la conversation", error);
    }
  };

  const handleDetailsClick = () => {
    setDetailsOverlayOpen(true);
  };

  const closeDetailsOverlay = () => {
    setDetailsOverlayOpen(false);
  };

  const handleSummaryClick = () => {
    setSummaryModalOpen(true);
  };

  const closeSummaryModal = () => {
    setSummaryModalOpen(false);
  };

  const handleErrorDetailOpen = () => {
    setErrorDetailOpen(true);
  };

  const closeErrorDetail = () => {
    setErrorDetailOpen(false);
  };

  const handleStopClick = () => {
    setStopDialogOpen(true);
  };

  const closeStopDialog = () => {
    setStopDialogOpen(false);
  };

  const confirmStopDialog = async () => {
    setStopDialogOpen(false);
    
    if (isConversationStopped) {
      // Si on reprend une conversation stoppée
      const wasError = activeConversation?.automationState === "error";
      
      if (wasError) {
        // Conversation en erreur → appeler l'Edge Function pour calculer idle/scheduled
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData?.session?.access_token) {
            throw new Error("Session invalide");
          }
          
          const response = await fetch(
            "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/get-supabase/message-error-scheduled",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${sessionData.session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                conversation_id: activeConversation?.id,
              }),
            }
          );
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          // L'Edge Function se charge de l'update, pas besoin d'updateConversation
        } catch (error) {
          console.error("Erreur lors de la reprise de conversation:", error);
          // Fallback en cas d'erreur : remettre en idle
          await updateConversation({ automation_state: "idle" });
        }
      } else {
        // Conversation stopped/condition_stop → remettre en idle directement
        await updateConversation({ automation_state: "idle" });
      }
    } else {
      // Arrêter la conversation → passer en stopped
      await updateConversation({ automation_state: "stopped" });
    }
  };

  const stopDialogMessage = isConversationStopped
    ? activeConversation?.automationState === "error"
      ? "Voulez-vous reprendre la conversation ? L'agent répondra à tous les messages reçus depuis l'erreur."
      : "Voulez-vous reprendre la conversation ?"
    : "Voulez-vous vraiment arrêter l’envoi sur cette conversation ? L'agent ne répondra désormais plus à cette conversation.";
  const stopDialogConfirmLabel = isConversationStopped ? "Reprendre" : "Arrêter";
  const chatErrorMessage =
    activeConversation?.lastErrorMessage ?? "";
  const isChatErrorTooLong = chatErrorMessage.length > 100;
  const chatErrorPreview = isChatErrorTooLong
    ? `${chatErrorMessage.slice(0, 100)}...`
    : chatErrorMessage;

  return (
    <AppLayout>
      <div className={styles.claraDashboardArea}>
        <div className={styles.claraDashboard}>
          <div className={styles.claraDashboardContent}>
        <header className={styles.claraHeader}>
          <div>
            <h1 className={styles.claraHeaderTitle}>
              DASHBOARD — {(activeConfigOption?.label ?? "Clara").toUpperCase()}
            </h1>
            <p className={styles.claraHeaderSubtitle}>
              Période :{" "}
              {
                periodOptions.find((item) => item.value === period)?.label
              }{" "}
              · Canal :{" "}
              {channelFilter === "All" ? "Tous les canaux" : channelFilter}
            </p>
          </div>
          <div className={styles.claraHeaderControls}>
            <div className={styles.claraPeriodButtons}>
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.claraPeriodButton} ${
                    period === option.value ? styles.claraPeriodButtonActive : ""
                  }`}
                  onClick={() => setPeriod(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <ChannelFilterGroup
              active={channelFilter}
              onChange={setChannelFilter}
            />
            <input
              className={styles.claraSearch}
              type="text"
              placeholder="Rechercher contact ou message"
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
        </header>
        {agentConfigOptions.length > 0 && (
          <div className={styles.claraConfigFocus}>
            <div className={styles.claraConfigFocusGroup}>
              <span className={styles.claraConfigLabel}>
                Configuration active
              </span>
              <div
                className={`${styles.claraConfigSelectWrap} ${
                  isConfigMenuOpen ? styles.claraConfigSelectWrapOpen : ""
                }`.trim()}
                ref={configMenuRef}
              >
                <button
                  type="button"
                  className={styles.claraConfigSelect}
                  onClick={() => setConfigMenuOpen((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={isConfigMenuOpen}
                  aria-label="Choisir une configuration d'agent"
                >
                  {(activeConfigOption?.label ?? "Selectionner un agent").toUpperCase()}
                </button>
                {isConfigMenuOpen && (
                  <div className={styles.claraConfigMenu} role="listbox">
                    {agentConfigOptions.map((option) => {
                      const isActive = selectedConfigId === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`${styles.claraConfigMenuItem} ${
                            isActive ? styles.claraConfigMenuItemActive : ""
                          }`.trim()}
                          onClick={() => handleConfigChange(option.value)}
                        >
                          {option.label.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTabs.length === 0 ? (
          <div className={styles.noTabsMessage}>
            <p>Aucune statistique définie pour cet agent.</p>
          </div>
        ) : (
          <>
            <div className={styles.claraTabRow}>
              {activeTabs.includes("stats") && (
                <TabButton
                  label="Statistiques"
                  active={effectiveCurrentTab === "stats"}
                  onClick={() => updateTab("stats")}
                />
              )}
              {activeTabs.includes("conversation") && (
                <TabButton
                  label="Conversations"
                  active={effectiveCurrentTab === "conversation"}
                  onClick={() => updateTab("conversation")}
                />
              )}
            </div>
        {effectiveCurrentTab === "stats" ? (
          <section className={styles.claraStatsGrid}>
            <div className={styles.claraKpiRow}>
              {kpiCards.map((card) => (
                <KpiCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  delta={card.delta}
                />
              ))}
            </div>
            <div className={styles.claraPanelRow}>
              <section className={styles.claraPanel}>
                <h3>Réponses par canal de l'agent</h3>
                <div className={styles.channelBarRow}>
                  {channelStats.map((item) => {
                    const barWidth = Math.max(
                      8,
                      Math.round((item.count / maxChannelCount) * 100)
                    );
                    return (
                      <div key={item.channel} className={styles.channelBar}>
                        <span className={styles.channelBarRowLabel}>
                          {item.channel}
                        </span>
                        <div className={styles.channelBarTrack}>
                          <span
                            className={styles.channelBarFill}
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: channelColors[item.channel],
                            }}
                          />
                        </div>
                        <span className={styles.channelBarRowLabel}>
                          {item.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className={styles.claraPanel}>
                <div className={styles.evolutionHeader}>
                  <h3>Messages envoyés par l'agent</h3>
                  <div className={styles.evolutionStats}>
                    <span className={styles.evolutionMax}>Max: {sparklineMax}</span>
                    <span className={styles.evolutionTotal}>
                      Total: {evolutionData.reduce((sum, val) => sum + val, 0)}
                    </span>
                  </div>
                </div>
                <div className={styles.claraSparkline}>
                  {evolutionData.map((value, index) => {
                    const height = Math.max(12, (value / sparklineMax) * 100);
                    const daysAgo = evolutionData.length - 1 - index;
                    const dateLabel = daysAgo === 0 ? "Aujourd'hui" : 
                                     daysAgo === 1 ? "Hier" : 
                                     `Il y a ${daysAgo}j`;
                    return (
                      <span
                        key={`${value}-${index}`}
                        className={styles.claraSparklineBar}
                        style={{ height: `${height}%` }}
                        data-tooltip={`${dateLabel}: ${value} message${value !== 1 ? 's' : ''}`}
                      />
                    );
                  })}
                </div>
              </section>
              <section className={styles.claraPanel}>
                <h3>Top conversations</h3>
                {topConversations.length === 0 ? (
                  <div className={styles.topConversationEmpty}>
                    Aucune conversation disponible.
                  </div>
                ) : (
                  <ul className={styles.claraPanelList}>
                    {topConversations.map((conversation) => (
                      <li key={conversation.id} className={styles.topConversationItem}>
                        <div>
                          <div>
                          <strong>{truncateLabel(conversation.contactName)}</strong>
                            {conversation.contactHandle && (
                              <span style={{ fontSize: '0.8em', color: 'var(--app-text-secondary)', marginLeft: '8px' }}>
                                @{conversation.contactHandle}
                              </span>
                            )}
                          </div>
                          <div className={styles.topConversationItemMeta}>
                            {formatRelativeTime(conversation.lastAt)} ·{" "}
                            <ChannelBadge channel={conversation.channel} />
                          </div>
                        </div>
                        <span className={styles.topConversationItemMeta}>
                          {conversation.messages.length} messages
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>
        ) : (
          <section className={styles.claraDetailsLayout}>
            <div className={styles.conversationPanel}>
              <div className={styles.conversationPanelHeader}>
                <h3>Conversations</h3>
                <div className={styles.conversationCountBadge}>
                  <span className={styles.conversationCountBadgeLabel}>
                    Conversations visibles
                  </span>
                  <span className={styles.conversationCountBadgeValue}>
                    {visibleConversationCount.toLocaleString("fr-FR")}
                  </span>
                </div>
              </div>
            <div className={styles.conversationFilters}>
              {statusFilterOptions.map((statusOption) => (
                <button
                  key={statusOption}
                  type="button"
                  className={`${styles.statusChip} ${
                    statusFilter === statusOption
                      ? styles.statusChipActive
                      : ""
                  }`}
                  onClick={() => setStatusFilter(statusOption)}
                >
                  {statusOption}
                </button>
              ))}
            </div>
              <div className={styles.conversationFilters}>
                <div
                  className={`${styles.detailsSortWrap} ${
                    isSortMenuOpen ? styles.detailsSortWrapOpen : ""
                  }`.trim()}
                  ref={sortMenuRef}
                >
                  <button
                    type="button"
                    className={styles.detailsSortButton}
                    onClick={() => setSortMenuOpen((prev) => !prev)}
                    aria-haspopup="listbox"
                    aria-expanded={isSortMenuOpen}
                    aria-label="Trier les conversations"
                  >
                    {sortOptionLabels[sortOption]}
                  </button>
                  {isSortMenuOpen && (
                    <div className={styles.detailsSortMenu} role="listbox">
                      {sortOptions.map((option) => {
                        const isActive = sortOption === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            className={`${styles.detailsSortMenuItem} ${
                              isActive ? styles.detailsSortMenuItemActive : ""
                            }`.trim()}
                            onClick={() => handleSortChange(option)}
                          >
                            {sortOptionLabels[option]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {!selectedConfigId ? (
                <div className={styles.conversationEmpty}>
                  Sélectionne une configuration pour charger les conversations.
                </div>
              ) : conversationsLoading ? (
                <div className={styles.conversationLoading}>Chargement...</div>
              ) : conversationsError ? (
                <div className={styles.conversationError}>
                  {conversationsErrorDetails?.message ??
                    "Impossible de charger les conversations."}
                </div>
              ) : (
                <div className={styles.conversationList}>
                  {sortedConversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isActive={conversation.id === activeConversation?.id}
                      onSelect={() => setSelectedConversationId(conversation.id)}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className={styles.chatPanel}>
              {activeConversation ? (
                <>
                  <div className={styles.chatHeader}>
                    <div className={styles.chatHeaderTop}>
                      <div className={styles.chatHeaderMeta}>
                        <h3 style={{ margin: 0 }}>
                          {activeConversation.contactName}
                          {activeConversation.contactHandle && (
                            <span style={{ fontSize: '0.8em', color: 'var(--app-text-secondary)', marginLeft: '8px' }}>
                              @{activeConversation.contactHandle}
                            </span>
                          )}
                        </h3>
                        <ChannelBadge channel={activeConversation.channel} />
                        <span className={styles.topConversationItemMeta}>
                          Statut : {activeConversation.status}
                        </span>
                      {activeConversation.automationState === "scheduled" && (
                        <span className={styles.chatScheduledLabel}>
                          {activeConversation.nextReplyAt ? (
                            (() => {
                              const formatted = formatNextReply(
                                activeConversation.nextReplyAt,
                              );
                              return formatted
                                ? `Réponse prévue à ${formatted.time} (${formatted.relative})`
                                : "Réponse planifiée";
                            })()
                          ) : (
                            "Réponse planifiée"
                          )}
                        </span>
                      )}
                      {activeConversation.automationState === "stopped" && (
                        <span className={styles.chatStoppedLabel}>
                          Conversation arrêtée – l’agent ne répondra plus
                        </span>
                      )}
                      {activeConversation.automationState === "error" && (
                        <span className={styles.chatErrorLabel}>
                          Erreur détectée
                        </span>
                      )}
                      {activeConversation.automationState === "error" &&
                        activeConversation.lastErrorMessage && (
                          <div className={styles.chatErrorMessageBlock}>
                            <span className={styles.chatErrorMessage}>
                              {chatErrorPreview}
                            </span>
                            {isChatErrorTooLong && (
                              <button
                                type="button"
                                className={styles.errorSeeMoreButton}
                                onClick={handleErrorDetailOpen}
                              >
                                Voir plus
                              </button>
                            )}
                          </div>
                        )}
                      {activeConversation.automationState === "condition_stop" && (
                        <span className={styles.chatConditionLabel}>
                          Condition stop active
                        </span>
                      )}
                    {activeConversation.automationState === "pending" && (
                      <span className={styles.chatPendingLabel}>
                        <span className={styles.pendingDot} />
                        En attente
                      </span>
                    )}
                      </div>
                      <div className={styles.chatHeaderTools}>
                        {activeConversation?.summary && (
                          <button
                            type="button"
                            className={styles.chatToolButton}
                            data-tooltip="Résumé de la conversation"
                            onClick={handleSummaryClick}
                          >
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 20 20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle cx="10" cy="10" r="9" fill="#2563EB" />
                              <text
                                x="10"
                                y="14"
                                textAnchor="middle"
                                fill="white"
                                fontSize="11"
                                fontWeight="600"
                                fontFamily="Inter, sans-serif"
                              >
                                ?
                              </text>
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.chatToolButton}
                          data-tooltip="Bientôt disponible"
                          onClick={handleDetailsClick}
                          disabled
                          aria-disabled="true"
                        >
                          <IconDetailsComingSoon />
                        </button>
                  {!isConditionStop && (
                    <button
                      type="button"
                      className={`${styles.chatToolButton} ${styles.orangeButton}`}
                      data-tooltip={
                        isConversationStopped
                          ? "Reprendre la conversation"
                          : "Arrêter l'envoi sur cette conversation"
                      }
                      onClick={handleStopClick}
                    >
                      {isConversationStopped ? (
                        <IconConversationPlay />
                      ) : (
                        <IconConversationStop />
                      )}
                    </button>
                  )}
                        {false&&<button type="button" className={styles.chatToolButton}>
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 18 18"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle cx="9" cy="9" r="1.25" fill="var(--app-text-primary)" />
                            <circle cx="4.5" cy="9" r="1.25" fill="var(--app-text-primary)" />
                            <circle cx="13.5" cy="9" r="1.25" fill="var(--app-text-primary)" />
                          </svg>
                        </button>}
                      </div>
                    </div>
                  </div>
                  {isDetailsOverlayOpen && (
                    <div
                      className={styles.detailsOverlayBackdrop}
                      role="presentation"
                      onClick={closeDetailsOverlay}
                    >
                      <div
                        className={styles.detailsOverlay}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className={styles.detailsOverlayHeader}>
                          <h4>Détails utilisateur</h4>
                          <button
                            type="button"
                            className={styles.detailsOverlayClose}
                            onClick={closeDetailsOverlay}
                          >
                            ×
                          </button>
                        </div>
                        <p className={styles.detailsOverlayLead}>
                          Ajoute des informations contextualisées pour cette conversation afin d’aider l'agent à répondre.
                        </p>
                        <label>
                          <span>Note rapide</span>
                          <textarea
                            rows={3}
                            placeholder="Par ex. 22 ans, intéressé par ma formation mais se reçoit sa paye le 22/10"
                          />
                        </label>
                        <div className={styles.detailsOverlayActions}>
                          <button
                            type="button"
                            className={styles.detailsOverlaySecondary}
                            onClick={closeDetailsOverlay}
                          >
                            Annuler
                          </button>
                          <button type="button" className={styles.detailsOverlayPrimary}>
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className={styles.chatMessages} ref={messagesContainerRef}>
                  {messagesForDisplay.map((item) => {
                      if ('type' in item && item.type === 'date-separator') {
                        return (
                          <DateSeparator
                            key={item.id}
                            dateString={item.date}
                          />
                        );
                      }
                      return (
                        <ConversationMessageItem
                          key={item.id}
                          message={item as Message}
                        />
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className={styles.chatComposer}>
                    <textarea
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                      placeholder="Écrire un message…"
                    />
                    <div className={styles.chatComposerActions}>
                      <span style={{ color: "var(--app-text-secondary)", fontSize: "12px" }}>
                        Canal actif : {activeConversation.channel}
                      </span>
                    <button
                      type="button"
                      className={styles.chatComposerSend}
                      onClick={handleSendMessage}
                      disabled={!composerText.trim()}
                    >
                      Envoyer
                    </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.chatEmpty}>
                  Sélectionnez une conversation pour ouvrir le chat
                </div>
              )}
            </div>
          </section>
        )}
          </>
        )}
        {isSummaryModalOpen && (
          <div className={styles.summaryModalBackdrop} onClick={closeSummaryModal}>
            <div className={styles.summaryModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.summaryModalHeader}>
                <h3>Résumé conversation</h3>
                <button 
                  type="button" 
                  className={styles.summaryModalClose}
                  onClick={closeSummaryModal}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 6.586L12.293 2.293a1 1 0 1 1 1.414 1.414L9.414 8l4.293 4.293a1 1 0 1 1-1.414 1.414L8 9.414l-4.293 4.293a1 1 0 1 1-1.414-1.414L6.586 8 2.293 3.707a1 1 0 0 1 1.414-1.414L8 6.586z"/>
                  </svg>
                </button>
              </div>
              <div className={styles.summaryModalContent}>
                <p>{activeConversation?.summary}</p>
              </div>
            </div>
          </div>
        )}
        {isErrorDetailOpen && activeConversation?.lastErrorMessage && (
          <div className={styles.errorModalBackdrop} onClick={closeErrorDetail}>
            <div className={styles.errorModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.errorModalHeader}>
                <h3>Message d'erreur</h3>
                <button
                  type="button"
                  className={styles.errorModalClose}
                  onClick={closeErrorDetail}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 6.586L12.293 2.293a1 1 0 1 1 1.414 1.414L9.414 8l4.293 4.293a1 1 0 1 1-1.414 1.414L8 9.414l-4.293 4.293a1 1 0 1 1-1.414-1.414L6.586 8 2.293 3.707a1 1 0 0 1 1.414-1.414L8 6.586z"/>
                  </svg>
                </button>
              </div>
              <div className={styles.errorModalContent}>
                <p>{activeConversation.lastErrorMessage}</p>
              </div>
            </div>
          </div>
        )}
        <ConfirmationDialog
          open={isStopDialogOpen}
          title="Confirmation"
          message={stopDialogMessage}
          onClose={closeStopDialog}
          onConfirm={confirmStopDialog}
          confirmLabel={stopDialogConfirmLabel}
          cancelLabel="Annuler"
        />
      </div>
    </div>
  </div>
    </AppLayout>
  );
};

export default Dashboard;
