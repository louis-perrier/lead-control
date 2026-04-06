import {
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
} from "../components/DashboardIcons";
import styles from "./Dashboard.module.css";
import useAgents from "../hooks/useAgents";
import useClaraConversations from "../hooks/useClaraConversations";
import useAllConversations from "../hooks/useAllConversations";
import useConversationMessages from "../hooks/useConversationMessages";
import supabase from "../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import AudioMessageBubble, {
  TranscriptStatus,
} from "../components/AudioMessageBubble";

type ChannelOption = "Instagram" | "WhatsApp" | "Telegram";
type ChannelFilterOption = ChannelOption | "All";
type StatusOption = "Ouvert" | "Clos" | "Handoff";
type PeriodOption = "today" | "3" | "7" | "14" | "30" | "year";
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
  readByContactAt?: string | null;
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
  inboundCount: number;
  lastAgentReplyAt?: string | null;
  heatReason?: string | null;
  agentSentCount: number;
  humanSentCount: number;
  createdAt: string;
  agentConfigId?: string;
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
  { label: "Aujourd'hui", value: "today" },
  { label: "3j", value: "3" },
  { label: "7j", value: "7" },
  { label: "14j", value: "14" },
  { label: "30j", value: "30" },
  { label: "Cette annee", value: "year" },
];

const statusFilterOptions = ["Tous", "Ouvert", "Clos", "Erreur"] as const;
const sortOptionLabels: Record<SortOption, string> = {
  recent: "Recent",
  unread: "Non lus",
  messages: "Plus de messages envoyes",
};
const sortOptions: SortOption[] = ["recent", "unread", "messages"];

const channelColors: Record<ChannelOption, string> = {
  Instagram: "#D12E93",
  WhatsApp: "var(--app-success)",
  Telegram: "var(--app-accent)",
};
const channelFocusColors: Record<ChannelOption, string> = {
  Instagram: "#D12E93",
  WhatsApp: "var(--app-success)",
  Telegram: "var(--app-accent)",
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const periodDaySpans: Record<PeriodOption, number> = {
  today: 1,
  "3": 3,
  "7": 7,
  "14": 14,
  "30": 30,
  year: 365,
};

type PeriodWindow = {
  daySpan: number;
  startDate: Date;
  startMs: number;
  endMs: number;
};

const getPeriodWindow = (
  period: PeriodOption,
  now: Date = new Date(),
): PeriodWindow => {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate = startOfToday;
  let daySpan = periodDaySpans[period];

  if (period === "today") {
    startDate = startOfToday;
  } else if (period === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    daySpan =
      Math.floor((startOfToday.getTime() - startDate.getTime()) / DAY_IN_MS) + 1;
  } else {
    startDate = new Date(startOfToday.getTime() - (daySpan - 1) * DAY_IN_MS);
  }

  return {
    daySpan,
    startDate,
    startMs: startDate.getTime(),
    endMs: now.getTime(),
  };
};

const isInPeriodWindow = (iso: string, window: PeriodWindow) => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return time >= window.startMs && time <= window.endMs;
};

type EvolutionPoint = {
  id: string;
  label: string;
  tooltip: string;
  count: number;
  timestampMs: number;
};

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const formatHourLabel = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const TODAY_BUCKET_COUNT = 12;

const buildEvolutionAxisLabels = (
  period: PeriodOption,
  points: EvolutionPoint[],
): string[] => {
  if (points.length === 0) {
    return [];
  }
  if (period === "today") {
    return ["00:00", "12:00", "23H59"];
  }
  if (points.length === 1) {
    return [points[0].label];
  }
  if (points.length === 2) {
    return [points[0].label, points[1].label];
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const midpointMs = (firstPoint.timestampMs + lastPoint.timestampMs) / 2;
  let middlePoint = points[1];
  let minDistance = Math.abs(middlePoint.timestampMs - midpointMs);

  for (let i = 2; i < points.length - 1; i++) {
    const distance = Math.abs(points[i].timestampMs - midpointMs);
    if (distance < minDistance) {
      minDistance = distance;
      middlePoint = points[i];
    }
  }

  return [firstPoint.label, middlePoint.label, lastPoint.label];
};

const buildDailyEvolutionSeries = (
  conversations: Conversation[],
  window: PeriodWindow,
): EvolutionPoint[] => {
  const points: EvolutionPoint[] = [];
  const todayString = new Date().toDateString();

  for (let i = 0; i < window.daySpan; i++) {
    const targetDate = new Date(window.startDate.getTime() + i * DAY_IN_MS);
    const targetDateString = targetDate.toDateString();
    let messagesCount = 0;

    conversations.forEach((conversation) => {
      conversation.messages.forEach((message) => {
        if (
          message.authorType === "agent" &&
          message.direction === "outbound" &&
          isInPeriodWindow(message.sentAt, window) &&
          new Date(message.sentAt).toDateString() === targetDateString
        ) {
          messagesCount++;
        }
      });
    });

    const label =
      targetDateString === todayString ? "Aujourd'hui" : formatDayLabel(targetDate);
    points.push({
      id: `${targetDate.getFullYear()}-${targetDate.getMonth()}-${targetDate.getDate()}`,
      label,
      tooltip: `${label}: ${messagesCount} message${messagesCount > 1 ? "s" : ""}`,
      count: messagesCount,
      timestampMs: targetDate.getTime(),
    });
  }

  return points;
};

const buildYearlyEvolutionSeries = (
  conversations: Conversation[],
  window: PeriodWindow,
): EvolutionPoint[] => {
  const year = window.startDate.getFullYear();
  const points: EvolutionPoint[] = [];

  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1, 0, 0, 0, -1);

    let messagesCount = 0;
    conversations.forEach((conversation) => {
      conversation.messages.forEach((message) => {
        const messageTime = new Date(message.sentAt).getTime();
        if (
          message.authorType === "agent" &&
          message.direction === "outbound" &&
          messageTime >= monthStart.getTime() &&
          messageTime <= monthEnd.getTime() &&
          isInPeriodWindow(message.sentAt, window)
        ) {
          messagesCount++;
        }
      });
    });

    const label = monthStart.toLocaleDateString("fr-FR", { month: "short" });
    points.push({
      id: `${year}-${month + 1}`,
      label,
      tooltip: `${label} ${year}: ${messagesCount} message${messagesCount > 1 ? "s" : ""}`,
      count: messagesCount,
      timestampMs: monthStart.getTime(),
    });
  }

  return points;
};

const buildTodayEvolutionSeries = (
  conversations: Conversation[],
  window: PeriodWindow,
): EvolutionPoint[] => {
  const points: EvolutionPoint[] = [];
  const endOfDayMs = window.startMs + DAY_IN_MS - 1;
  const totalRangeMs = DAY_IN_MS;
  const bucketRangeMs = totalRangeMs / TODAY_BUCKET_COUNT;

  for (let i = 0; i < TODAY_BUCKET_COUNT; i++) {
    const bucketStartMs = Math.floor(window.startMs + i * bucketRangeMs);
    const bucketEndMs =
      i === TODAY_BUCKET_COUNT - 1
        ? endOfDayMs
        : Math.floor(window.startMs + (i + 1) * bucketRangeMs) - 1;
    let messagesCount = 0;

    conversations.forEach((conversation) => {
      conversation.messages.forEach((message) => {
        const messageTime = new Date(message.sentAt).getTime();
        const isInsideBucket =
          messageTime >= bucketStartMs && messageTime <= bucketEndMs;

        if (
          message.authorType === "agent" &&
          message.direction === "outbound" &&
          isInsideBucket
        ) {
          messagesCount++;
        }
      });
    });

    const startLabel = formatHourLabel(new Date(bucketStartMs));
    const endLabel = formatHourLabel(new Date(bucketEndMs));
    points.push({
      id: `today-${i}`,
      label: endLabel,
      tooltip: `${startLabel} - ${endLabel}: ${messagesCount} message${messagesCount > 1 ? "s" : ""}`,
      count: messagesCount,
      timestampMs: bucketEndMs,
    });
  }

  return points;
};

const buildConversationsStartedSeries = (
  conversations: Conversation[],
  window: PeriodWindow,
): EvolutionPoint[] => {
  const points: EvolutionPoint[] = [];
  const todayString = new Date().toDateString();
  for (let i = 0; i < window.daySpan; i++) {
    const targetDate = new Date(window.startDate.getTime() + i * DAY_IN_MS);
    const targetDateString = targetDate.toDateString();
    let count = 0;
    conversations.forEach((conv) => {
      if (new Date(conv.createdAt).toDateString() === targetDateString) count++;
    });
    const label = targetDateString === todayString ? "Aujourd'hui" : formatDayLabel(targetDate);
    points.push({
      id: `${targetDate.getFullYear()}-${targetDate.getMonth()}-${targetDate.getDate()}`,
      label,
      tooltip: `${label}: ${count} conversation${count > 1 ? "s" : ""}`,
      count,
      timestampMs: targetDate.getTime(),
    });
  }
  return points;
};

const buildConversationsStartedYearlySeries = (
  conversations: Conversation[],
  window: PeriodWindow,
): EvolutionPoint[] => {
  const year = window.startDate.getFullYear();
  const points: EvolutionPoint[] = [];
  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1, 0, 0, 0, -1);
    let count = 0;
    conversations.forEach((conv) => {
      const t = new Date(conv.createdAt).getTime();
      if (t >= monthStart.getTime() && t <= monthEnd.getTime()) count++;
    });
    const label = monthStart.toLocaleDateString("fr-FR", { month: "short" });
    points.push({
      id: `${year}-${month + 1}`,
      label,
      tooltip: `${label} ${year}: ${count} conversation${count > 1 ? "s" : ""}`,
      count,
      timestampMs: monthStart.getTime(),
    });
  }
  return points;
};

const buildConversationsStartedTodaySeries = (
  conversations: Conversation[],
  window: PeriodWindow,
): EvolutionPoint[] => {
  const points: EvolutionPoint[] = [];
  const endOfDayMs = window.startMs + DAY_IN_MS - 1;
  const bucketRangeMs = DAY_IN_MS / TODAY_BUCKET_COUNT;
  for (let i = 0; i < TODAY_BUCKET_COUNT; i++) {
    const bucketStartMs = Math.floor(window.startMs + i * bucketRangeMs);
    const bucketEndMs =
      i === TODAY_BUCKET_COUNT - 1
        ? endOfDayMs
        : Math.floor(window.startMs + (i + 1) * bucketRangeMs) - 1;
    let count = 0;
    conversations.forEach((conv) => {
      const t = new Date(conv.createdAt).getTime();
      if (t >= bucketStartMs && t <= bucketEndMs) count++;
    });
    const startLabel = formatHourLabel(new Date(bucketStartMs));
    const endLabel = formatHourLabel(new Date(bucketEndMs));
    points.push({
      id: `today-${i}`,
      label: endLabel,
      tooltip: `${startLabel} - ${endLabel}: ${count} conversation${count > 1 ? "s" : ""}`,
      count,
      timestampMs: bucketEndMs,
    });
  }
  return points;
};

const channelCycle: ChannelOption[] = ["Instagram", "WhatsApp", "Telegram"];
const TOP_CONVERSATIONS_PAGE_SIZE = 3;

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

const mapMessageRecord = (convId: string, message: any): Message => {
  const isAudioMessage = message.message_type === "audio";
  let mediaPath: string | null = null;
  let transcriptStatus: TranscriptStatus | undefined = undefined;
  let transcriptContent: string | null = null;
  let transcriptError: string | null = null;
  let attachment: any = undefined;

  if (isAudioMessage) {
    mediaPath = message.media_path || null;
    const rawTranscriptStatus = message.transcript_status;
    transcriptStatus = rawTranscriptStatus === "none" ? undefined : rawTranscriptStatus;
    transcriptContent = message.transcript || null;
    transcriptError = message.transcript_error || null;
    attachment = {
      type: "audio" as const,
      label: mediaPath ? "Message vocal" : "Message vocal (fichier manquant)",
      mediaPath: mediaPath || undefined,
    };
  } else {
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
    id: `${convId}-${message.id}`,
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
    readByContactAt: message.read_by_contact_at ?? null,
  };
};

const mapConversationRecord = (record: any): Conversation => {
  const channel = normalizeChannel(record.platform);
  const messages =
    (record.conversation_messages ?? [])
      .map((message: any) => mapMessageRecord(String(record.id), message))
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
    inboundCount: record.inbound_count ?? 0,
    lastAgentReplyAt: record.last_agent_reply_at ?? null,
    heatReason: record.heat_reason ?? null,
    agentSentCount: record.agent_sent_count ?? 0,
    humanSentCount: record.human_sent_count ?? 0,
    createdAt: record.created_at ?? new Date().toISOString(),
    agentConfigId: record.agent_config_id ?? undefined,
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

const heatTagLabels: Record<string, string> = {
  cold: "Froid",
  warm: "Tiède",
  hot: "Chaud",
};

const getHeatTagLabel = (tag?: string): string | null => {
  if (!tag) return null;
  return heatTagLabels[tag.toLowerCase()] ?? null;
};

const ChannelBadge: FunctionComponent<{
  channel: ChannelOption;
  colorChannel?: ChannelOption;
}> = ({ channel }) => (
  <img
    src={channelFilterIcons[channel]}
    alt={channel}
    className={styles.channelBadge}
  />
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
    {channelFilterOptions.filter((option) => option !== "Telegram").map((option) => {
      const isActive = active === option;
      return (
        <button
          key={option}
          type="button"
          className={`${styles.channelChip} ${
            isActive ? styles.channelChipActive : ""
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
              />
              <span>{option}</span>
            </>
          )}
        </button>
      );
    })}
  </div>
);

const formatNextReplyShort = (iso?: string | null): string => {
  if (!iso) return "Planifié";
  const time = new Date(iso);
  const now = new Date();
  const isToday = time.toDateString() === now.toDateString();
  const isTomorrow = time.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  const hhmm = time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return hhmm;
  if (isTomorrow) return `Dem. ${hhmm}`;
  return hhmm;
};

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
  agentLabel?: string;
}> = ({ conversation, isActive, onSelect, agentLabel }) => {
  const initials = conversation.contactName
    .split(" ")
    .map((token) => token.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isNoReply = !conversation.contactHandle && conversation.inboundCount === 0;

  const needsAttention =
    !isActive &&
    conversation.automationState !== "error" &&
    conversation.automationState !== "stopped" &&
    conversation.automationState !== "condition_stop" &&
    conversation.lastAgentReplyAt &&
    conversation.lastAt > conversation.lastAgentReplyAt;
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
      } ${needsAttention ? styles.conversationItemNeedsAttention : ""} ${getHeatTagLabel(conversation.tags[0]) ? styles.conversationItemWithTag : ""}`.trim()}
      onClick={onSelect}
    >
      <span className={styles.conversationAvatar}>{initials}</span>
      <div className={styles.conversationDetails}>
        <div className={styles.conversationTop}>
          <div className={styles.conversationContactBlock}>
            {isNoReply ? (
              <span className={styles.noReplyBadge}>Pas encore répondu</span>
            ) : (
              <>
                <span>{conversation.contactName}</span>
                {conversation.contactHandle && (
                  <span style={{ fontSize: '0.75em', color: 'var(--app-text-secondary)' }}>
                    @{conversation.contactHandle}
                  </span>
                )}
              </>
            )}
          </div>
          <div className={styles.conversationTopMeta}>
      {conversation.automationState === "pending" && (
        <span className={styles.pendingBadge}>
          <span className={styles.pendingDot} />
          <span className={styles.pendingDot} />
          <span className={styles.pendingDot} />
          <span className={styles.badgeText}>Attente</span>
        </span>
      )}
      {conversation.automationState === "scheduled" && (
        <span className={styles.scheduledBadge}>
          <span className={styles.scheduledDot} />
          <span className={styles.badgeText}>{formatNextReplyShort(conversation.nextReplyAt)}</span>
        </span>
      )}
      {conversation.automationState === "error" && (
        <span className={styles.errorBadge}>
          <span className={styles.errorDot} />
          <span className={styles.badgeText}>Erreur</span>
        </span>
      )}
      {conversation.automationState === "condition_stop" && (
        <span className={styles.conditionBadge}>
          <span className={styles.conditionDot} />
          <span className={styles.badgeText}>Stop</span>
        </span>
      )}
      {conversation.automationState === "stopped" && (
        <span className={styles.stoppedBadge}>
          <span className={styles.stoppedDot} />
          <span className={styles.badgeText}>Arrêté</span>
        </span>
      )}
            {agentLabel && (
              <span className={styles.agentBadge} title={agentLabel}>
                {agentLabel.length > 8 ? agentLabel.slice(0, 8) + "…" : agentLabel}
              </span>
            )}
            <ChannelBadge channel={conversation.channel} />
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
      {getHeatTagLabel(conversation.tags[0]) && (
        <span
          className={styles.tagChip}
          style={getHeatTagStyle(conversation.tags[0])}
        >
          {getHeatTagLabel(conversation.tags[0])}
        </span>
      )}
    </button>
  );
};

const ChatBubble: FunctionComponent<{ message: Message; contactName?: string; isLastOutbound?: boolean }> = ({ message, contactName, isLastOutbound }) => {
  const isOutbound = message.direction === "outbound";
  const label =
    message.authorType === "human"
      ? "Vous"
      : message.authorType === "agent"
      ? "Assistant IA"
      : contactName || "Client";
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
      {isOutbound && isLastOutbound && message.readByContactAt && (
        <span className={styles.chatBubbleVu}>Vu</span>
      )}
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

const ConversationMessageItem: FunctionComponent<{ message: Message; contactName?: string; isLastOutbound?: boolean }> = ({
  message,
  contactName,
  isLastOutbound,
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
  return <ChatBubble message={message} contactName={contactName} isLastOutbound={isLastOutbound} />;
};

const Dashboard: FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = (searchParams.get("tab") ?? "stats") as TabOption;
  const currentTab: TabOption = rawTab === "conversation" ? "conversation" : "stats";
  const [period, setPeriod] = useState<PeriodOption>("3");
  const [channelFilter, setChannelFilter] =
    useState<ChannelFilterOption>("All");
  const [sortOption, setSortOption] = useState<SortOption>("recent");
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusFilterOptions)[number]>("Tous");
  const [searchQuery, setSearchQuery] = useState("");
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
  const [topConversationPage, setTopConversationPage] = useState(0);
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

  const allConfigIds = useMemo(
    () => agentConfigOptions.map((o) => o.value),
    [agentConfigOptions],
  );
  const isAllMode = selectedConfigId === "all";

  const selectedAgent = useMemo(
    () => displayedAgents.find(
      (agent) => (agent.display_id ?? agent.agent_id) === selectedConfigId
    ),
    [displayedAgents, selectedConfigId],
  );

  const activeTabs = isAllMode
    ? (["stats", "conversation"] as string[])
    : (selectedAgent?.dashboard_tab_component ?? []);
  const effectiveCurrentTab: TabOption = activeTabs.includes(currentTab)
    ? currentTab
    : (activeTabs[0] as TabOption) ?? "stats";

  const {
    data: rawConversationsSingle = [],
    isLoading: conversationsLoadingSingle,
    isError: conversationsErrorSingle,
    error: conversationsErrorDetailsSingle,
  } = useClaraConversations(!isAllMode ? selectedConfigId ?? undefined : undefined);

  const {
    data: rawConversationsAll = [],
    isLoading: conversationsLoadingAll,
  } = useAllConversations(isAllMode ? allConfigIds : []);

  const {
    data: lazyMessageData = [],
    isLoading: lazyMessagesLoading,
  } = useConversationMessages(isAllMode ? selectedConversationId ?? undefined : undefined);

  const rawConversations = isAllMode ? rawConversationsAll : rawConversationsSingle;
  const conversationsLoading = isAllMode ? conversationsLoadingAll : conversationsLoadingSingle;
  const conversationsError = isAllMode ? false : conversationsErrorSingle;
  const conversationsErrorDetails = isAllMode ? null : conversationsErrorDetailsSingle;
  const conversationData = useMemo(
    () => rawConversations.map(mapConversationRecord),
    [rawConversations],
  );
  const [isStopDialogOpen, setStopDialogOpen] = useState(false);
  const [isDetailsOverlayOpen, setDetailsOverlayOpen] = useState(false);
  const [isContactDrawerOpen, setContactDrawerOpen] = useState(false);
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
      (selectedConfigId !== "all" &&
        !agentConfigOptions.some((option) => option.value === selectedConfigId))
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

  const conversationsQueryKey = useMemo(
    () =>
      isAllMode
        ? ["all-conversations", [...allConfigIds].sort().join(",")]
        : ["clara-conversations", selectedConfigId],
    [isAllMode, allConfigIds, selectedConfigId],
  );

  const agentLabelMap = useMemo(
    () => new Map(agentConfigOptions.map((o) => [o.value, o.label])),
    [agentConfigOptions],
  );

  const lazyMessages = useMemo(
    () =>
      isAllMode && selectedConversationId
        ? lazyMessageData
            .map((msg: any) => mapMessageRecord(selectedConversationId, msg))
            .sort(
              (a: Message, b: Message) =>
                new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
            )
        : [],
    [isAllMode, selectedConversationId, lazyMessageData],
  );

  const periodWindow = useMemo(() => getPeriodWindow(period), [period]);

  const channelScopedConversations = useMemo(
    () =>
      conversationData.filter(
        (conversation) =>
          channelFilter === "All" || conversation.channel === channelFilter,
      ),
    [conversationData, channelFilter],
  );

  const filteredConversations = useMemo(
    () =>
      channelScopedConversations.filter((conversation) => {
        const matchesStatus =
          statusFilter === "Tous"
            ? true
            : statusFilter === "Erreur"
            ? conversation.automationState === "error"
            : conversation.status === statusFilter;
        return matchesStatus;
      }),
    [channelScopedConversations, statusFilter]
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
      copy.sort((a, b) =>
        isAllMode
          ? (b.agentSentCount + b.humanSentCount) - (a.agentSentCount + a.humanSentCount)
          : b.messages.length - a.messages.length
      );
    }
    return copy;
  }, [filteredConversations, sortOption, isAllMode]);

  const searchedConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedConversations;
    return sortedConversations.filter(
      (conv) =>
        conv.contactName.toLowerCase().includes(q) ||
        conv.contactHandle.toLowerCase().includes(q)
    );
  }, [sortedConversations, searchQuery]);

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
  const isWindowExpired = useMemo(() => {
    if (!activeConversation) return false;
    const messages = isAllMode ? lazyMessages : activeConversation.messages;
    if (isAllMode && lazyMessagesLoading) return false;
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound) return false;
    return Date.now() - new Date(lastInbound.sentAt).getTime() > 24 * 60 * 60 * 1000;
  }, [activeConversation, isAllMode, lazyMessages, lazyMessagesLoading]);

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
    const messages = isAllMode ? lazyMessages : activeConversation.messages;
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
  }, [isAllMode, lazyMessages, activeConversation]);

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
    if (isAllMode) {
      const active = channelScopedConversations.filter(
        (conv) => conv.status === "Ouvert" && isInPeriodWindow(conv.lastAt, periodWindow),
      ).length;
      const responses = channelScopedConversations.reduce(
        (acc, conv) => acc + conv.agentSentCount,
        0,
      );
      const messages = channelScopedConversations.reduce(
        (acc, conv) => acc + conv.inboundCount,
        0,
      );
      return { responses, messages, active, responseTime: 0 };
    }
    let totalResponseMs = 0;
    let responsePairs = 0;
    const responses = channelScopedConversations.reduce((acc, conversation) => {
      acc += conversation.messages.filter(
        (message) =>
          message.authorType === "agent" &&
          isInPeriodWindow(message.sentAt, periodWindow),
      ).length;
      for (const message of conversation.messages) {
        if (
          message.authorType !== "agent" ||
          !isInPeriodWindow(message.sentAt, periodWindow) ||
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
    const messagesReceived = channelScopedConversations.reduce(
      (acc, conversation) =>
        acc +
        conversation.messages.filter(
          (message) =>
            message.direction === "inbound" &&
            isInPeriodWindow(message.sentAt, periodWindow),
        ).length,
      0,
    );
    const activeConversations = channelScopedConversations.filter(
      (conversation) =>
        conversation.status === "Ouvert" &&
        isInPeriodWindow(conversation.lastAt, periodWindow),
    ).length;
    const averageResponseSeconds =
      responsePairs === 0 ? 0 : Math.round((totalResponseMs / responsePairs) / 1000);
    return {
      responses: responses,
      messages: messagesReceived,
      active: activeConversations,
      responseTime: averageResponseSeconds,
    };
  }, [isAllMode, channelScopedConversations, periodWindow]);

  const evolutionSeries = useMemo(
    () => {
      if (isAllMode) {
        return period === "year"
          ? buildConversationsStartedYearlySeries(channelScopedConversations, periodWindow)
          : period === "today"
          ? buildConversationsStartedTodaySeries(channelScopedConversations, periodWindow)
          : buildConversationsStartedSeries(channelScopedConversations, periodWindow);
      }
      return period === "year"
        ? buildYearlyEvolutionSeries(channelScopedConversations, periodWindow)
        : period === "today"
        ? buildTodayEvolutionSeries(channelScopedConversations, periodWindow)
        : buildDailyEvolutionSeries(channelScopedConversations, periodWindow);
    },
    [isAllMode, channelScopedConversations, period, periodWindow],
  );

  const deltas = {
    responses:
      period === "today"
        ? "+4% vs hier"
        : period === "3"
        ? "+12% vs precedent"
        : period === "7"
        ? "+10% vs precedent"
        : period === "14"
        ? "+9% vs precedent"
        : period === "30"
        ? "+8% vs precedent"
        : "+5% vs annee precedente",
    messages:
      period === "today"
        ? "+3% vs hier"
        : period === "3"
        ? "+10% vs precedent"
        : period === "7"
        ? "+8% vs precedent"
        : period === "14"
        ? "+7% vs precedent"
        : period === "30"
        ? "+6% vs precedent"
        : "+4% vs annee precedente",
    active:
      period === "today"
        ? "+1% vs hier"
        : period === "3"
        ? "+3% vs precedent"
        : period === "7"
        ? "+2% vs precedent"
        : period === "14"
        ? "+2% vs precedent"
        : period === "30"
        ? "+1% vs precedent"
        : "+1% vs annee precedente",
    responseTime:
      period === "today"
        ? "-12 s vs hier"
        : period === "3"
        ? "-24 s vs precedent"
        : period === "7"
        ? "-28 s vs precedent"
        : period === "14"
        ? "-32 s vs precedent"
        : period === "30"
        ? "-36 s vs precedent"
        : "-42 s vs annee precedente",
  };

  const kpiCards = [
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
      label: "Réponses envoyées de l'agent",
      value: `${stats.responses.toLocaleString("fr-FR")}`,
      delta: deltas.responses,
      note: "Agent uniquement",
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

    conversationData.forEach((conversation) => {
      const agentMessages = isAllMode
        ? conversation.agentSentCount
        : conversation.messages.filter(
            (message) =>
              message.direction === "outbound" &&
              message.authorType === "agent" &&
              isInPeriodWindow(message.sentAt, periodWindow),
          ).length;
      bucket[conversation.channel] += agentMessages;
    });

    const maxBucket = Math.max(...Object.values(bucket), 1);
    return channelCycle.filter((channel) => channel !== "Telegram").map((channel) => ({
      channel,
      count: bucket[channel],
      normalized: Math.round((bucket[channel] / maxBucket) * 100),
    }));
  }, [isAllMode, conversationData, periodWindow]);

  const maxChannelCount =
    Math.max(...channelStats.map((stat) => stat.count)) || 1;
  const sparklineBarColor =
    channelFilter === "All"
      ? "var(--app-primary)"
      : channelFocusColors[channelFilter];

  const sparklineValues = evolutionSeries.map((point) => point.count);
  const sparklineMax = Math.max(...sparklineValues, 1);
  const evolutionAxisLabels = useMemo(
    () => buildEvolutionAxisLabels(period, evolutionSeries),
    [period, evolutionSeries],
  );

  const topConversations = useMemo(
    () =>
      channelScopedConversations
        .map((conversation) => ({
          conversation,
          periodMessageCount: isAllMode
            ? conversation.agentSentCount + conversation.inboundCount
            : conversation.messages.filter((message) =>
                isInPeriodWindow(message.sentAt, periodWindow),
              ).length,
        }))
        .filter((row) => row.periodMessageCount > 0)
        .sort((a, b) => {
          if (b.periodMessageCount !== a.periodMessageCount) {
            return b.periodMessageCount - a.periodMessageCount;
          }
          return (
            new Date(b.conversation.lastAt).getTime() -
            new Date(a.conversation.lastAt).getTime()
          );
        }),
    [isAllMode, channelScopedConversations, periodWindow],
  );

  const topConversationPageCount = Math.max(
    1,
    Math.ceil(topConversations.length / TOP_CONVERSATIONS_PAGE_SIZE),
  );

  useEffect(() => {
    if (topConversationPage <= topConversationPageCount - 1) {
      return;
    }
    setTopConversationPage(Math.max(0, topConversationPageCount - 1));
  }, [topConversationPage, topConversationPageCount]);

  useEffect(() => {
    setTopConversationPage(0);
  }, [period, channelFilter, selectedConfigId]);

  const paginatedTopConversations = useMemo(() => {
    const startIndex = topConversationPage * TOP_CONVERSATIONS_PAGE_SIZE;
    return topConversations.slice(
      startIndex,
      startIndex + TOP_CONVERSATIONS_PAGE_SIZE,
    );
  }, [topConversations, topConversationPage]);

  const topConversationSlots = useMemo<
    Array<{ conversation: Conversation; periodMessageCount: number } | null>
  >(() => {
    const slots: Array<{
      conversation: Conversation;
      periodMessageCount: number;
    } | null> = [...paginatedTopConversations];
    while (slots.length < TOP_CONVERSATIONS_PAGE_SIZE) {
      slots.push(null);
    }
    return slots;
  }, [paginatedTopConversations]);

  const handleSortChange = (value: SortOption) => {
    setSortOption(value);
    setSortMenuOpen(false);
  };

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!activeConversation || activeConversation.unreadCount === 0 || !selectedConfigId) return;
    const convId = Number(activeConversation.id);
    queryClient.setQueryData(conversationsQueryKey, (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((record: any) =>
        record.id === convId ? { ...record, unread_count: 0 } : record
      );
    });
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", convId).then();
  }, [activeConversation?.id]);

  const handleSendMessage = async () => {
    if (!composerText.trim() || !activeConversation || !selectedConfigId || isWindowExpired) {
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

    // 2. Mettre à jour React Query optimistiquement (uniquement en mode agent simple)
    if (!isAllMode) {
      queryClient.setQueryData(conversationsQueryKey, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((conv: any) =>
          conv.id === activeConversation.id
            ? { ...conv, messages: [...conv.messages, optimisticMessage] }
            : conv
        );
      });
    }

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
      
      // 6. Rollback en cas d'erreur (uniquement en mode agent simple)
      if (!isAllMode) {
        queryClient.setQueryData(conversationsQueryKey, (oldData: any) => {
          if (!Array.isArray(oldData)) return oldData;
          return oldData.map((conv: any) =>
            conv.id === activeConversation.id
              ? {
                  ...conv,
                  messages: conv.messages.filter((msg: any) => msg.id !== optimisticMessage.id),
                }
              : conv
          );
        });
      }
      
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

  const handleContactDrawerToggle = () => setContactDrawerOpen((prev) => !prev);
  const closeContactDrawer = () => setContactDrawerOpen(false);

  useEffect(() => {
    setContactDrawerOpen(false);
  }, [activeConversation?.id]);

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
          <div className={styles.claraHeaderTop}>
            <h1 className={styles.claraHeaderTitle}>
              Dashboard — {isAllMode ? "Tous les agents" : (activeConfigOption?.label ?? "Clara")}
            </h1>
          </div>
          <div className={styles.claraHeaderControls}>
            {agentConfigOptions.length > 0 && (
              <div className={styles.claraConfigFocusGroup}>
                <span className={styles.claraConfigLabel}>Config</span>
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
                    {!isAllMode && (
                      <span
                        className={`${styles.configDot} ${selectedAgent?.is_active === false ? styles.configDotInactive : ""}`}
                        title={selectedAgent?.is_active === false ? "Inactif" : "Actif"}
                      />
                    )}
                    {isAllMode ? "TOUS LES AGENTS" : (activeConfigOption?.label ?? "Selectionner un agent").toUpperCase()}
                  </button>
                  {isConfigMenuOpen && (
                    <div className={styles.claraConfigMenu} role="listbox">
                      {agentConfigOptions.length > 1 && (
                        <button
                          key="all"
                          type="button"
                          role="option"
                          aria-selected={isAllMode}
                          className={`${styles.claraConfigMenuItem} ${
                            isAllMode ? styles.claraConfigMenuItemActive : ""
                          }`.trim()}
                          onClick={() => handleConfigChange("all")}
                        >
                          TOUS LES AGENTS
                        </button>
                      )}
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
            )}
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
          </div>
        </header>
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
  <section className={`${styles.claraPanel} ${styles.claraPanelWide}`}>
    <div className={styles.evolutionHeader}>
      <h3>{isAllMode ? "Nouvelles conversations" : "Messages envoyes par l'agent"}</h3>
      <div className={styles.evolutionStats}>
        <span className={styles.evolutionGranularity}>
          {period === "year"
            ? "Agregation mensuelle"
            : period === "today"
            ? "Agregation horaire"
            : "Agregation journaliere"}
        </span>
      </div>
    </div>
    {sparklineValues.every((v) => v === 0) ? (
      <div className={styles.sparklineEmpty}>
        <span>{isAllMode ? "Aucune conversation démarrée sur cette période." : "L'agent n'a pas encore envoyé de réponses sur cette période."}</span>
        <button
          type="button"
          className={styles.sparklineEmptyLink}
          onClick={() => updateTab("conversation")}
        >
          Voir toutes les conversations
        </button>
      </div>
    ) : (
      <div
        className={`${styles.claraSparkline} ${period === "year" ? styles.claraSparklineYear : ""}`.trim()}
      >
        {evolutionSeries.map((point) => {
          const value = point.count;
          const zeroBarHeight = 2;
          const minBarHeight = 12;
          const height =
            value === 0
              ? zeroBarHeight
              : Math.max(minBarHeight, (value / sparklineMax) * 100);
          return (
            <span
              key={point.id}
              className={styles.claraSparklineBar}
              style={{
                height: `${height}%`,
                background: sparklineBarColor,
              }}
              data-tooltip={point.tooltip}
            />
          );
        })}
      </div>
    )}
    <div
      className={`${styles.evolutionAxis} ${
        evolutionAxisLabels.length <= 2 ? styles.evolutionAxisCompact : ""
      }`.trim()}
    >
      {evolutionAxisLabels.map((label, index) => (
        <span key={`${label}-${index}`}>{label}</span>
      ))}
    </div>
  </section>
  <div className={styles.claraPanelRowCompact}>
    <section className={`${styles.claraPanel} ${styles.lowerPanel}`.trim()}>
      <h3>Reponses par canal de l'agent</h3>
      <div className={styles.channelBarRow}>
        {channelStats.map((item) => {
          const ratioWidth = Math.round((item.count / maxChannelCount) * 100);
          const barWidth = item.count === 0 ? 1 : Math.max(5, ratioWidth);
          const isChannelFocused = channelFilter !== "All";
          const isSelectedChannel = channelFilter === item.channel;
          const channelBarStateClass = !isChannelFocused
            ? ""
            : isSelectedChannel
            ? styles.channelBarSelected
            : styles.channelBarDimmed;
          const channelBarColor =
            !isChannelFocused
              ? channelColors[item.channel]
              : isSelectedChannel
              ? channelFocusColors[item.channel]
              : "rgba(148, 163, 184, 0.72)";
          return (
            <div
              key={item.channel}
              className={`${styles.channelBar} ${channelBarStateClass}`.trim()}
            >
              <span className={styles.channelBarRowLabel}>{item.channel}</span>
              <div className={styles.channelBarTrack}>
                <span
                  className={styles.channelBarFill}
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: channelBarColor,
                  }}
                />
              </div>
              <span className={styles.channelBarRowLabel}>{item.count}</span>
            </div>
          );
        })}
      </div>
    </section>
    <section className={`${styles.claraPanel} ${styles.lowerPanel}`.trim()}>
      <div className={styles.topConversationHeader}>
        <h3>Top conversations</h3>
        {topConversations.length > 0 && topConversationPageCount > 1 && (
          <span className={styles.topConversationPageIndicator}>
            {topConversationPage + 1}/{topConversationPageCount}
          </span>
        )}
      </div>
      <ul className={`${styles.claraPanelList} ${styles.topConversationList}`.trim()}>
          {topConversationSlots.map((slot, index) =>
            slot ? (
              <li key={slot.conversation.id} className={styles.topConversationItem}>
                <div className={styles.topConversationMain}>
                  <div className={styles.topConversationHeadline}>
                    <div className={styles.topConversationIdentity}>
                      <strong className={styles.topConversationName}>
                        {slot.conversation.contactName}
                      </strong>
                    </div>
                    <ChannelBadge
                      channel={slot.conversation.channel}
                      colorChannel={
                        channelFilter === "All" ? undefined : channelFilter
                      }
                    />
                  </div>
                </div>
                <div className={styles.topConversationAside}>
                  <span className={styles.topConversationCount}>
                    {slot.periodMessageCount} messages
                  </span>
                  <span className={styles.topConversationDot}>·</span>
                  <span className={styles.topConversationTime}>
                    {formatRelativeTime(slot.conversation.lastAt)}
                  </span>
                </div>
              </li>
            ) : (
              <li
                key={`top-conversation-empty-${index}`}
                className={`${styles.topConversationItem} ${styles.topConversationItemPlaceholder}`.trim()}
              >
                {topConversations.length === 0
                  ? "Aucune conversation"
                  : "Aucune autre conversation"}
              </li>
            ),
          )}
        </ul>
      {topConversations.length > 0 && topConversationPageCount > 1 && (
        <div className={styles.topConversationPagination}>
          <button
            type="button"
            className={styles.topConversationPageButton}
            disabled={topConversationPage === 0}
            onClick={() => setTopConversationPage((prev) => Math.max(0, prev - 1))}
          >
            Precedent
          </button>
          <button
            type="button"
            className={styles.topConversationPageButton}
            disabled={topConversationPage >= topConversationPageCount - 1}
            onClick={() =>
              setTopConversationPage((prev) =>
                Math.min(topConversationPageCount - 1, prev + 1),
              )
            }
          >
            Suivant
          </button>
        </div>
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
            <div className={styles.conversationSearchWrap}>
              <input
                type="text"
                className={styles.conversationSearch}
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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
              {!selectedConfigId && !isAllMode ? (
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
                  {searchedConversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isActive={conversation.id === activeConversation?.id}
                      onSelect={() => setSelectedConversationId(conversation.id)}
                      agentLabel={isAllMode ? agentLabelMap.get(conversation.agentConfigId ?? "") : undefined}
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
                        <button
                          type="button"
                          className={`${styles.chatToolButton} ${isContactDrawerOpen ? styles.chatToolButtonActive : ""}`.trim()}
                          data-tooltip="Infos contact"
                          onClick={handleContactDrawerToggle}
                        >
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="9" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M2.5 16c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
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
                  {isContactDrawerOpen && (
                    <>
                      <div className={styles.contactDrawerBackdrop} onClick={closeContactDrawer} />
                      <div className={styles.contactDrawer}>
                        <div className={styles.contactDrawerHead}>
                          <div className={styles.contactDrawerIdentity}>
                            <span className={styles.contactDrawerAvatar}>
                              {activeConversation.contactName
                                .split(" ")
                                .map((t) => t.charAt(0))
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <div className={styles.contactDrawerNameBlock}>
                              <span className={styles.contactDrawerName}>{activeConversation.contactName}</span>
                              {activeConversation.contactHandle && (
                                <span className={styles.contactDrawerHandle}>@{activeConversation.contactHandle}</span>
                              )}
                            </div>
                          </div>
                          <div className={styles.contactDrawerHeadActions}>
                            <span className={styles.contactDrawerPlatformBadge}>{activeConversation.channel}</span>
                            <button type="button" className={styles.contactDrawerClose} onClick={closeContactDrawer}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                                <path d="M7 5.586L11.293 1.293a1 1 0 1 1 1.414 1.414L8.414 7l4.293 4.293a1 1 0 1 1-1.414 1.414L7 8.414l-4.293 4.293a1 1 0 1 1-1.414-1.414L5.586 7 1.293 2.707a1 1 0 0 1 1.414-1.414L7 5.586z"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        {activeConversation.tags[0] && getHeatTagLabel(activeConversation.tags[0]) && (
                          <div className={styles.contactDrawerSection}>
                            <span className={styles.contactDrawerSectionTitle}>Température</span>
                            <span className={`${styles.contactDrawerHeatBadge} ${styles[`contactDrawerHeat_${activeConversation.tags[0]}`] ?? ""}`}>
                              {getHeatTagLabel(activeConversation.tags[0])}
                            </span>
                            {activeConversation.heatReason && (
                              <p className={styles.contactDrawerHeatReason}>{activeConversation.heatReason}</p>
                            )}
                          </div>
                        )}
                        {activeConversation.summary && (
                          <div className={styles.contactDrawerSection}>
                            <span className={styles.contactDrawerSectionTitle}>Résumé IA</span>
                            <p className={styles.contactDrawerSummaryText}>{activeConversation.summary}</p>
                          </div>
                        )}
                        <div className={styles.contactDrawerSection}>
                          <span className={styles.contactDrawerSectionTitle}>Conversation</span>
                          <div className={styles.contactDrawerStats}>
                            <div className={styles.contactDrawerStat}>
                              <svg className={styles.contactDrawerStatIcon} width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <rect x="1" y="2.5" width="12" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                                <path d="M1 6h12" stroke="currentColor" strokeWidth="1.3"/>
                                <path d="M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                              </svg>
                              <span>{new Date(activeConversation.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                            </div>
                            <div className={styles.contactDrawerStat}>
                              <svg className={styles.contactDrawerStatIcon} width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2 4l5 4 5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                                <path d="M7 10v-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                <path d="M5.5 8.5L7 10l1.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>{activeConversation.inboundCount} reçus</span>
                            </div>
                            <div className={styles.contactDrawerStat}>
                              <svg className={styles.contactDrawerStatIcon} width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2 10l5-4 5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                                <path d="M7 4v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                <path d="M5.5 5.5L7 4l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>{activeConversation.agentSentCount + activeConversation.humanSentCount} envoyés</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  <div className={styles.chatMessages} ref={messagesContainerRef}>
                  {isAllMode && lazyMessagesLoading && (
                    <div className={styles.conversationLoading}>Chargement des messages…</div>
                  )}
                  {(() => {
                      const lastOutboundId = [...messagesForDisplay].reverse().find(
                        (item) => !('type' in item) && (item as Message).direction === "outbound"
                      )?.id;
                      return messagesForDisplay.map((item) => {
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
                            contactName={activeConversation?.contactHandle || activeConversation?.contactName}
                            isLastOutbound={item.id === lastOutboundId}
                          />
                        );
                      });
                    })()}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className={styles.chatComposer}>
                    <textarea
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                      placeholder={isWindowExpired ? "Fenêtre 24h expirée" : "Écrire un message…"}
                      disabled={isWindowExpired}
                    />
                    <div className={styles.chatComposerActions}>
                      {isWindowExpired ? (
                        <span className={styles.windowExpiredNotice}>
                          Fenêtre 24h expirée · Impossible de répondre
                        </span>
                      ) : (
                        <span style={{ color: "var(--app-text-secondary)", fontSize: "12px" }}>
                          Canal actif : {activeConversation.channel}
                        </span>
                      )}
                    <button
                      type="button"
                      className={styles.chatComposerSend}
                      onClick={handleSendMessage}
                      disabled={!composerText.trim() || isWindowExpired}
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




