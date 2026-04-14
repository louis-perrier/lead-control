import {
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts";
import styles from "./Dashboard.module.css";
import useAgents from "../hooks/useAgents";
import useClaraConversations from "../hooks/useClaraConversations";
import useAllConversations from "../hooks/useAllConversations";
import supabase from "../lib/supabase";

type ChannelOption = "Instagram" | "WhatsApp" | "Telegram";
type ChannelFilterOption = ChannelOption | "All";
type StatusOption = "Ouvert" | "Clos" | "Handoff";
type PeriodOption = "today" | "3" | "7" | "14" | "30" | "year";
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
  transcriptStatus?: string;
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

// ── Count-up animation hook
const useCountUp = (target: number, duration = 1100, decimals = 0) => {
  const [current, setCurrent] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    startRef.current = null;
    let rafId: number;
    const precision = Math.max(0, Math.floor(decimals));
    const factor = Math.pow(10, precision);
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target * factor) / factor);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, decimals]);
  return current;
};

type RoiKpiCardProps = {
  label: string;
  value: number;
  format: "number" | "currency" | "percent";
  highlight?: boolean;
  percentDecimals?: number;
};

const RoiKpiCard: FunctionComponent<RoiKpiCardProps> = ({
  label,
  value,
  format,
  highlight = false,
  percentDecimals = 0,
}) => {
  const animated = useCountUp(value, 1100, format === "percent" ? percentDecimals : 0);
  const display =
    format === "currency"
      ? `${animated.toLocaleString("fr-FR")} €`
      : format === "percent"
      ? `${animated.toLocaleString("fr-FR", {
          minimumFractionDigits: percentDecimals,
          maximumFractionDigits: percentDecimals,
        })} %`
      : animated.toLocaleString("fr-FR");
  return (
    <article
      className={`${styles.roiKpiCard} ${
        highlight ? styles.roiKpiCardRevenue : ""
      }`.trim()}
    >
      <div className={styles.roiKpiValue}>{display}</div>
      <div className={styles.roiKpiLabel}>{label}</div>
    </article>
  );
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
  const normalizedDirection = String(message.direction ?? "").toLowerCase();
  const normalizedAuthorType = String(message.author_type ?? "").toLowerCase();
  const isOutboundDirection =
    normalizedDirection === "out" || normalizedDirection === "outbound";
  const isInboundDirection =
    normalizedDirection === "in" || normalizedDirection === "inbound";
  let mediaPath: string | null = null;
  let transcriptStatus: string | undefined = undefined;
  let transcriptContent: string | null = null;
  let transcriptError: string | null = null;
  let attachment: any = undefined;

  if (isAudioMessage) {
    mediaPath = message.media_path || null;
    const rawstring = message.transcript_status;
    transcriptStatus = rawstring === "none" ? undefined : rawstring;
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
          (message.transcript_status as string | undefined) ??
          (message.transcription_status as string | undefined) ??
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
    direction: isOutboundDirection ? "outbound" : "inbound",
    text: message.body_text ?? "",
    sentAt: message.sent_at ?? message.created_at ?? new Date().toISOString(),
    attachment,
    mediaPath: mediaPath ?? undefined,
    transcriptStatus,
    transcript: transcriptContent,
    transcriptError,
    authorType:
      normalizedAuthorType === "human"
        ? "human"
        : normalizedAuthorType === "customer"
        ? "customer"
        : normalizedAuthorType === "agent"
        ? "agent"
        : isInboundDirection
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

const conversationHasProspectReply = (conversation: Conversation): boolean => {
  return conversation.messages.some(
    (message) =>
      message.direction === "inbound" && message.authorType === "customer",
  );
};

const conversationHasProspectReplyInWindow = (
  conversation: Conversation,
  window: PeriodWindow,
): boolean =>
  conversation.messages.some(
    (message) =>
      message.direction === "inbound" &&
      message.authorType === "customer" &&
      isInPeriodWindow(message.sentAt, window),
  );

const toNumericConversationId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
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


type DashboardStats = {
  responses: number;
  messages: number;
  active: number;
  responseTime: number;
};

const computeDashboardStats = (
  conversations: Conversation[],
  window: PeriodWindow,
): DashboardStats => {
  let totalResponseMs = 0;
  let responsePairs = 0;
  const responses = conversations.reduce((acc, conversation) => {
    acc += conversation.messages.filter(
      (message) =>
        message.authorType === "agent" &&
        message.direction === "outbound" &&
        isInPeriodWindow(message.sentAt, window),
    ).length;
    for (const message of conversation.messages) {
      if (
        message.authorType !== "agent" ||
        message.direction !== "outbound" ||
        !isInPeriodWindow(message.sentAt, window) ||
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

  const messagesReceived = conversations.reduce(
    (acc, conversation) =>
      acc +
      conversation.messages.filter(
        (message) =>
          message.direction === "inbound" &&
          message.authorType === "customer" &&
          isInPeriodWindow(message.sentAt, window),
      ).length,
    0,
  );

  const activeConversations = conversations.filter(
    (conversation) =>
      conversation.status === "Ouvert" &&
      conversationHasProspectReplyInWindow(conversation, window),
  ).length;

  const averageResponseSeconds =
    responsePairs === 0 ? 0 : Math.round((totalResponseMs / responsePairs) / 1000);

  return {
    responses,
    messages: messagesReceived,
    active: activeConversations,
    responseTime: averageResponseSeconds,
  };
};

const getPreviousPeriodWindow = (
  period: PeriodOption,
  currentWindow: PeriodWindow,
): PeriodWindow => {
  if (period === "year") {
    const previousStartDate = new Date(currentWindow.startDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
    const previousEndDate = new Date(currentWindow.endMs);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);
    return {
      daySpan: currentWindow.daySpan,
      startDate: previousStartDate,
      startMs: previousStartDate.getTime(),
      endMs: previousEndDate.getTime(),
    };
  }

  if (period === "today") {
    const startMs = currentWindow.startMs - DAY_IN_MS;
    const endMs = currentWindow.startMs - 1;
    return {
      daySpan: 1,
      startDate: new Date(startMs),
      startMs,
      endMs,
    };
  }

  const periodShiftMs = currentWindow.daySpan * DAY_IN_MS;
  const startMs = currentWindow.startMs - periodShiftMs;
  const endMs = currentWindow.endMs - periodShiftMs;
  return {
    daySpan: currentWindow.daySpan,
    startDate: new Date(startMs),
    startMs,
    endMs,
  };
};

const calculateDeltaPercent = (current: number, previous: number): number => {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return Math.round(((current - previous) / previous) * 100);
};

const isNewComparison = (current: number, previous: number): boolean =>
  previous === 0 && current > 0;

const KpiCard: FunctionComponent<{
  label: string;
  value: string;
  currentValue: number;
  previousValue: number;
  deltaPercent: number;
  currentText: string;
  previousText: string;
  deltaLabel: string;
  previousLabel: string;
  isNew?: boolean;
  reverseTrend?: boolean;
}> = ({
  label,
  value,
  currentValue,
  previousValue,
  deltaPercent,
  currentText,
  previousText,
  deltaLabel,
  previousLabel,
  isNew = false,
  reverseTrend = false,
}) => {
  const isNeutral = deltaPercent === 0;
  const isPositiveTrend = reverseTrend ? deltaPercent < 0 : deltaPercent > 0;
  const deltaClass = isNew
    ? styles.claraKpiDeltaNew
    : isNeutral
    ? styles.claraKpiDeltaNeutral
    : isPositiveTrend
    ? styles.claraKpiDeltaPositive
    : styles.claraKpiDeltaNegative;
  const cardClass = isNeutral
    ? styles.claraKpiCardNeutral
    : isPositiveTrend
    ? styles.claraKpiCardPositive
    : styles.claraKpiCardNegative;
  const deltaArrow = isNeutral ? "•" : deltaPercent > 0 ? "↗" : "↘";
  const deltaSign = deltaPercent > 0 ? "+" : "";
  const showMultiplier =
    !isNew && previousValue > 0 && deltaPercent > 300;
  const multiplierText = showMultiplier
    ? `x${(currentValue / previousValue).toLocaleString("fr-FR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}`
    : "";

  return (
  <article className={`${styles.claraKpiCard} ${cardClass}`.trim()}>
    <div className={styles.claraKpiCardValue}>{value}</div>
    <div className={styles.claraKpiCardLabel}>{label}</div>
    <div className={`${styles.claraKpiCardDeltaPill} ${deltaClass}`.trim()}>
      <span>
        {isNew
          ? "Nouveau"
          : showMultiplier
          ? multiplierText
          : `${deltaArrow} ${deltaSign}${deltaPercent}%`}
      </span>
      <span>{deltaLabel}</span>
    </div>
    <div className={styles.claraKpiCardComparison}>
      {`Actuel: ${currentText} | ${previousLabel}: ${previousText}`}
    </div>
  </article>
  );
};


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


type RoiData = {
  callsBooked: number;
  revenueGenerated: number;
  closeRate: number;
  bookedConversations: number;
};

type RoiBookingConversation = {
  agent_config_id?: string | null;
} | null;

type RoiBookingRow = {
  id: string;
  created_at: string;
  conversation_id: number | string | null;
  conversations?: RoiBookingConversation | RoiBookingConversation[] | null;
};

type RoiClosingRow = {
  amount: number | null;
  is_closed: boolean | null;
  closed_at: string | null;
  agent_config_id: string | null;
};

const getBookingAgentConfigId = (booking: RoiBookingRow): string | null => {
  const relation = booking.conversations;
  if (Array.isArray(relation)) {
    return relation[0]?.agent_config_id ?? null;
  }
  return relation?.agent_config_id ?? null;
};

const getUniqueBookedCallKey = (booking: RoiBookingRow): string => {
  const conversationId = toNumericConversationId(booking.conversation_id);
  if (conversationId !== null) {
    return `conversation:${conversationId}`;
  }
  return `booking:${booking.id}`;
};

const getRoiPeriodLabel = (period: PeriodOption): string => {
  if (period === "today") return "aujourd'hui";
  if (period === "year") return "cette annee";
  return `sur ${period}j`;
};

const Dashboard: FunctionComponent = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodOption>("3");
  const [channelFilter, setChannelFilter] = useState<ChannelFilterOption>("All");
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [isConfigMenuOpen, setConfigMenuOpen] = useState(false);
  const configMenuRef = useRef<HTMLDivElement | null>(null);
  const [topConversationPage, setTopConversationPage] = useState(0);
  const [roiBookings, setRoiBookings] = useState<RoiBookingRow[]>([]);
  const [roiClosings, setRoiClosings] = useState<RoiClosingRow[]>([]);

  useEffect(() => {
    let isCancelled = false;
    let roiChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupRoiSync = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || isCancelled) return;

      const fetchRoiSource = async () => {
        const [bookingsRes, closingsRes] = await Promise.all([
          supabase
            .from("calendly_bookings")
            .select(`
              id,
              created_at,
              conversation_id,
              conversations ( agent_config_id )
            `)
            .eq("user_id", user.id),
          supabase
            .from("deal_closings")
            .select("amount, is_closed, closed_at, agent_config_id")
            .eq("user_id", user.id),
        ]);

        if (isCancelled) return;

        if (bookingsRes.error || closingsRes.error) {
          setRoiBookings([]);
          setRoiClosings([]);
          return;
        }

        setRoiBookings((bookingsRes.data ?? []) as RoiBookingRow[]);
        setRoiClosings((closingsRes.data ?? []) as RoiClosingRow[]);
      };

      await fetchRoiSource();
      if (isCancelled) return;

      roiChannel = supabase
        .channel(`realtime:dashboard-roi:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "calendly_bookings",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchRoiSource();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "deal_closings",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchRoiSource();
          },
        )
        .subscribe();
    };

    setupRoiSync();

    return () => {
      isCancelled = true;
      if (roiChannel) {
        supabase.removeChannel(roiChannel);
      }
    };
  }, []);

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
  const periodWindow = useMemo(() => getPeriodWindow(period), [period]);

  const roiData = useMemo<RoiData>(() => {
    const isScopedToSingleConfig =
      Boolean(selectedConfigId) && selectedConfigId !== "all";

    const scopedBookings = !isScopedToSingleConfig
      ? roiBookings
      : roiBookings.filter(
          (booking) => getBookingAgentConfigId(booking) === selectedConfigId,
        );

    const scopedClosings = !isScopedToSingleConfig
      ? roiClosings
      : roiClosings.filter((closing) => closing.agent_config_id === selectedConfigId);

    const isInCurrentWindow = (iso: string | null | undefined) => {
      if (!iso) return false;
      const timeMs = new Date(iso).getTime();
      return (
        Number.isFinite(timeMs) &&
        timeMs >= periodWindow.startMs &&
        timeMs <= periodWindow.endMs
      );
    };

    const bookingsInWindow = scopedBookings.filter((booking) =>
      isInCurrentWindow(booking.created_at),
    );
    const closedDealsInWindow = scopedClosings.filter(
      (closing) =>
        (closing.is_closed === true || closing.is_closed === false) &&
        isInCurrentWindow(closing.closed_at),
    );
    const wonClosingsInWindow = closedDealsInWindow.filter(
      (closing) => closing.is_closed === true,
    );

    const uniqueBookedCallKeys = new Set<string>();
    bookingsInWindow.forEach((booking) => {
      uniqueBookedCallKeys.add(getUniqueBookedCallKey(booking));
    });
    const callsBooked = uniqueBookedCallKeys.size;
    const wonCount = wonClosingsInWindow.length;
    const closedDealsCount = closedDealsInWindow.length;

    const bookedConversationIds = new Set<number>();
    bookingsInWindow.forEach((booking) => {
      const bookingConversationId = toNumericConversationId(booking.conversation_id);
      if (bookingConversationId !== null) {
        bookedConversationIds.add(bookingConversationId);
      }
    });
    const bookedConversations = bookedConversationIds.size;

    const revenueGenerated = wonClosingsInWindow.reduce(
      (total, closing) => total + (closing.amount ?? 0),
      0,
    );

    const closeRateRaw =
      closedDealsCount > 0
        ? Math.round((wonCount / closedDealsCount) * 1000) / 10
        : 0;
    const closeRate = Math.min(100, Math.max(0, closeRateRaw));

    return {
      callsBooked,
      revenueGenerated,
      closeRate,
      bookedConversations,
    };
  }, [roiBookings, roiClosings, selectedConfigId, periodWindow]);

  const roiPeriodLabel = useMemo(() => getRoiPeriodLabel(period), [period]);

  const selectedAgent = useMemo(
    () =>
      displayedAgents.find(
        (agent) => (agent.display_id ?? agent.agent_id) === selectedConfigId,
      ),
    [displayedAgents, selectedConfigId],
  );

  const showStats =
    isAllMode ||
    (selectedAgent?.dashboard_tab_component ?? []).includes("stats");

  const { data: rawConversationsSingle = [] } = useClaraConversations(
    !isAllMode ? selectedConfigId ?? undefined : undefined,
  );

  const { data: rawConversationsAll = [] } = useAllConversations(
    isAllMode ? allConfigIds : [],
  );

  const rawConversations = isAllMode ? rawConversationsAll : rawConversationsSingle;
  const conversationData = useMemo(
    () => rawConversations.map(mapConversationRecord),
    [rawConversations],
  );

  const scopedBookingsForView = useMemo(() => {
    const isScopedToSingleConfig =
      Boolean(selectedConfigId) && selectedConfigId !== "all";
    if (!isScopedToSingleConfig) {
      return roiBookings;
    }
    return roiBookings.filter(
      (booking) => getBookingAgentConfigId(booking) === selectedConfigId,
    );
  }, [roiBookings, selectedConfigId]);

  const activeConversationIdsForBookingRate = useMemo(() => {
    const ids = new Set<number>();
    conversationData.forEach((conversation) => {
      const matchesChannel =
        channelFilter === "All" || conversation.channel === channelFilter;
      if (
        !matchesChannel ||
        conversation.status !== "Ouvert" ||
        !conversationHasProspectReplyInWindow(conversation, periodWindow)
      ) {
        return;
      }
      const numericId = toNumericConversationId(conversation.id);
      if (numericId !== null) {
        ids.add(numericId);
      }
    });
    return ids;
  }, [conversationData, channelFilter, periodWindow]);

  const activeConversationsForBookingRate = activeConversationIdsForBookingRate.size;

  const bookingRate = useMemo(() => {
    const bookedActiveConversations = new Set<number>();
    scopedBookingsForView.forEach((booking) => {
      const bookingTime = new Date(booking.created_at).getTime();
      const isInWindow =
        Number.isFinite(bookingTime) &&
        bookingTime >= periodWindow.startMs &&
        bookingTime <= periodWindow.endMs;
      if (!isInWindow) {
        return;
      }
      const bookingConversationId = toNumericConversationId(booking.conversation_id);
      if (
        bookingConversationId !== null &&
        activeConversationIdsForBookingRate.has(bookingConversationId)
      ) {
        bookedActiveConversations.add(bookingConversationId);
      }
    });

    const rawRate =
      activeConversationsForBookingRate > 0
        ? Math.round(
            (bookedActiveConversations.size / activeConversationsForBookingRate) *
              1000,
          ) / 10
        : 0;
    return Math.min(100, Math.max(0, rawRate));
  }, [
    scopedBookingsForView,
    activeConversationIdsForBookingRate,
    activeConversationsForBookingRate,
    periodWindow,
  ]);

  const handleConfigChange = (value: string) => {
    setSelectedConfigId(value);
    setConfigMenuOpen(false);
  };

  useEffect(() => {
    if (agentConfigOptions.length === 0) {
      if (selectedConfigId !== null) setSelectedConfigId(null);
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
    if (!isConfigMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        configMenuRef.current &&
        !configMenuRef.current.contains(event.target as Node)
      ) {
        setConfigMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isConfigMenuOpen]);

  const activeConfigOption = agentConfigOptions.find(
    (option) => option.value === selectedConfigId,
  );

  const previousPeriodWindow = useMemo(
    () => getPreviousPeriodWindow(period, periodWindow),
    [period, periodWindow],
  );

  const channelScopedConversations = useMemo(
    () =>
      conversationData.filter(
        (conversation) =>
          channelFilter === "All" || conversation.channel === channelFilter,
      ),
    [conversationData, channelFilter],
  );

  const stats = useMemo(
    () => computeDashboardStats(channelScopedConversations, periodWindow),
    [channelScopedConversations, periodWindow],
  );

  const previousStats = useMemo(
    () =>
      computeDashboardStats(
        channelScopedConversations,
        previousPeriodWindow,
      ),
    [channelScopedConversations, previousPeriodWindow],
  );

  const evolutionSeries = useMemo(() => {
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
  }, [isAllMode, channelScopedConversations, period, periodWindow]);

  const kpiCards = [
    {
      label: "Messages recus",
      value: `${stats.messages.toLocaleString("fr-FR")}`,
      currentValue: stats.messages,
      previousValue: previousStats.messages,
      currentText: stats.messages.toLocaleString("fr-FR"),
      previousText: previousStats.messages.toLocaleString("fr-FR"),
      deltaPercent: calculateDeltaPercent(stats.messages, previousStats.messages),
      isNew: isNewComparison(stats.messages, previousStats.messages),
      reverseTrend: false,
    },
    {
      label: "Conversations actives",
      value: `${stats.active.toLocaleString("fr-FR")}`,
      currentValue: stats.active,
      previousValue: previousStats.active,
      currentText: stats.active.toLocaleString("fr-FR"),
      previousText: previousStats.active.toLocaleString("fr-FR"),
      deltaPercent: calculateDeltaPercent(stats.active, previousStats.active),
      isNew: isNewComparison(stats.active, previousStats.active),
      reverseTrend: false,
    },
    {
      label: "Reponses envoyees de l'agent",
      value: `${stats.responses.toLocaleString("fr-FR")}`,
      currentValue: stats.responses,
      previousValue: previousStats.responses,
      currentText: stats.responses.toLocaleString("fr-FR"),
      previousText: previousStats.responses.toLocaleString("fr-FR"),
      deltaPercent: calculateDeltaPercent(stats.responses, previousStats.responses),
      isNew: isNewComparison(stats.responses, previousStats.responses),
      reverseTrend: false,
    },
    {
      label: "Temps de reponse moyen",
      value: `${stats.responseTime.toLocaleString("fr-FR")} s`,
      currentValue: stats.responseTime,
      previousValue: previousStats.responseTime,
      currentText: `${stats.responseTime.toLocaleString("fr-FR")} s`,
      previousText: `${previousStats.responseTime.toLocaleString("fr-FR")} s`,
      deltaPercent: calculateDeltaPercent(
        stats.responseTime,
        previousStats.responseTime,
      ),
      isNew: isNewComparison(stats.responseTime, previousStats.responseTime),
      reverseTrend: true,
    },
  ];
  const kpiDeltaLabel = period === "today" ? "vs hier" : "vs periode precedente";
  const kpiPreviousLabel = period === "today" ? "Hier" : "Precedent";

  const channelStats = useMemo(() => {
    const bucket: Record<ChannelOption, number> = { Instagram: 0, WhatsApp: 0, Telegram: 0 };
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

  const maxChannelCount = Math.max(...channelStats.map((stat) => stat.count)) || 1;
  const sparklineBarColor =
    channelFilter === "All" ? "var(--app-primary)" : channelFocusColors[channelFilter];
  const sparklineValues = evolutionSeries.map((point) => point.count);
  const sparklineMax = Math.max(...sparklineValues, 1);
  const evolutionAxisLabels = useMemo(
    () => buildEvolutionAxisLabels(period, evolutionSeries),
    [period, evolutionSeries],
  );

  const topConversations = useMemo(
    () =>
      channelScopedConversations
        .filter((conversation) => conversationHasProspectReply(conversation))
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
          if (b.periodMessageCount !== a.periodMessageCount)
            return b.periodMessageCount - a.periodMessageCount;
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
    if (topConversationPage <= topConversationPageCount - 1) return;
    setTopConversationPage(Math.max(0, topConversationPageCount - 1));
  }, [topConversationPage, topConversationPageCount]);

  useEffect(() => {
    setTopConversationPage(0);
  }, [period, channelFilter, selectedConfigId]);

  const paginatedTopConversations = useMemo(() => {
    const startIndex = topConversationPage * TOP_CONVERSATIONS_PAGE_SIZE;
    return topConversations.slice(startIndex, startIndex + TOP_CONVERSATIONS_PAGE_SIZE);
  }, [topConversations, topConversationPage]);

  const topConversationSlots = useMemo<
    Array<{ conversation: Conversation; periodMessageCount: number } | null>
  >(() => {
    const slots: Array<{ conversation: Conversation; periodMessageCount: number } | null> = [
      ...paginatedTopConversations,
    ];
    while (slots.length < TOP_CONVERSATIONS_PAGE_SIZE) slots.push(null);
    return slots;
  }, [paginatedTopConversations]);

  return (
    <AppLayout mainClassName={styles.dashboardMainFixed}>
      <div className={styles.claraDashboardArea}>
        <div className={styles.claraDashboard}>
          <div className={styles.claraDashboardContent}>
            <header className={styles.claraHeader}>
              <div className={styles.claraHeaderTop}>
                <h1 className={styles.claraHeaderTitle}>
                  Dashboard · {isAllMode ? "Tous les agents" : (activeConfigOption?.label ?? "Clara")}
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
                            className={`${styles.configDot} ${
                              selectedAgent?.is_active === false ? styles.configDotInactive : ""
                            }`}
                            title={selectedAgent?.is_active === false ? "Inactif" : "Actif"}
                          />
                        )}
                        {isAllMode
                          ? "TOUS LES AGENTS"
                          : (activeConfigOption?.label ?? "Selectionner un agent").toUpperCase()}
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
                <ChannelFilterGroup active={channelFilter} onChange={setChannelFilter} />
              </div>
            </header>

            {/* Top business metrics - always visible */}
            <section className={styles.roiSection}>
              <RoiKpiCard
                label={`Calls bookes ${roiPeriodLabel}`}
                value={roiData.callsBooked}
                format="number"
              />
              <RoiKpiCard
                label={`Taux de booking ${roiPeriodLabel}`}
                value={bookingRate}
                format="percent"
                percentDecimals={1}
              />
              <RoiKpiCard
                label={`Taux de close ${roiPeriodLabel}`}
                value={roiData.closeRate}
                format="percent"
                percentDecimals={1}
              />
              <RoiKpiCard
                label={`Revenus generes ${roiPeriodLabel}`}
                value={roiData.revenueGenerated}
                format="currency"
                highlight
              />
            </section>

            {!showStats ? (
              <div className={styles.noTabsMessage}>
                <p>Aucune statistique définie pour cet agent.</p>
              </div>
            ) : (
              <section className={styles.claraStatsGrid}>
                <div className={styles.claraKpiRow}>
                  {kpiCards.map((card) => (
                    <KpiCard
                      key={card.label}
                      label={card.label}
                      value={card.value}
                      currentValue={card.currentValue}
                      previousValue={card.previousValue}
                      deltaPercent={card.deltaPercent}
                      currentText={card.currentText}
                      previousText={card.previousText}
                      deltaLabel={kpiDeltaLabel}
                      previousLabel={kpiPreviousLabel}
                      isNew={card.isNew}
                      reverseTrend={card.reverseTrend}
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
                      <span>
                        {isAllMode
                          ? "Aucune conversation démarrée sur cette période."
                          : "L'agent n'a pas encore envoyé de réponses sur cette période."}
                      </span>
                      <button
                        type="button"
                        className={styles.sparklineEmptyLink}
                        onClick={() => navigate("/app/conversations")}
                      >
                        Voir toutes les conversations
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`${styles.claraSparkline} ${
                        period === "year" ? styles.claraSparklineYear : ""
                      }`.trim()}
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
                            style={{ height: `${height}%`, background: sparklineBarColor }}
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
                        const channelBarColor = !isChannelFocused
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
                                style={{ width: `${barWidth}%`, backgroundColor: channelBarColor }}
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
                                  colorChannel={channelFilter === "All" ? undefined : channelFilter}
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
                          onClick={() =>
                            setTopConversationPage((prev) => Math.max(0, prev - 1))
                          }
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
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
