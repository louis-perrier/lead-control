import {
  ChangeEvent,
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import NavigationBar from "../components/NavigationBar";
import GenericAvatar from "../components/GenericAvatar";
import ConfirmationDialog from "../components/ConfirmationDialog";
import styles from "./Dashboard.module.css";
import useAgents from "../hooks/useAgents";
import useClaraConversations from "../hooks/useClaraConversations";
import supabase from "../lib/supabase";

type ChannelOption = "Instagram" | "WhatsApp" | "Telegram";
type ChannelFilterOption = ChannelOption | "All";
type StatusOption = "Ouvert" | "Clos" | "Handoff";
type PeriodOption = "7" | "30" | "90";
type SortOption = "recent" | "unread" | "messages";
type TabOption = "stats" | "details";
type MessageDirection = "inbound" | "outbound";

type Attachment = {
  type: "image" | "file";
  label: string;
};

type Message = {
  id: string;
  direction: MessageDirection;
  text: string;
  sentAt: string;
  attachment?: Attachment;
  authorType?: "agent" | "human" | "customer";
};

type Conversation = {
  id: string;
  contactName: string;
  channel: ChannelOption;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
  status: StatusOption;
  messages: Message[];
  tags: string[];
  metadata?: Record<string, unknown>;
  automationState: string;
};

const channelFilterOptions: ChannelFilterOption[] = [
  "All",
  "Instagram",
  "WhatsApp",
  "Telegram",
];

const periodOptions: { label: string; value: PeriodOption }[] = [
  { label: "7j", value: "7" },
  { label: "30j", value: "30" },
  { label: "90j", value: "90" },
];

const statusFilterOptions = ["Tous", "Ouvert", "Clos", "Handoff"] as const;

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
        const firstAttachment = Array.isArray(message.attachments)
          ? message.attachments[0]
          : null;
        return {
          id: `${record.id}-${message.id}`,
          direction: message.direction === "out" ? "outbound" : "inbound",
          text: message.body_text ?? "",
          sentAt: message.sent_at ?? message.created_at ?? new Date().toISOString(),
          attachment: firstAttachment
            ? {
                type:
                  firstAttachment.type === "file" ? "file" : "image",
                label: firstAttachment.label ?? "Pièce jointe",
              }
            : undefined,
          authorType:
            message.author_type === "human"
              ? "human"
              : message.author_type === "customer"
              ? "customer"
              : "agent",
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
    <div className={styles.claraKpiCardDelta}>{delta}</div>
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
        {option === "All" ? "Tous" : option}
      </button>
    ))}
  </div>
);

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
      }`}
      onClick={onSelect}
    >
      <span className={styles.conversationAvatar}>{initials}</span>
      <div className={styles.conversationDetails}>
        <div className={styles.conversationTop}>
          <span>{conversation.contactName}</span>
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
          </div>
        </div>
        <p className={styles.conversationPreview}>{conversation.lastMessage}</p>
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
      <p>{message.text}</p>
      {message.attachment && (
        <div className={styles.attachmentChip}>
          <span>
            {message.attachment.type === "image" ? "Image" : "Fichier"} :
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

const Dashboard: FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = (searchParams.get("tab") ?? "stats") as TabOption;
  const currentTab: TabOption = rawTab === "details" ? "details" : "stats";
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
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
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

  const handleConfigChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedConfigId(event.target.value);
  };

  useEffect(() => {
    if (agentConfigOptions.length === 0) {
      if (selectedConfigId !== null) {
        setSelectedConfigId(null);
      }
      return;
    }
    if (
      !selectedConfigId ||
      !agentConfigOptions.some((option) => option.value === selectedConfigId)
    ) {
      setSelectedConfigId(agentConfigOptions[0].value);
    }
  }, [agentConfigOptions, selectedConfigId]);

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
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    previousConversationRef.current = {
      id: currentId,
      messagesLength: currentLength,
    };
  }, [activeConversation]);

  const stats = useMemo(() => {
    const periodMultiplier = periodMultipliers[period];
    let totalResponseMs = 0;
    let responsePairs = 0;
    const responses = filteredConversations.reduce((acc, conversation) => {
      acc += conversation.messages.filter(
        (message) => message.authorType === "agent",
      ).length;
      for (let i = 0; i < conversation.messages.length; i += 1) {
        const current = conversation.messages[i];
        if (current.direction !== "inbound") {
          continue;
        }
        const nextOutbound = conversation.messages.slice(i + 1).find(
          (message) => message.direction === "outbound",
        );
        if (nextOutbound) {
          const diff =
            new Date(nextOutbound.sentAt).getTime() -
            new Date(current.sentAt).getTime();
          if (diff > 0) {
            totalResponseMs += diff;
            responsePairs += 1;
          }
        }
      }
      return acc;
    }, 0);
    const messagesReceived = filteredConversations.reduce(
      (acc, conversation) =>
        acc +
        conversation.messages.filter(
          (message) => message.direction === "inbound",
        ).length,
      0,
    );
    const activeConversations = filteredConversations.filter(
      (conversation) => conversation.status === "Ouvert",
    ).length;
    const averageResponseSeconds =
      responsePairs === 0 ? 0 : Math.round((totalResponseMs / responsePairs) / 1000);
    return {
      responses: Math.round(responses * periodMultiplier * 0.95),
      messages: Math.round(messagesReceived * periodMultiplier * 0.9),
      active: activeConversations,
      responseTime: averageResponseSeconds,
    };
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
    const bucket: Record<ChannelOption, number> = {
      Instagram: 0,
      WhatsApp: 0,
      Telegram: 0,
    };
    filteredConversations.forEach((conversation) => {
      const agentMessages = conversation.messages.filter(
        (message) => message.direction === "outbound" && message.authorType === "agent",
      ).length;
      bucket[conversation.channel] += agentMessages;
    });
    const maxBucket = Math.max(...Object.values(bucket), 1);
    return channelCycle.map((channel) => ({
      channel,
      count: bucket[channel],
      normalized: Math.round((bucket[channel] / maxBucket) * 100),
    }));
  }, [filteredConversations]);

  const maxChannelCount =
    Math.max(...channelStats.map((stat) => stat.count)) || 1;

  const sparklinePoints = useMemo(() => {
    const length = period === "7" ? 7 : period === "30" ? 30 : 30;
    const numericPeriod = Number(period);
    return Array.from({ length }).map((_, index) => {
      const base =
        24 + index * 0.8 + filteredConversations.length * 0.35 + numericPeriod;
      const fluctuation = Math.sin(index * 0.5) * 6;
      return Math.max(
        6,
        Math.round((base + fluctuation) * periodMultipliers[period])
      );
    });
  }, [filteredConversations, period]);
  const sparklineMax = Math.max(...sparklinePoints);

  const topConversations = sortedConversations.slice(0, 5);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSortOption(event.target.value as SortOption);
  };

  const handleSendMessage = async () => {
    if (isSending || !composerText.trim() || !activeConversation) {
      return;
    }
    setIsSending(true);
    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        console.error("Impossible de récupérer la session", sessionError);
        return;
      }
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        console.error("Token d'accès manquant pour envoyer le message");
        return;
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
            text: composerText.trim(),
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) {
        console.error(
          "Impossible d'envoyer le message via la fonction callback",
          payload
        );
        return;
      }
      setComposerText("");
    } catch (error) {
      console.error("Erreur lors de l'appel à la fonction callback", error);
    } finally {
      setIsSending(false);
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

  const handleStopClick = () => {
    setStopDialogOpen(true);
  };

  const closeStopDialog = () => {
    setStopDialogOpen(false);
  };

  const confirmStopDialog = () => {
    setStopDialogOpen(false);
  };

  return (
    <div className={styles.claraWrapper}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="dashboard"
      />
      <div className={styles.claraDashboardArea}>
        <div className={styles.claraDashboard}>
          <GenericAvatar variant="header" />
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
              <select
                className={styles.claraConfigSelect}
                value={selectedConfigId ?? ""}
                onChange={handleConfigChange}
                aria-label="Choisir une configuration d'agent"
              >
                {agentConfigOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className={styles.claraTabRow}>
          <TabButton
            label="Statistiques"
            active={currentTab === "stats"}
            onClick={() => updateTab("stats")}
          />
          <TabButton
            label="Détails"
            active={currentTab === "details"}
            onClick={() => updateTab("details")}
          />
        </div>
        {currentTab === "stats" ? (
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
                <div className={styles.panelComingSoonOverlay}>
                  BIENTÔT DISPONIBLE
                </div>
                <h3>Évolution sur la période</h3>
                <div className={styles.claraSparkline}>
                  {sparklinePoints.map((value, index) => {
                    const height = Math.max(12, (value / sparklineMax) * 100);
                    return (
                      <span
                        key={`${value}-${index}`}
                        className={styles.claraSparklineBar}
                        style={{ height: `${height}%` }}
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
                          <strong>{conversation.contactName}</strong>
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
              <h3>Conversations</h3>
            <div className={styles.conversationCountBadge}>
              <span className={styles.conversationCountBadgeLabel}>
                Conversations visibles
              </span>
              <span className={styles.conversationCountBadgeValue}>
                {visibleConversationCount.toLocaleString("fr-FR")}
              </span>
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
                <select
                  value={sortOption}
                  onChange={handleSortChange}
                  className={styles.claraPeriodButton}
                  style={{ borderRadius: "10px" }}
                >
                  <option value="recent">Récent</option>
                  <option value="unread">Non lus</option>
                  <option value="messages">Plus de messages envoyés</option>
                </select>
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
                        <h3 style={{ margin: 0 }}>{activeConversation.contactName}</h3>
                        <ChannelBadge channel={activeConversation.channel} />
                        <span className={styles.topConversationItemMeta}>
                          Statut : {activeConversation.status}
                        </span>
                    {activeConversation.automationState === "pending" && (
                      <span className={styles.chatPendingLabel}>
                        <span className={styles.pendingDot} />
                        En attente
                      </span>
                    )}
                      </div>
                      <div className={styles.chatHeaderTools}>
                        <button
                          type="button"
                          className={styles.chatToolButton}
                          data-tooltip="Ajouter des détails sur l'utilisateur"
                          onClick={handleDetailsClick}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 18 18"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle cx="9" cy="6" r="4" stroke="var(--app-text-primary)" strokeWidth="1.5" />
                            <path
                              d="M4 15C4 12.2386 6.23858 10 9 10C11.7614 10 14 12.2386 14 15"
                              stroke="var(--app-text-primary)"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                            <path
                              d="M14 6H17M15.5 4.5V7.5"
                              stroke="var(--app-text-primary)"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={styles.chatToolButton}
                          data-tooltip="Arrêter l'envoi sur cette conversation"
                          onClick={handleStopClick}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 18 18"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect
                              x="3.5"
                              y="3.5"
                              width="11"
                              height="11"
                              rx="2"
                              stroke="var(--app-text-primary)"
                              strokeWidth="1.5"
                            />
                            <path
                              d="M7 7L11 11M11 7L7 11"
                              stroke="var(--app-text-primary)"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                        <button type="button" className={styles.chatToolButton}>
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
                        </button>
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
                  <div className={styles.chatMessages}>
                    {(activeConversation.messages ?? []).map((message) => (
                      <ChatBubble key={message.id} message={message} />
                    ))}
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
                      disabled={isSending || !composerText.trim()}
                      aria-busy={isSending}
                    >
                      {isSending && (
                        <span
                          className={styles.chatComposerSpinner}
                          aria-hidden="true"
                        />
                      )}
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
        <ConfirmationDialog
          open={isStopDialogOpen}
          title="Confirmation"
          message="Voulez-vous vraiment arrêter l’envoi sur cette conversation ? Vous ne pourrez plus la réactiver."
          onClose={closeStopDialog}
          onConfirm={confirmStopDialog}
          confirmLabel="Arrêter"
          cancelLabel="Annuler"
        />
      </div>
    </div>
  </div>
</div>
  );
};

export default Dashboard;
