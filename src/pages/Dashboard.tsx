import {
  ChangeEvent,
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import styles from "./Dashboard.module.css";

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
};

type ConversationSeed = {
  contactName: string;
  channel: ChannelOption;
  status: StatusOption;
  unreadCount: number;
  lastMessage: string;
  lastMessageMinutesAgo: number;
  tags?: string[];
  attachment?: Attachment;
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

const quickReplies = [
  "Oui, je m’en occupe dans l’heure.",
  "Je reviens vers vous avec les détails.",
  "Je dois vérifier, je vous redis.",
  "Laissez-moi un instant, je vous envoie un tag.",
];

const channelColors: Record<ChannelOption, string> = {
  Instagram: "#c026d3",
  WhatsApp: "#10b981",
  Telegram: "#2563eb",
};

const periodMultipliers: Record<PeriodOption, number> = {
  "7": 1,
  "30": 1.35,
  "90": 1.75,
};

const baseTimestamp = Date.UTC(2026, 1, 15, 11, 30, 0);

const names = [
  "Anaïs Dupont",
  "Léo Martin",
  "Maya Leclerc",
  "Ruben Silvestre",
  "Sara Benali",
  "Noé Roux",
  "Sophie Tran",
  "Yara Petit",
  "Camille Vasseur",
  "Adam Gauthier",
  "Inès Courtois",
  "Maé Boucher",
  "Lina Dubois",
  "Nolan Chartier",
  "Zara Vidal",
  "Elias Fontaine",
  "Elia Lefebvre",
  "Théo Lemaire",
  "Anaëlle Roche",
  "Romain Durand",
  "Léna Perrot",
  "Maxime Laurent",
  "Clara Moreau",
  "Jade Roche",
  "Chloé Bernard",
];

const lastMessages = [
  "Merci pour la démo !",
  "Tu peux me rappeler sur le projet ?",
  "Je souhaite revoir la séquence.",
  "On se cale un rendez-vous à 14h.",
  "Les leads tiennent encore.",
  "Je veux activer WhatsApp.",
  "Est-ce que tout est sauvegardé ?",
  "Le canal Telegram reste ouvert.",
  "Ton dernier message est bloqué.",
  "Je veux tester un nouveau tag.",
  "Où en est la configuration ?",
  "Je passe en mode manuel.",
];

const channelCycle: ChannelOption[] = ["Instagram", "WhatsApp", "Telegram"];
const statusCycle: StatusOption[] = ["Ouvert", "Ouvert", "Clos", "Handoff"];

const conversationSeeds: ConversationSeed[] = names.map((name, index) => {
  return {
    contactName: name,
    channel: channelCycle[index % channelCycle.length],
    status: statusCycle[index % statusCycle.length],
    unreadCount: index % 4 === 0 ? 0 : (index % 3) + 1,
    lastMessage: lastMessages[index % lastMessages.length],
    lastMessageMinutesAgo: 5 + (index % 10) * 3,
    tags:
      index % 5 === 0
        ? ["À relancer"]
        : index % 7 === 0
        ? ["VIP"]
        : undefined,
    attachment:
      index % 6 === 0
        ? { type: "image", label: "capture-écran.png" }
        : index % 9 === 0
        ? { type: "file", label: "devis.pdf" }
        : undefined,
  };
});

const buildConversation = (seed: ConversationSeed, index: number): Conversation => {
  const firstName = seed.contactName.split(" ")[0];
  const baseOffset = seed.lastMessageMinutesAgo + index * 2;
  const templateMessages: Array<{
    direction: MessageDirection;
    text: string;
    minutesAgo: number;
    attachment?: Attachment;
  }> = [
    {
      direction: "inbound",
      text: `Bonjour ${firstName}, je reviens vers vous pour valider la configuration ${seed.channel}.`,
      minutesAgo: baseOffset + 12,
    },
    {
      direction: "outbound",
      text: `Merci ${firstName}, voici le retour rapide demandé.`,
      minutesAgo: baseOffset + 8,
      attachment: seed.attachment,
    },
    {
      direction: "inbound",
      text: "Parfait, je bloque un créneau pendant que vous préparez les documents.",
      minutesAgo: baseOffset + 4,
    },
    {
      direction: "outbound",
      text: seed.lastMessage,
      minutesAgo: baseOffset,
    },
  ];
  const messages = templateMessages.map((entry, messageIndex) => ({
    id: `${seed.contactName.replace(/\s+/g, "")}-${index}-${messageIndex}`,
    direction: entry.direction,
    text: entry.text,
    sentAt: new Date(baseTimestamp - entry.minutesAgo * 60000).toISOString(),
    attachment: entry.attachment,
  }));

  return {
    id: `clara-${seed.channel}-${index}`,
    contactName: seed.contactName,
    channel: seed.channel,
    lastMessage: seed.lastMessage,
    lastAt: new Date(baseTimestamp - baseOffset * 60000).toISOString(),
    unreadCount: seed.unreadCount,
    status: seed.status,
    messages,
    tags: seed.tags ?? [],
  };
};

const mockConversations: Conversation[] = conversationSeeds.map((seed, index) =>
  buildConversation(seed, index)
);

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
}> = ({ label, value, delta }) => (
  <article className={styles.claraKpiCard}>
    <div className={styles.claraKpiCardValue}>{value}</div>
    <div className={styles.claraKpiCardLabel}>{label}</div>
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
          <ChannelBadge channel={conversation.channel} />
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
        <span className={styles.tagChip}>{conversation.tags.join(" • ")}</span>
      )}
    </button>
  );
};

const ChatBubble: FunctionComponent<{ message: Message }> = ({ message }) => {
  const isOutbound = message.direction === "outbound";
  return (
    <div
      className={`${styles.chatBubble} ${
        isOutbound ? styles.chatBubbleOutbound : styles.chatBubbleInbound
      }`}
    >
      {isOutbound && (
        <span className={styles.chatBubbleSender}>Agent Clara</span>
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
  const [conversationData, setConversationData] =
    useState<Conversation[]>(mockConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    mockConversations[0]?.id ?? null
  );
  const [composerText, setComposerText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedConversationId === null && conversationData.length > 0) {
      setSelectedConversationId(conversationData[0].id);
    }
  }, [conversationData, selectedConversationId]);

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

  useEffect(() => {
    if (!activeConversation) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages.length, activeConversation]);

  const stats = useMemo(() => {
    const messagesCount = filteredConversations.reduce(
      (total, conversation) => total + conversation.messages.length,
      0
    );
    const periodMultiplier = periodMultipliers[period];
    const responses = Math.max(
      40,
      Math.round(
        (90 + filteredConversations.length * 6) * periodMultiplier * 0.92
      )
    );
    const messagesReceived = Math.max(
      80,
      Math.round((140 + messagesCount * 1.1) * periodMultiplier * 0.85)
    );
    const activeConversations = filteredConversations.filter(
      (conversation) => conversation.status === "Ouvert"
    ).length;
    const responseTime = Math.max(
      2,
      Math.round((5 - filteredConversations.length * 0.05) * 10) / 10
    );
    return {
      responses,
      messages: messagesReceived,
      active: activeConversations || 1,
      responseTime,
    };
  }, [filteredConversations, period]);

  const deltas = {
    responses: period === "7" ? "+12% vs précédent" : "+8% vs précédent",
    messages: period === "7" ? "+10% vs précédent" : "+6% vs précédent",
    active: period === "7" ? "+3% vs précédent" : "+1% vs précédent",
    responseTime:
      period === "7"
        ? "-0,4 min vs précédent"
        : period === "30"
        ? "-0,6 min vs précédent"
        : "-0,9 min vs précédent",
  };

  const kpiCards = [
    {
      label: "Réponses envoyées",
      value: `${stats.responses.toLocaleString("fr-FR")}`,
      delta: deltas.responses,
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
      value: `${stats.responseTime.toFixed(1)} min`,
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
      bucket[conversation.channel] += 1;
    });
    return channelCycle.map((channel) => {
      const base = 30 + bucket[channel] * 6;
      const multiplier =
        periodMultipliers[period] *
        (channelFilter === "All"
          ? 1
          : channelFilter === channel
          ? 1.15
          : 0.5);
      return {
        channel,
        count: Math.max(14, Math.round(base * multiplier)),
      };
    });
  }, [filteredConversations, period, channelFilter]);

  const maxChannelCount = Math.max(...channelStats.map((stat) => stat.count));

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

  const handleSendMessage = () => {
    if (!composerText.trim() || !activeConversation) {
      return;
    }
    const newMessage: Message = {
      id: `${activeConversation.id}-out-${Date.now()}`,
      direction: "outbound",
      text: composerText.trim(),
      sentAt: new Date().toISOString(),
    };
    setConversationData((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== activeConversation.id) {
          return conversation;
        }
        return {
          ...conversation,
          messages: [...conversation.messages, newMessage],
          lastMessage: newMessage.text,
          lastAt: newMessage.sentAt,
          unreadCount: 0,
        };
      })
    );
    setComposerText("");
  };

  const handleQuickReply = (value: string) => {
    setComposerText(value);
  };

  const handleMarkClosed = () => {
    if (!activeConversation) return;
    setConversationData((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversation.id
          ? { ...conversation, status: "Clos" }
          : conversation
      )
    );
  };

  const handleHandoff = () => {
    if (!activeConversation) return;
    setConversationData((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversation.id
          ? { ...conversation, status: "Handoff" }
          : conversation
      )
    );
  };

  const handleAddTag = () => {
    if (!activeConversation) return;
    setConversationData((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== activeConversation.id) {
          return conversation;
        }
        const hasTag = conversation.tags.includes("Suivi Clara");
        return {
          ...conversation,
          tags: hasTag
            ? conversation.tags
            : [...conversation.tags, "Suivi Clara"],
        };
      })
    );
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
          <div className={styles.claraDashboardContent}>
        <header className={styles.claraHeader}>
          <div>
            <h1 className={styles.claraHeaderTitle}>Dashboard — Clara</h1>
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
                <h3>Réponses par canal</h3>
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
              </section>
            </div>
          </section>
        ) : (
          <section className={styles.claraDetailsLayout}>
            <div className={styles.conversationPanel}>
              <h3>Conversations</h3>
              <div className={styles.conversationFilters}>
                <ChannelFilterGroup
                  active={channelFilter}
                  onChange={setChannelFilter}
                />
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
                  <option value="messages">Plus de messages</option>
                </select>
              </div>
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
            </div>
            <div className={styles.chatPanel}>
              {activeConversation ? (
                <>
                  <div className={styles.chatHeader}>
                    <div className={styles.chatHeaderMeta}>
                      <h3 style={{ margin: 0 }}>{activeConversation.contactName}</h3>
                      <ChannelBadge channel={activeConversation.channel} />
                      <span className={styles.topConversationItemMeta}>
                        Statut : {activeConversation.status}
                      </span>
                    </div>
                    <div className={styles.chatHeaderActions}>
                      <button type="button" onClick={handleMarkClosed}>
                        Marquer comme clos
                      </button>
                      <button type="button" onClick={handleHandoff}>
                        Handoff humain
                      </button>
                      <button type="button" onClick={handleAddTag}>
                        Ajouter tag
                      </button>
                    </div>
                  </div>
                  <div className={styles.chatMessages}>
                    {(activeConversation.messages ?? []).map((message) => (
                      <ChatBubble key={message.id} message={message} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className={styles.chatComposer}>
                    <div className={styles.quickReplies}>
                      {quickReplies.map((reply) => (
                        <button
                          key={reply}
                          type="button"
                          onClick={() => handleQuickReply(reply)}
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                      placeholder="Écrire un message…"
                    />
                    <div className={styles.chatComposerActions}>
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                        Canal actif : {activeConversation.channel}
                      </span>
                      <button
                        type="button"
                        className={styles.chatComposerSend}
                        onClick={handleSendMessage}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
