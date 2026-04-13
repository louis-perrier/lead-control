import {
  FunctionComponent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppLayout } from "../layouts";
import ConfirmationDialog from "../components/ConfirmationDialog";
import {
  IconConversationPlay,
  IconConversationStop,
} from "../components/DashboardIcons";
import styles from "./Conversations.module.css";
import useAgents from "../hooks/useAgents";
import useClaraConversations from "../hooks/useClaraConversations";
import useAllConversations from "../hooks/useAllConversations";
import useConversationMessages from "../hooks/useConversationMessages";
import supabase from "../lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AudioMessageBubble, {
  TranscriptStatus,
} from "../components/AudioMessageBubble";
import useSignedImageUrl from "../hooks/useSignedImageUrl";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelOption = "Instagram" | "WhatsApp" | "Telegram";
type ChannelFilterOption = ChannelOption | "All";
type StatusOption = "Ouvert" | "Clos" | "Handoff";
type MessageDirection = "inbound" | "outbound";

type Attachment = {
  type: "image" | "file" | "audio";
  label: string;
  mediaPath?: string;
};

type Message = {
  id: string;
  messageRecordId: string;
  direction: MessageDirection;
  text: string;
  sentAt: string;
  attachment?: Attachment;
  mediaPath?: string;
  messageType?: "text" | "audio" | "image" | "reaction";
  transcriptStatus?: TranscriptStatus;
  transcript?: string | null;
  transcriptError?: string | null;
  authorType?: "agent" | "human" | "customer";
  authorRef?: string | null;
  automationStart?: string | null;
  automationEnd?: string | null;
  readByContactAt?: string | null;
  externalMessageId?: string | null;
  reactionEmoji?: string | null;
  reactionTargetExternalMessageId?: string | null;
  reactionTargetMessageId?: string | null;
  isReactionEvent?: boolean;
};

type Conversation = {
  id: string;
  contactName: string;
  contactHandle: string;
  contactId?: string | null;
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

// ─── Constants ────────────────────────────────────────────────────────────────

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

const statusFilterOptions = [
  "all",
  "unread",
  "hot",
  "scheduled",
  "closed",
  "error",
] as const;
type StatusFilterOption = (typeof statusFilterOptions)[number];

const statusFilterLabels: Record<StatusFilterOption, string> = {
  all: "Tous",
  unread: "Non lus",
  hot: "Chaud",
  scheduled: "Relance planifi\u00e9e",
  closed: "Cl\u00f4tur\u00e9e",
  error: "Erreur",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatRelativeTime = (iso: string) => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.round((now - then) / 60000));
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;
  if (diffMinutes < 1440) return `il y a ${Math.floor(diffMinutes / 60)} h`;
  return `il y a ${Math.floor(diffMinutes / 1440)} j`;
};

const formatDateSeparator = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (messageDate.getTime() === today.getTime()) return "Aujourd'hui";
  if (messageDate.getTime() === yesterday.getTime()) return "Hier";
  const daysDiff = Math.floor(
    (today.getTime() - messageDate.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (daysDiff < 7 && daysDiff >= 2)
    return date.toLocaleDateString("fr-FR", { weekday: "long" });
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
};

const normalizeChannel = (platform?: string): ChannelOption => {
  const normalized = platform?.toLowerCase();
  if (normalized === "instagram") return "Instagram";
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized === "telegram") return "Telegram";
  return "Instagram";
};

const normalizeTextValue = (value: unknown): string => {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "nan") return "";
  return text;
};

const isGenericContactName = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "contact" ||
    normalized === "prospect" ||
    normalized === "utilisateur" ||
    normalized === "user" ||
    normalized === "unknown" ||
    normalized === "inconnu" ||
    normalized === "-" ||
    normalized === "—"
  );
};

const normalizeContactNameValue = (value: unknown): string => {
  const text = normalizeTextValue(value);
  if (!text) return "";
  return isGenericContactName(text) ? "" : text;
};

const pickFirstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = normalizeTextValue(value);
    if (text) return text;
  }
  return "";
};

const pickFirstContactName = (...values: unknown[]): string => {
  for (const value of values) {
    const text = normalizeContactNameValue(value);
    if (text) return text;
  }
  return "";
};

const isDigitsOnly = (value: string): boolean => /^\d+$/.test(value.trim());

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const reactionMessageTypes = new Set([
  "reaction",
  "message_reaction",
  "emoji_reaction",
  "reaction_added",
]);

const getReactionEmoji = (message: any): string | null => {
  const metadata = toRecord(message.metadata);
  const metadataReaction = toRecord(metadata.reaction);
  const payload = toRecord(message.payload);
  const payloadReaction = toRecord(payload.reaction);
  const attachmentReaction = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment: any) => toRecord(attachment))
        .find((attachment: Record<string, unknown>) => attachment.type === "reaction") ?? {}
    : {};

  const reactionText = pickFirstText(
    message.reaction_emoji,
    message.emoji,
    message.reaction,
    metadata.reaction_emoji,
    metadata.emoji,
    typeof metadata.reaction === "string" ? metadata.reaction : "",
    metadataReaction.emoji,
    metadataReaction.value,
    payload.reaction_emoji,
    payload.reaction,
    payloadReaction.emoji,
    payloadReaction.value,
    attachmentReaction.emoji,
    attachmentReaction.value,
  );

  if (reactionText) return reactionText;

  const messageType = normalizeTextValue(message.message_type).toLowerCase();
  const bodyText = normalizeTextValue(message.body_text);
  if (
    reactionMessageTypes.has(messageType) &&
    bodyText &&
    bodyText.length <= 10 &&
    !bodyText.includes(" ")
  ) {
    return bodyText;
  }
  return null;
};

const getReactionTargetExternalMessageId = (message: any): string | null => {
  const metadata = toRecord(message.metadata);
  const metadataReaction = toRecord(metadata.reaction);
  const metadataReactionTo = toRecord(metadata.reaction_to);
  const payload = toRecord(message.payload);
  const payloadReaction = toRecord(payload.reaction);
  const payloadReactionTo = toRecord(payload.reaction_to);
  const messageReactionTo = toRecord(message.reaction_to);

  const target = pickFirstText(
    message.reaction_to_external_message_id,
    message.target_external_message_id,
    message.parent_external_message_id,
    metadata.reaction_to_external_message_id,
    metadata.target_external_message_id,
    metadataReaction.target_external_message_id,
    metadataReactionTo.external_message_id,
    metadataReactionTo.target_external_message_id,
    payload.reaction_to_external_message_id,
    payloadReaction.target_external_message_id,
    payloadReactionTo.external_message_id,
    payloadReactionTo.target_external_message_id,
    messageReactionTo.external_message_id,
    messageReactionTo.target_external_message_id,
  );

  return target || null;
};

const getReactionTargetMessageId = (message: any): string | null => {
  const metadata = toRecord(message.metadata);
  const metadataReaction = toRecord(metadata.reaction);
  const metadataReactionTo = toRecord(metadata.reaction_to);
  const payload = toRecord(message.payload);
  const payloadReaction = toRecord(payload.reaction);
  const payloadReactionTo = toRecord(payload.reaction_to);
  const messageReactionTo = toRecord(message.reaction_to);

  const target = pickFirstText(
    message.reaction_to_message_id,
    message.parent_message_id,
    message.target_message_id,
    metadata.reaction_to_message_id,
    metadata.target_message_id,
    metadataReaction.target_message_id,
    metadataReactionTo.message_id,
    metadataReactionTo.target_message_id,
    payload.reaction_to_message_id,
    payloadReaction.target_message_id,
    payloadReactionTo.message_id,
    payloadReactionTo.target_message_id,
    messageReactionTo.message_id,
    messageReactionTo.target_message_id,
  );

  return target || null;
};

const isReactionMessage = (message: any, reactionEmoji: string | null): boolean => {
  const messageType = normalizeTextValue(message.message_type).toLowerCase();
  return reactionMessageTypes.has(messageType) || Boolean(reactionEmoji);
};

const buildReactionFallbackText = (reactionEmoji: string | null): string =>
  reactionEmoji ? `Réaction ${reactionEmoji}` : "Réaction";

const mapMessageRecord = (convId: string, message: any): Message => {
  const reactionEmoji = getReactionEmoji(message);
  const reactionTargetExternalMessageId =
    getReactionTargetExternalMessageId(message);
  const reactionTargetMessageId = getReactionTargetMessageId(message);
  const isReactionEvent = isReactionMessage(message, reactionEmoji);
  const isAudioMessage = message.message_type === "audio";
  const isImageMessage = message.message_type === "image";
  let mediaPath: string | null = null;
  let transcriptStatus: TranscriptStatus | undefined = undefined;
  let transcriptContent: string | null = null;
  let transcriptError: string | null = null;
  let attachment: any = undefined;

  if (isAudioMessage) {
    mediaPath = message.media_path || null;
    const rawTranscriptStatus = message.transcript_status;
    transcriptStatus =
      rawTranscriptStatus === "none" ? undefined : rawTranscriptStatus;
    transcriptContent = message.transcript || null;
    transcriptError = message.transcript_error || null;
    attachment = {
      type: "audio" as const,
      label: mediaPath ? "Message vocal" : "Message vocal (fichier manquant)",
      mediaPath: mediaPath || undefined,
    };
  } else if (isImageMessage) {
    mediaPath = message.media_path || null;
    attachment = {
      type: "image" as const,
      label: "Image",
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
          message.transcription ?? message.transcript ?? message.transcribed_text ?? null;
        transcriptError =
          message.transcription_error ?? message.transcript_error ?? null;
      }
    }
  }

  const normalizedDirection = normalizeTextValue(message.direction).toLowerCase();
  const textValue = normalizeTextValue(message.body_text);

  return {
    id: `${convId}-${message.id}`,
    messageRecordId: String(message.id),
    direction:
      normalizedDirection === "out" || normalizedDirection === "outbound"
        ? "outbound"
        : "inbound",
    text: textValue || (isReactionEvent ? buildReactionFallbackText(reactionEmoji) : ""),
    sentAt: message.sent_at ?? message.created_at ?? new Date().toISOString(),
    attachment,
    mediaPath: mediaPath ?? undefined,
    messageType: isReactionEvent
      ? "reaction"
      : (message.message_type as Message["messageType"]) ?? "text",
    transcriptStatus,
    transcript: transcriptContent,
    transcriptError,
    authorType:
      message.author_type === "human"
        ? "human"
        : message.author_type === "customer"
        ? "customer"
        : "agent",
    authorRef: message.author_ref ?? null,
    automationStart: message.automation_start ?? null,
    automationEnd: message.automation_end ?? null,
    readByContactAt: message.read_by_contact_at ?? null,
    externalMessageId: message.external_message_id
      ? String(message.external_message_id)
      : null,
    reactionEmoji,
    reactionTargetExternalMessageId,
    reactionTargetMessageId,
    isReactionEvent,
  };
};

const mapConversationRecord = (record: any): Conversation => {
  const channel = normalizeChannel(record.platform);
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : {};
  const metadataContact =
    metadata.contact && typeof metadata.contact === "object"
      ? (metadata.contact as Record<string, unknown>)
      : {};
  const metadataProfile =
    metadata.profile && typeof metadata.profile === "object"
      ? (metadata.profile as Record<string, unknown>)
      : {};
  const metadataCustomer =
    metadata.customer && typeof metadata.customer === "object"
      ? (metadata.customer as Record<string, unknown>)
      : {};
  const messages =
    (record.conversation_messages ?? [])
      .map((message: any) => mapMessageRecord(String(record.id), message))
      .sort(
        (a: Message, b: Message) =>
          new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
      ) ?? [];
  const lastMessage =
    record.last_message_preview ?? messages[messages.length - 1]?.text ?? "";
  const inferredHandleFromMessages = normalizeTextValue(
    messages.find(
      (message: Message) =>
        message.authorType === "customer" && normalizeTextValue(message.authorRef),
    )?.authorRef,
  ).replace(/^@+/, "");
  const profileName = pickFirstContactName(
    record.contact_display_name,
    record.contact_name,
    record.full_name,
    record.profile_name,
    record.instagram_name,
    record.contact_full_name,
    metadata.contact_display_name,
    metadata.contact_name,
    metadata.display_name,
    metadata.full_name,
    metadata.profile_name,
    metadata.instagram_name,
    metadata.instagram_display_name,
    metadata.customer_name,
    metadata.name,
    metadataContact.display_name,
    metadataContact.full_name,
    metadataContact.name,
    metadataProfile.display_name,
    metadataProfile.full_name,
    metadataProfile.name,
    metadataCustomer.display_name,
    metadataCustomer.full_name,
    metadataCustomer.name,
  );
  const rawHandle = pickFirstText(
    record.contact_handle,
    record.instagram_handle,
    record.contact_username,
    record.username,
    metadata.contact_handle,
    metadata.instagram_handle,
    metadata.handle,
    metadata.username,
    metadata.ig_handle,
    metadata.ig_username,
    metadataContact.handle,
    metadataContact.username,
    metadataProfile.handle,
    metadataProfile.username,
    metadataCustomer.handle,
    metadataCustomer.username,
  ).replace(/^@+/, "");
  const resolvedHandle = rawHandle || inferredHandleFromMessages;
  const displayHandle =
    channel === "Instagram" && isDigitsOnly(resolvedHandle) ? "" : resolvedHandle;
  const contactName = profileName || displayHandle || "Contact";
  const contactHandle = displayHandle || "";
  return {
    id: String(record.id),
    contactName,
    contactHandle,
    contactId: record.contact_id != null ? String(record.contact_id) : null,
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
    lastErrorMessage: record.last_error_message ?? record.error_message ?? null,
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
  if (!tag) return {};
  const normalized = tag.toLowerCase();
  return heatTagStyles[normalized] ?? heatTagStyles.unknown;
};

const heatTagLabels: Record<string, string> = {
  cold: "Froid",
  warm: "Ti\u00e8de",
  hot: "Chaud",
};

const getHeatTagLabel = (tag?: string): string | null => {
  if (!tag) return null;
  return heatTagLabels[tag.toLowerCase()] ?? null;
};

const getConversationStatusLabel = (conversation: Conversation): string => {
  if (conversation.automationState === "error") return "Erreur";
  if (conversation.automationState === "scheduled") return "Relance planifi\u00e9e";
  if (
    conversation.status === "Clos" ||
    conversation.automationState === "stopped" ||
    conversation.automationState === "condition_stop"
  ) {
    return "Cl\u00f4tur\u00e9e";
  }
  return "Ouverte";
};

const formatNextReplyShort = (iso?: string | null): string => {
  if (!iso) return "Relance planifi\u00e9e";
  const time = new Date(iso);
  const now = new Date();
  const isToday = time.toDateString() === now.toDateString();
  const isTomorrow =
    time.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  const hhmm = time.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isToday) return hhmm;
  if (isTomorrow) return `Dem. ${hhmm}`;
  return hhmm;
};

const formatNextReply = (iso?: string | null) => {
  if (!iso) return null;
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
    time: time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    relative,
  };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const getConversationNeedsAttention = (
  conversation: Conversation,
  isActive = false,
) =>
  !isActive &&
  conversation.automationState !== "error" &&
  conversation.automationState !== "stopped" &&
  conversation.automationState !== "condition_stop" &&
  Boolean(conversation.lastAgentReplyAt) &&
  conversation.lastAt > (conversation.lastAgentReplyAt ?? "");

const getAvatarInitials = (name: string): string => {
  const normalized = name.trim();
  if (!normalized) return "C";
  const safeCharPattern = /[A-Za-z0-9]/;
  const safeCharPatternGlobal = /[A-Za-z0-9]/g;

  const fromTokens = normalized
    .split(/\s+/)
    .map((token) => token.match(safeCharPattern)?.[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (fromTokens) return fromTokens;

  const fallback = (normalized.match(safeCharPatternGlobal) ?? [])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return fallback || "C";
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

const ChannelFilterGroup: FunctionComponent<{
  active: ChannelFilterOption;
  onChange: (value: ChannelFilterOption) => void;
  className?: string;
}> = ({ active, onChange, className = "" }) => (
  <div className={`${styles.channelFilterRow} ${className}`.trim()}>
    {channelFilterOptions
      .filter((option) => option !== "Telegram")
      .map((option) => {
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

const ConversationItem: FunctionComponent<{
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  agentLabel?: string;
}> = ({ conversation, isActive, onSelect, agentLabel }) => {
  const initials = getAvatarInitials(conversation.contactName);
  const needsAttention = getConversationNeedsAttention(conversation, isActive);
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  const isLastOutboundRead =
    lastMsg?.direction === "outbound" && lastMsg.readByContactAt != null;

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
      } ${needsAttention ? styles.conversationItemNeedsAttention : ""} ${
        getHeatTagLabel(conversation.tags[0])
          ? styles.conversationItemWithTag
          : ""
      }`.trim()}
      onClick={onSelect}
    >
      <span className={styles.conversationAvatar}>{initials}</span>
      <div className={styles.conversationDetails}>
        <div className={styles.conversationTop}>
          <div className={styles.conversationContactBlock}>
            <span>{conversation.contactName}</span>
            {conversation.contactHandle && (
              <span
                style={{ fontSize: "0.75em", color: "var(--app-text-secondary)" }}
              >
                @{conversation.contactHandle}
              </span>
            )}
</div>
          <div className={styles.conversationTopMeta}>
            <div className={styles.conversationTopMetaBadges}>
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
                  <span className={styles.badgeText}>
                    {formatNextReplyShort(conversation.nextReplyAt)}
                  </span>
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
            </div>
            <span className={styles.conversationPlatformBadge}>
              <ChannelBadge channel={conversation.channel} />
            </span>
          </div>
        </div>
        <p className={styles.conversationPreview}>
          {conversation.lastMessage.length > 70
            ? conversation.lastMessage.slice(0, 70) + "..."
            : conversation.lastMessage}
        </p>
        {conversation.automationState === "error" &&
          conversation.lastErrorMessage && (
            <div className={styles.conversationErrorMessage}>
              {conversation.lastErrorMessage}
            </div>
          )}
        <div className={styles.conversationBottom}>
          <span className={styles.conversationTime}>
            {isLastOutboundRead
              ? `Vu ${formatRelativeTime(conversation.lastAt)}`
              : formatRelativeTime(conversation.lastAt)}
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

const ChatBubble: FunctionComponent<{
  message: Message;
  contactName?: string;
  isLastOutbound?: boolean;
  inlineReactions?: string[];
}> = ({ message, contactName, isLastOutbound, inlineReactions = [] }) => {
  const isOutbound = message.direction === "outbound";
  const label =
    message.authorType === "human"
      ? "Vous"
      : message.authorType === "agent"
      ? "Assistant IA"
      : contactName || "Client";
  const visibleReactions = [...inlineReactions];
  if (message.reactionEmoji && !visibleReactions.includes(message.reactionEmoji)) {
    visibleReactions.push(message.reactionEmoji);
  }
  return (
    <div
      className={`${styles.chatBubble} ${
        isOutbound ? styles.chatBubbleOutbound : styles.chatBubbleInbound
      }`}
    >
      {label && <span className={styles.chatBubbleSender}>{label}</span>}
      <p
        className={message.isReactionEvent ? styles.chatReactionText : ""}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {message.text}
      </p>
      {message.attachment && (
        <div className={styles.attachmentChip}>
          <span>
            {message.attachment.type === "image"
              ? "Image"
              : message.attachment.type === "audio"
              ? "Vocal"
              : "Fichier"}{" "}
            :
          </span>
          <strong>{message.attachment.label}</strong>
        </div>
      )}
      {visibleReactions.length > 0 && (
        <div className={styles.chatReactionsRow}>
          {visibleReactions.map((emoji, index) => (
            <span key={`${emoji}-${index}`} className={styles.chatReactionBadge}>
              {emoji}
            </span>
          ))}
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

const DateSeparator: FunctionComponent<{ dateString: string }> = ({
  dateString,
}) => (
  <div className={styles.dateSeparator}>
    <div className={styles.dateSeparatorLine} />
    <div className={styles.dateSeparatorText}>
      {formatDateSeparator(dateString)}
    </div>
    <div className={styles.dateSeparatorLine} />
  </div>
);

const ImageMessageBubble: FunctionComponent<{
  messageId: string;
  mediaPath: string;
  isMine: boolean;
}> = ({ messageId, mediaPath, isMine }) => {
  const { data: signedUrl, isLoading, isError } = useSignedImageUrl(mediaPath, messageId, true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxBackdropPointerDownRef = useRef(false);
  const handleLightboxBackdropPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    lightboxBackdropPointerDownRef.current =
      event.target === event.currentTarget;
  };
  const handleLightboxBackdropPointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const shouldClose =
      lightboxBackdropPointerDownRef.current &&
      event.target === event.currentTarget;
    lightboxBackdropPointerDownRef.current = false;
    if (shouldClose) {
      setLightboxOpen(false);
    }
  };
  const resetLightboxBackdropPointer = () => {
    lightboxBackdropPointerDownRef.current = false;
  };

  return (
    <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 4 }}>
      {isLoading && (
        <div style={{
          width: 180,
          height: 120,
          borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
          animation: "pulse 1.5s ease-in-out infinite",
        }} />
      )}
      {isError && (
        <div style={{
          padding: "8px 12px",
          borderRadius: 12,
          background: "rgba(255,80,80,0.12)",
          color: "#ff6b6b",
          fontSize: 13,
        }}>
          Image indisponible
        </div>
      )}
      {signedUrl && (
        <>
          <img
            src={signedUrl}
            alt="Image"
            onClick={() => setLightboxOpen(true)}
            style={{
              maxWidth: 240,
              maxHeight: 320,
              borderRadius: 12,
              cursor: "zoom-in",
              display: "block",
              objectFit: "cover",
            }}
          />
          {lightboxOpen && (
            <div
              onPointerDown={handleLightboxBackdropPointerDown}
              onPointerUp={handleLightboxBackdropPointerUp}
              onPointerCancel={resetLightboxBackdropPointer}
              onPointerLeave={resetLightboxBackdropPointer}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "zoom-out",
              }}
            >
              <img
                src={signedUrl}
                alt="Image plein écran"
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  borderRadius: 8,
                  objectFit: "contain",
                  cursor: "default",
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ConversationMessageItem: FunctionComponent<{
  message: Message;
  contactName?: string;
  isLastOutbound?: boolean;
  inlineReactions?: string[];
}> = ({ message, contactName, isLastOutbound, inlineReactions }) => {
  const isMine = message.direction === "outbound";
  const isImageMessage = message.messageType === "image" && message.mediaPath;
  const isAudioMessage = !isImageMessage && (message.messageType === "audio" || message.attachment?.type === "audio");
  if (isImageMessage) {
    return (
      <ImageMessageBubble
        messageId={message.id}
        mediaPath={message.mediaPath!}
        isMine={isMine}
      />
    );
  }
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
  return (
    <ChatBubble
      message={message}
      contactName={contactName}
      isLastOutbound={isLastOutbound}
      inlineReactions={inlineReactions}
    />
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const Conversations: FunctionComponent = () => {
  // ── Config selector state
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [isConfigMenuOpen, setConfigMenuOpen] = useState(false);
  const configMenuRef = useRef<HTMLDivElement | null>(null);

  // ── Conversation filter state
  const [channelFilter, setChannelFilter] = useState<ChannelFilterOption>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Conversation interaction state
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const userSelectedRef = useRef(false);
  const [composerText, setComposerText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const urlConversationIdRef = useRef<string | null>(null);

  // ── Overlay / modal state
  const [isStopDialogOpen, setStopDialogOpen] = useState(false);
  const [isDetailsOverlayOpen, setDetailsOverlayOpen] = useState(false);
  const [isContactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [isErrorDetailOpen, setErrorDetailOpen] = useState(false);

  // ── Planifier une relance
  type ApprovedTemplate = { id: string; name: string };
  const [isFollowupModalOpen, setFollowupModalOpen] = useState(false);
  const [followupTemplates, setFollowupTemplates] = useState<ApprovedTemplate[]>([]);
  const [followupTemplateId, setFollowupTemplateId] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [followupMessage, setFollowupMessage] = useState("");
  const [useSequence, setUseSequence] = useState(false);
  const [sequenceMessages, setSequenceMessages] = useState<[string, string, string]>(["", "", ""]);
  const [sequenceTemplateIds, setSequenceTemplateIds] = useState<[string, string, string]>(["", "", ""]);
  const [isScheduling, setIsScheduling] = useState(false);
  type ExistingFollowup = { id: number; scheduled_at: string; message_body: string | null; template_id: string | null };
  const [existingFollowups, setExistingFollowups] = useState<ExistingFollowup[]>([]);

  // ── Marquer comme clôsée
  const [isClosingModalOpen, setClosingModalOpen] = useState(false);
  const [closingAmount, setClosingAmount] = useState<string>("");
  const [closingIsWon, setClosingIsWon] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [convHasBooking, setConvHasBooking] = useState(false);
  const [convBookingData, setConvBookingData] = useState<{ id: string; created_at: string } | null>(null);

  // Auto-relances override state
  const [convAgentAutoRelancesEnabled, setConvAgentAutoRelancesEnabled] = useState(false);
  const [relancesDisabled, setRelancesDisabled] = useState(false);
  const [relanceMessageOverride, setRelanceMessageOverride] = useState("");
  const [relancesOverrideSaving, setRelancesOverrideSaving] = useState(false);

  // Voice modal state
  const [isVoiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceModalText, setVoiceModalText] = useState("");
  const [voiceModalHasVoice, setVoiceModalHasVoice] = useState(false);
  const [voiceModalPreviewing, setVoiceModalPreviewing] = useState(false);
  const [voiceModalSending, setVoiceModalSending] = useState(false);
  const [voiceModalError, setVoiceModalError] = useState<string | null>(null);
  const voiceModalAudioRef = useRef<HTMLAudioElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const detailsOverlayBackdropPointerDownRef = useRef(false);
  const contactDrawerBackdropPointerDownRef = useRef(false);
  const errorDetailBackdropPointerDownRef = useRef(false);
  const voiceModalBackdropPointerDownRef = useRef(false);
  const closingModalBackdropPointerDownRef = useRef(false);
  const followupModalBackdropPointerDownRef = useRef(false);

  const setBackdropPointerDownState = (
    ref: { current: boolean },
    event: PointerEvent<HTMLDivElement>,
  ) => {
    ref.current = event.target === event.currentTarget;
  };
  const shouldCloseBackdropOnPointerUp = (
    ref: { current: boolean },
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const shouldClose = ref.current && event.target === event.currentTarget;
    ref.current = false;
    return shouldClose;
  };
  const resetBackdropPointerState = (ref: { current: boolean }) => {
    ref.current = false;
  };


  // ── Hooks
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
    () =>
      displayedAgents.find(
        (agent) => (agent.display_id ?? agent.agent_id) === selectedConfigId,
      ),
    [displayedAgents, selectedConfigId],
  );

  const activeConfigOption = agentConfigOptions.find(
    (option) => option.value === selectedConfigId,
  );

  const {
    data: rawConversationsSingle = [],
    isLoading: conversationsLoadingSingle,
    isError: conversationsErrorSingle,
    error: conversationsErrorDetailsSingle,
  } = useClaraConversations(
    !isAllMode ? selectedConfigId ?? undefined : undefined,
  );

  const {
    data: rawConversationsAll = [],
    isLoading: conversationsLoadingAll,
  } = useAllConversations(isAllMode ? allConfigIds : []);

  const {
    data: lazyMessageData = [],
    isLoading: lazyMessagesLoading,
  } = useConversationMessages(
    isAllMode ? selectedConversationId ?? undefined : undefined,
  );

  const rawConversations = isAllMode ? rawConversationsAll : rawConversationsSingle;
  const conversationsLoading = isAllMode
    ? conversationsLoadingAll
    : conversationsLoadingSingle;
  const conversationsError = isAllMode ? false : conversationsErrorSingle;
  const conversationsErrorDetails = isAllMode
    ? null
    : conversationsErrorDetailsSingle;

  const conversationData = useMemo(
    () => rawConversations.map(mapConversationRecord),
    [rawConversations],
  );

  const missingNameContactIds = useMemo(
    () =>
      Array.from(
        new Set(
          conversationData
            .filter(
              (conv) =>
                isGenericContactName(conv.contactName) && Boolean(conv.contactId),
            )
            .map((conv) => String(conv.contactId)),
        ),
      ),
    [conversationData],
  );

  const { data: contactNameRows = [] } = useQuery({
    queryKey: ["conversation-contact-names", [...missingNameContactIds].sort().join(",")],
    enabled: missingNameContactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, instagram_handle, phone_e164")
        .in("id", missingNameContactIds);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30000,
  });

  const contactNameMap = useMemo(() => {
    const map = new Map<
      string,
      { full_name?: string | null; instagram_handle?: string | null; phone_e164?: string | null }
    >();
    for (const row of contactNameRows as Array<{
      id: string | number;
      full_name?: string | null;
      instagram_handle?: string | null;
      phone_e164?: string | null;
    }>) {
      map.set(String(row.id), row);
    }
    return map;
  }, [contactNameRows]);

  const hydratedConversationData = useMemo(
    () =>
      conversationData.map((conv) => {
        if (!isGenericContactName(conv.contactName) || !conv.contactId) return conv;
        const linkedContact = contactNameMap.get(String(conv.contactId));
        if (!linkedContact) return conv;
        const fullName = normalizeTextValue(linkedContact.full_name);
        const handle = normalizeTextValue(linkedContact.instagram_handle).replace(/^@+/, "");
        const phone = normalizeTextValue(linkedContact.phone_e164);
        const nextName = fullName || handle || phone;
        if (!nextName) return conv;
        return {
          ...conv,
          contactName: nextName,
          contactHandle:
            handle && fullName && handle.toLowerCase() !== fullName.toLowerCase()
              ? handle
              : conv.contactHandle,
        };
      }),
    [conversationData, contactNameMap],
  );

  const agentLabelMap = useMemo(
    () => new Map(agentConfigOptions.map((o) => [o.value, o.label])),
    [agentConfigOptions],
  );

  const lazyMessages = useMemo(
    () =>
      isAllMode && selectedConversationId
        ? lazyMessageData
            .map((msg: any) =>
              mapMessageRecord(selectedConversationId, msg),
            )
            .sort(
              (a: Message, b: Message) =>
                new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
            )
        : [],
    [isAllMode, selectedConversationId, lazyMessageData],
  );

  const conversationsQueryKey = useMemo(
    () =>
      isAllMode
        ? ["all-conversations", [...allConfigIds].sort().join(",")]
        : ["clara-conversations", selectedConfigId],
    [isAllMode, allConfigIds, selectedConfigId],
  );

  // ── Derived conversation data
  const repliedConversations = useMemo(
    () =>
      hydratedConversationData.filter((conv) => {
        if (conv.inboundCount > 0) return true;
        return conv.messages.some((message) => message.direction === "inbound");
      }),
    [hydratedConversationData],
  );

  const channelScopedConversations = useMemo(
    () =>
      repliedConversations.filter(
        (conv) => channelFilter === "All" || conv.channel === channelFilter,
      ),
    [repliedConversations, channelFilter],
  );

  const filteredConversations = useMemo(
    () =>
      channelScopedConversations.filter((conv) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "unread") return conv.unreadCount > 0;
        if (statusFilter === "hot")
          return conv.tags[0]?.toLowerCase() === "hot";
        if (statusFilter === "error") return conv.automationState === "error";
        if (statusFilter === "scheduled")
          return conv.automationState === "scheduled";
        if (statusFilter === "closed")
          return (
            conv.status === "Clos" ||
            conv.automationState === "stopped" ||
            conv.automationState === "condition_stop"
          );
        return true;
      }),
    [channelScopedConversations, statusFilter],
  );

  const sortedConversations = useMemo(() => {
    return [...filteredConversations].sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
    );
  }, [filteredConversations]);

  const searchedConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedConversations;
    return sortedConversations.filter(
      (conv) =>
        conv.contactName.toLowerCase().includes(q) ||
        conv.contactHandle.toLowerCase().includes(q),
    );
  }, [sortedConversations, searchQuery]);

  const visibleConversationCount = searchedConversations.length;
  const isSearchActive = searchQuery.trim().length > 0;
  const selectedScopeLabel = isAllMode
    ? "Tous les agents"
    : activeConfigOption?.label ?? "Agent";

  const activeConversation =
    sortedConversations.find((conv) => conv.id === selectedConversationId) ??
    sortedConversations[0] ??
    null;

  const openFollowupModal = useCallback(async () => {
    const isWhatsApp = activeConversation?.channel === "WhatsApp";
    if (isWhatsApp) {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("id, name")
        .eq("status", "approved")
        .order("name");
      setFollowupTemplates((data ?? []) as ApprovedTemplate[]);
    } else {
      setFollowupTemplates([]);
    }
    setFollowupTemplateId("");
    setFollowupDate("");
    setFollowupMessage("");
    setUseSequence(false);
    setSequenceMessages(["", "", ""]);
    setSequenceTemplateIds(["", "", ""]);
    setExistingFollowups([]);
    if (activeConversation?.id) {
      const { data } = await supabase
        .from("human_followups")
        .select("id, scheduled_at, message_body, template_id")
        .eq("conversation_id", Number(activeConversation.id))
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true });
      setExistingFollowups((data ?? []) as ExistingFollowup[]);
    }
    setFollowupModalOpen(true);
  }, [activeConversation?.channel]);

  const handleScheduleFollowup = useCallback(async () => {
    if (!activeConversation) return;
    const platform = activeConversation.channel.toLowerCase();
    const isWhatsApp = platform === "whatsapp";
    if (!useSequence && !followupDate) return;
    if (isWhatsApp && !followupTemplateId) return;
    if (!isWhatsApp && !followupMessage.trim()) return;
    setIsScheduling(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsScheduling(false); return; }
    const baseRow = {
      user_id: user.id,
      conversation_id: Number(activeConversation.id),
      contact_id: null,
      platform,
      status: "pending",
      message_body: isWhatsApp ? null : followupMessage.trim(),
      template_id: isWhatsApp ? followupTemplateId : null,
    };
    if (useSequence) {
      const now = Date.now();
      const offsets = [1, 3, 7];
      const rows = offsets
        .map((days, i) => {
          const msg = isWhatsApp ? null : sequenceMessages[i].trim();
          const tpl = isWhatsApp ? sequenceTemplateIds[i] : null;
          if (!msg && !tpl) return null;
          return {
            ...baseRow,
            message_body: msg || null,
            template_id: tpl || null,
            scheduled_at: new Date(now + days * 86400000).toISOString(),
          };
        })
        .filter(Boolean);
      if (rows.length > 0) await supabase.from("human_followups").insert(rows);
    } else {
      await supabase.from("human_followups").insert({
        ...baseRow,
        scheduled_at: new Date(followupDate).toISOString(),
      });
    }
    setIsScheduling(false);
    setFollowupModalOpen(false);
  }, [activeConversation, useSequence, followupDate, followupTemplateId, followupMessage]);

  const handleCancelFollowup = useCallback(async (id: number) => {
    await supabase.from("human_followups").delete().eq("id", id);
    setExistingFollowups((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const isFollowupSubmitDisabled = (() => {
    if (isScheduling) return true;
    const isWhatsApp = activeConversation?.channel === "WhatsApp";
    if (useSequence) {
      return isWhatsApp
        ? sequenceTemplateIds.every((t) => !t)
        : sequenceMessages.every((m) => !m.trim());
    }
    if (!followupDate) return true;
    return isWhatsApp ? !followupTemplateId : !followupMessage.trim();
  })();

  // Check if active conversation has a calendly booking
  useEffect(() => {
    if (!activeConversation?.id) { setConvHasBooking(false); setConvBookingData(null); return; }
    supabase
      .from("calendly_bookings")
      .select("id, created_at")
      .eq("conversation_id", Number(activeConversation.id))
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        setConvHasBooking(!!data);
        setConvBookingData(data ?? null);
      });
  }, [activeConversation?.id]);

  // Load auto-relances override from conversation metadata + agent config
  useEffect(() => {
    if (!activeConversation?.id) {
      setConvAgentAutoRelancesEnabled(false);
      setRelancesDisabled(false);
      setRelanceMessageOverride("");
      return;
    }
    // Load from conversation metadata
    const meta = (activeConversation.metadata ?? {}) as Record<string, unknown>;
    setRelancesDisabled(meta.relances_disabled === true);
    setRelanceMessageOverride(typeof meta.relance_message_override === "string" ? meta.relance_message_override : "");
    // Load from agent config
    if (!activeConversation.agentConfigId) { setConvAgentAutoRelancesEnabled(false); return; }
    supabase
      .from("agent_configs")
      .select("configs")
      .eq("configs_id", activeConversation.agentConfigId)
      .single()
      .then(({ data }) => {
        const rel = ((data?.configs as Record<string, unknown>)?.Relances ?? {}) as Record<string, unknown>;
        setConvAgentAutoRelancesEnabled(Boolean(rel.auto_enabled));
      });
  }, [activeConversation?.id, activeConversation?.agentConfigId, activeConversation?.metadata]);

  const handleSaveRelancesOverride = useCallback(async () => {
    if (!activeConversation?.id) return;
    setRelancesOverrideSaving(true);
    const currentMeta = (activeConversation.metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = {
      ...currentMeta,
      relances_disabled: relancesDisabled,
    };
    if (relanceMessageOverride.trim()) {
      nextMeta.relance_message_override = relanceMessageOverride.trim();
    } else {
      delete nextMeta.relance_message_override;
    }
    await supabase
      .from("conversations")
      .update({ metadata: nextMeta })
      .eq("id", activeConversation.id);
    setRelancesOverrideSaving(false);
  }, [activeConversation?.id, activeConversation?.metadata, relancesDisabled, relanceMessageOverride]);

  const openClosingModal = useCallback(async () => {
    setClosingIsWon(true);
    if (!activeConversation?.agentConfigId) {
      setClosingAmount("");
      setClosingModalOpen(true);
      return;
    }
    const { data } = await supabase
      .from("agent_configs")
      .select("configs")
      .eq("configs_id", activeConversation.agentConfigId)
      .single();
    const avg = (data?.configs as Record<string, any>)?.avg_deal_value;
    setClosingAmount(avg != null ? String(avg) : "");
    setClosingModalOpen(true);
  }, [activeConversation?.agentConfigId]);

  const handleConfirmClosing = useCallback(async () => {
    if (!activeConversation) return;
    setIsClosing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsClosing(false); return; }
    await supabase.from("deal_closings").insert({
      conversation_id: Number(activeConversation.id),
      user_id: user.id,
      agent_config_id: activeConversation.agentConfigId ?? null,
      amount: parseFloat(closingAmount) || 0,
      is_closed: closingIsWon,
      closed_at: new Date().toISOString(),
    });
    setIsClosing(false);
    setClosingModalOpen(false);
  }, [activeConversation, closingAmount, closingIsWon]);

  const openVoiceModal = useCallback(async () => {
    if (!activeConversation) return;
    setVoiceModalError(null);
    // Pré-remplir avec le dernier message sortant
    const msgs = isAllMode ? lazyMessages : activeConversation.messages;
    const lastOut = [...msgs].reverse().find((m) => m.direction === "outbound");
    setVoiceModalText(lastOut?.text ?? "");
    // Vérifier si une voix est configurée
    let hasVoice = false;
    if (activeConversation.agentConfigId) {
      const { data } = await supabase
        .from("agent_configs")
        .select("configs")
        .eq("configs_id", activeConversation.agentConfigId)
        .single();
      hasVoice = Boolean((data?.configs as Record<string, any>)?.Voice?.elevenlabs_voice_id);
    }
    setVoiceModalHasVoice(hasVoice);
    setVoiceModalOpen(true);
  }, [activeConversation, isAllMode, lazyMessages]);
  const closeVoiceModal = useCallback(() => {
    setVoiceModalOpen(false);
    voiceModalAudioRef.current?.pause();
  }, []);

  const handleVoicePreview = useCallback(async () => {
    if (!voiceModalText.trim() || !activeConversation) return;
    setVoiceModalPreviewing(true);
    setVoiceModalError(null);
    voiceModalAudioRef.current?.pause();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setVoiceModalPreviewing(false); return; }
    try {
      const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/generate-voice-message", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: voiceModalText, conversation_id: Number(activeConversation.id), preview_only: true }),
      });
      if (!res.ok) { setVoiceModalError("Aperçu impossible. Vérifiez la configuration de votre agent."); setVoiceModalPreviewing(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      voiceModalAudioRef.current = audio;
      audio.play().catch(console.error);
      audio.onended = () => setVoiceModalPreviewing(false);
    } catch {
      setVoiceModalError("Erreur lors de la génération du vocal.");
      setVoiceModalPreviewing(false);
    }
  }, [activeConversation, voiceModalText]);

  const handleVoiceSend = useCallback(async () => {
    if (!voiceModalText.trim() || !activeConversation) return;
    setVoiceModalSending(true);
    setVoiceModalError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setVoiceModalSending(false); return; }
    try {
      const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/generate-voice-message", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: voiceModalText, conversation_id: Number(activeConversation.id) }),
      });
      if (res.status === 402) {
        setVoiceModalError("Crédits insuffisants. Rechargez votre compte dans Mes paiements.");
        setVoiceModalSending(false);
        return;
      }
      if (!res.ok) {
        setVoiceModalError("Erreur lors de l'envoi du vocal.");
        setVoiceModalSending(false);
        return;
      }
      closeVoiceModal();
      setVoiceModalText("");
    } catch {
      setVoiceModalError("Erreur réseau lors de l'envoi.");
    }
    setVoiceModalSending(false);
  }, [activeConversation, closeVoiceModal, voiceModalText]);

  const isWindowExpired = useMemo(() => {
    if (!activeConversation) return false;
    const messages = isAllMode ? lazyMessages : activeConversation.messages;
    if (isAllMode && lazyMessagesLoading) return false;
    const lastInbound = [...messages]
      .reverse()
      .find((m) => m.direction === "inbound");
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
  const showCloseButton = Boolean(
    activeConversation && (isConditionStop || convHasBooking)
  );

  const messagesForDisplay = useMemo(() => {
    if (!activeConversation) return [];
    const messages = (isAllMode ? lazyMessages : activeConversation.messages).filter(
      (message) =>
        !(
          message.isReactionEvent &&
          (message.reactionTargetExternalMessageId || message.reactionTargetMessageId)
        ),
    );
    const result: Array<
      Message | { type: "date-separator"; date: string; id: string }
    > = [];
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const currentDay = new Date(current.sentAt).toDateString();
      if (i === 0) {
        result.push({ type: "date-separator", date: current.sentAt, id: `date-${currentDay}` });
      } else {
        const prevDay = new Date(messages[i - 1].sentAt).toDateString();
        if (currentDay !== prevDay) {
          result.push({ type: "date-separator", date: current.sentAt, id: `date-${currentDay}` });
        }
      }
      result.push(current);
    }
    return result;
  }, [isAllMode, lazyMessages, activeConversation]);

  const inlineReactionsByExternalMessageId = useMemo(() => {
    if (!activeConversation) return new Map<string, string[]>();
    const messages = isAllMode ? lazyMessages : activeConversation.messages;
    const map = new Map<string, string[]>();

    const addReaction = (key: string | null | undefined, emoji: string) => {
      if (!key) return;
      const current = map.get(key) ?? [];
      if (!current.includes(emoji)) {
        current.push(emoji);
      }
      map.set(key, current);
    };

    for (const message of messages) {
      if (!message.isReactionEvent) continue;
      if (!message.reactionEmoji) continue;
      addReaction(
        message.reactionTargetExternalMessageId
          ? `external:${message.reactionTargetExternalMessageId}`
          : null,
        message.reactionEmoji,
      );
      addReaction(
        message.reactionTargetMessageId
          ? `record:${message.reactionTargetMessageId}`
          : null,
        message.reactionEmoji,
      );
    }
    return map;
  }, [activeConversation, isAllMode, lazyMessages]);

  const previousConversationRef = useRef<{
    id: string | null;
    messagesLength: number;
  }>({ id: null, messagesLength: 0 });

  // ── Effects

  // Read URL params on mount (?conversation_id, ?prefill from Relances page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get("conversation_id");
    const prefill = params.get("prefill");
    if (convId) {
      urlConversationIdRef.current = convId;
      userSelectedRef.current = true;
      setSelectedConversationId(convId);
    }
    if (prefill) {
      setComposerText(prefill);
    }
    if (convId || prefill) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (agentConfigOptions.length === 0) {
      if (selectedConfigId !== null) setSelectedConfigId(null);
      setConfigMenuOpen(false);
      return;
    }
    if (
      !selectedConfigId ||
      (selectedConfigId !== "all" &&
        !agentConfigOptions.some((o) => o.value === selectedConfigId))
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

  useEffect(() => {
    if (conversationsLoading) return;
    if (conversationData.length === 0) {
      setSelectedConversationId(null);
      return;
    }
    // If an ID came from URL params and exists in the loaded data, keep it
    if (urlConversationIdRef.current && conversationData.some((conv) => conv.id === urlConversationIdRef.current)) {
      urlConversationIdRef.current = null;
      return;
    }
    urlConversationIdRef.current = null;
    if (
      !selectedConversationId ||
      !conversationData.some((conv) => conv.id === selectedConversationId)
    ) {
      setSelectedConversationId(conversationData[0].id);
    }
  }, [conversationData, conversationsLoading, selectedConversationId]);

  useEffect(() => {
    if (
      selectedConversationId &&
      !sortedConversations.some((conv) => conv.id === selectedConversationId)
    ) {
      setSelectedConversationId(sortedConversations[0]?.id ?? null);
    }
  }, [sortedConversations, selectedConversationId]);

  useEffect(() => {
    if (!activeConversation) return;
    const previous = previousConversationRef.current;
    const currentId = activeConversation.id;
    const currentLength = activeConversation.messages.length;
    if (
      previous.id === currentId &&
      previous.messagesLength !== currentLength
    ) {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }
    previousConversationRef.current = { id: currentId, messagesLength: currentLength };
  }, [activeConversation]);

  useEffect(() => {
    if (messagesForDisplay.length > 0 && messagesContainerRef.current) {
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      }, 100);
    }
  }, [selectedConversationId, messagesForDisplay.length]);

  useEffect(() => {
    setErrorDetailOpen(false);
  }, [activeConversation?.id, activeConversation?.lastErrorMessage]);

  useEffect(() => {
    setContactDrawerOpen(false);
  }, [activeConversation?.id]);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userSelectedRef.current) return;
    userSelectedRef.current = false;
    if (!activeConversation || activeConversation.unreadCount === 0 || !selectedConfigId)
      return;
    const convId = Number(activeConversation.id);
    queryClient.setQueryData(conversationsQueryKey, (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((record: any) =>
        record.id === convId ? { ...record, unread_count: 0 } : record,
      );
    });
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", convId)
      .then();
  }, [activeConversation?.id]);

  // ── Handlers
  const handleConfigChange = (value: string) => {
    setSelectedConfigId(value);
    setConfigMenuOpen(false);
  };

  const handleSendMessage = async () => {
    if (
      !composerText.trim() ||
      !activeConversation ||
      !selectedConfigId ||
      isWindowExpired
    )
      return;

    const messageText = composerText.trim();
    const tempId = `temp-${Date.now()}`;
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

    if (!isAllMode) {
      queryClient.setQueryData(conversationsQueryKey, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((conv: any) =>
          conv.id === activeConversation.id
            ? { ...conv, messages: [...conv.messages, optimisticMessage] }
            : conv,
        );
      });
    }
    setComposerText("");
    if (composerTextareaRef.current) {
      composerTextareaRef.current.style.height = "40px";
    }

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) throw new Error("Session error");
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Access token missing");

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
        },
      );
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new Error("API error");
    } catch (error) {
      console.error("Erreur lors de l'envoi du message", error);
      if (!isAllMode) {
        queryClient.setQueryData(conversationsQueryKey, (oldData: any) => {
          if (!Array.isArray(oldData)) return oldData;
          return oldData.map((conv: any) =>
            conv.id === activeConversation.id
              ? {
                  ...conv,
                  messages: conv.messages.filter(
                    (msg: any) => msg.id !== optimisticMessage.id,
                  ),
                }
              : conv,
          );
        });
      }
      setComposerText(messageText);
    }
  };

  const updateConversation = async (updates: Record<string, unknown>) => {
    if (!activeConversation) return;
    const { error } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", Number(activeConversation.id));
    if (error) console.error("Impossible de mettre à jour la conversation", error);
  };

  const closeDetailsOverlay = () => setDetailsOverlayOpen(false);
  const handleContactDrawerToggle = () =>
    setContactDrawerOpen((prev) => !prev);
  const closeContactDrawer = () => setContactDrawerOpen(false);
  const handleErrorDetailOpen = () => setErrorDetailOpen(true);
  const closeErrorDetail = () => setErrorDetailOpen(false);
  const handleStopClick = () => setStopDialogOpen(true);
  const closeStopDialog = () => setStopDialogOpen(false);

  const confirmStopDialog = async () => {
    setStopDialogOpen(false);
    if (isConversationStopped) {
      const wasError = activeConversation?.automationState === "error";
      if (wasError) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData?.session?.access_token)
            throw new Error("Session invalide");
          const response = await fetch(
            "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/get-supabase/message-error-scheduled",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${sessionData.session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ conversation_id: activeConversation?.id }),
            },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (error) {
          console.error("Erreur lors de la reprise de conversation:", error);
          await updateConversation({ automation_state: "idle" });
        }
      } else {
        await updateConversation({ automation_state: "idle" });
      }
    } else {
      await updateConversation({ automation_state: "stopped" });
    }
  };

  // ── Computed values for UI
  const stopDialogMessage = isConversationStopped
    ? activeConversation?.automationState === "error"
      ? "Voulez-vous reprendre la conversation ? L'agent répondra à tous les messages reçus depuis l'erreur."
      : "Voulez-vous reprendre la conversation ?"
    : "Voulez-vous vraiment arrêter l'envoi sur cette conversation ? L'agent ne répondra désormais plus à cette conversation.";
  const stopDialogConfirmLabel = isConversationStopped ? "Reprendre" : "Arrêter";
  const chatErrorMessage = activeConversation?.lastErrorMessage ?? "";
  const isChatErrorTooLong = chatErrorMessage.length > 100;
  const chatErrorPreview = isChatErrorTooLong
    ? `${chatErrorMessage.slice(0, 100)}...`
    : chatErrorMessage;

  // ── Render
  return (
    <AppLayout mainClassName={styles.conversationsMainFixed}>
      <div className={styles.claraDashboardArea}>
        <div className={styles.claraDashboard}>
          <div className={styles.claraDashboardContent}>

            {/* ── Header */}
            <header className={styles.conversationsPageHeader}>
              <div className={styles.conversationsPageTitleBlock}>
                <h1 className={styles.conversationsPageTitle}>
                  Conversations{" "}
                  {isAllMode
                    ? "· Tous les agents"
                    : `· ${activeConfigOption?.label ?? "Clara"}`}
                </h1>
                <p className={styles.conversationsPageSubtitle}>
                  Suivi quotidien de la boite de reception pour {selectedScopeLabel}.
                </p>
              </div>
              <div className={styles.conversationsPageControls}>
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
                              selectedAgent?.is_active === false
                                ? styles.configDotInactive
                                : ""
                            }`}
                            title={
                              selectedAgent?.is_active === false
                                ? "Inactif"
                                : "Actif"
                            }
                          />
                        )}
                        {isAllMode
                          ? "TOUS LES AGENTS"
                          : (
                              activeConfigOption?.label ?? "Selectionner un agent"
                            ).toUpperCase()}
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
                <ChannelFilterGroup
                  active={channelFilter}
                  onChange={setChannelFilter}
                  className={styles.channelFilterRowTight}
                />
              </div>
            </header>


            {/* ── Conversations layout */}
            <section className={styles.claraDetailsLayout}>
              <div className={styles.conversationPanel}>
                <div className={styles.conversationPanelHeader}>
                  <div className={styles.conversationPanelTitleBlock}>
                    <h3 className={styles.conversationPanelTitle}>Boite de reception</h3>
                    <p className={styles.conversationPanelSubtitle}>
                      Filtre et traite rapidement chaque conversation.
                    </p>
                  </div>
                  <span className={styles.conversationPanelMetaInline}>
                    {visibleConversationCount.toLocaleString("fr-FR")} conversations affichees
                  </span>
                </div>
                <div className={styles.conversationPanelTools}>
                  <div className={styles.conversationSearchWrap}>
                    <input
                      type="text"
                      className={styles.conversationSearch}
                      placeholder="Rechercher un nom ou handle"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.conversationFilterHeader}>
                  <span className={styles.conversationFilterHeaderLabel}>
                    Statut conversation
                  </span>
                </div>
                <div className={styles.conversationFilters}>
                  {statusFilterOptions.map((statusOption) => (
                    <button
                      key={statusOption}
                      type="button"
                      className={`${styles.statusChip} ${
                        statusFilter === statusOption ? styles.statusChipActive : ""
                      }`}
                      onClick={() => setStatusFilter(statusOption)}
                    >
                      {statusFilterLabels[statusOption]}
                    </button>
                  ))}
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
                ) : searchedConversations.length === 0 ? (
                  <div className={styles.conversationNoResults}>
                    {isSearchActive
                      ? "Aucun resultat pour cette recherche."
                      : "Aucune conversation ne correspond a ces filtres."}
                  </div>
                ) : (
                  <div className={styles.conversationList}>
                    {searchedConversations.map((conversation) => (
                      <ConversationItem
                        key={conversation.id}
                        conversation={conversation}
                        isActive={conversation.id === activeConversation?.id}
                        onSelect={() => {
                          userSelectedRef.current = true;
                          setSelectedConversationId(conversation.id);
                        }}
                        agentLabel={
                          isAllMode
                            ? agentLabelMap.get(conversation.agentConfigId ?? "")
                            : undefined
                        }
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
                          <h3 className={styles.chatContactTitle}>
                            {activeConversation.contactName}
                            {activeConversation.contactHandle && (() => {
                              const handle = activeConversation.contactHandle;
                              const channel = activeConversation.channel;
                              const href =
                                channel === "Instagram"
                                  ? `https://instagram.com/${handle}`
                                  : channel === "WhatsApp"
                                  ? `https://wa.me/${handle.replace(/\D/g, "")}`
                                  : null;
                              return href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.chatContactHandle}
                                >
                                  @{handle}
                                </a>
                              ) : (
                                <span className={styles.chatContactHandle}>
                                  @{handle}
                                </span>
                              );
                            })()}
                          </h3>
                          <ChannelBadge channel={activeConversation.channel} />
                          <span className={styles.chatMetaPill}>
                            Statut: {getConversationStatusLabel(activeConversation)}
                          </span>
                          <span className={styles.chatMetaPill}>
                            Derniere activite {formatRelativeTime(activeConversation.lastAt)}
                          </span>
                          {activeConversation.automationState === "scheduled" && (
                            <span className={styles.chatScheduledLabel}>
                              {activeConversation.nextReplyAt
                                ? (() => {
                                    const formatted = formatNextReply(
                                      activeConversation.nextReplyAt,
                                    );
                                    return formatted
                                      ? `Réponse prévue à ${formatted.time} (${formatted.relative})`
                                      : "Réponse planifiée";
                                  })()
                                : "Réponse planifiée"}
                            </span>
                          )}
                          {activeConversation.automationState === "stopped" && (
                            <span className={styles.chatStoppedLabel}>
                              Conversation arrêtée – l'agent ne répondra plus
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
                          {activeConversation.automationState ===
                            "condition_stop" && (
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
                          {showCloseButton && (
                            <button
                              type="button"
                              className={`${styles.chatToolButton} ${styles.closeWonButton}`}
                              data-tooltip="Marquer comme clôturée"
                              onClick={openClosingModal}
                            >
                              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.chatToolButton}
                            data-tooltip="Planifier une relance"
                            onClick={openFollowupModal}
                          >
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect x="2" y="3.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M6 2v3M12 2v3M2 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M9 11v2.5M7.5 13H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`${styles.chatToolButton} ${
                              isContactDrawerOpen ? styles.chatToolButtonActive : ""
                            }`.trim()}
                            data-tooltip="Infos contact"
                            onClick={handleContactDrawerToggle}
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 18 18"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle
                                cx="9"
                                cy="6.5"
                                r="3"
                                stroke="currentColor"
                                strokeWidth="1.5"
                              />
                              <path
                                d="M2.5 16c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
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
                        </div>
                      </div>
                    </div>

                    {isDetailsOverlayOpen && (
                      <div
                        className={styles.detailsOverlayBackdrop}
                        role="presentation"
                        onPointerDown={(event) =>
                          setBackdropPointerDownState(
                            detailsOverlayBackdropPointerDownRef,
                            event,
                          )
                        }
                        onPointerUp={(event) => {
                          if (
                            shouldCloseBackdropOnPointerUp(
                              detailsOverlayBackdropPointerDownRef,
                              event,
                            )
                          ) {
                            closeDetailsOverlay();
                          }
                        }}
                        onPointerCancel={() =>
                          resetBackdropPointerState(
                            detailsOverlayBackdropPointerDownRef,
                          )
                        }
                        onPointerLeave={() =>
                          resetBackdropPointerState(
                            detailsOverlayBackdropPointerDownRef,
                          )
                        }
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
                            Ajoute des informations contextualisées pour cette
                            conversation afin d'aider l'agent à répondre.
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
                            <button
                              type="button"
                              className={styles.detailsOverlayPrimary}
                            >
                              Enregistrer
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {isContactDrawerOpen && (
                      <>
                        <div
                          className={styles.contactDrawerBackdrop}
                          onPointerDown={(event) =>
                            setBackdropPointerDownState(
                              contactDrawerBackdropPointerDownRef,
                              event,
                            )
                          }
                          onPointerUp={(event) => {
                            if (
                              shouldCloseBackdropOnPointerUp(
                                contactDrawerBackdropPointerDownRef,
                                event,
                              )
                            ) {
                              closeContactDrawer();
                            }
                          }}
                          onPointerCancel={() =>
                            resetBackdropPointerState(
                              contactDrawerBackdropPointerDownRef,
                            )
                          }
                          onPointerLeave={() =>
                            resetBackdropPointerState(
                              contactDrawerBackdropPointerDownRef,
                            )
                          }
                        />
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
                                <span className={styles.contactDrawerName}>
                                  {activeConversation.contactName}
                                </span>
                                {activeConversation.contactHandle && (
                                  <span className={styles.contactDrawerHandle}>
                                    @{activeConversation.contactHandle}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className={styles.contactDrawerHeadActions}>
                              <span className={styles.contactDrawerPlatformBadge}>
                                {activeConversation.channel}
                              </span>
                              <button
                                type="button"
                                className={styles.contactDrawerClose}
                                onClick={closeContactDrawer}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="currentColor"
                                >
                                  <path d="M7 5.586L11.293 1.293a1 1 0 1 1 1.414 1.414L8.414 7l4.293 4.293a1 1 0 1 1-1.414 1.414L7 8.414l-4.293 4.293a1 1 0 1 1-1.414-1.414L5.586 7 1.293 2.707a1 1 0 0 1 1.414-1.414L7 5.586z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className={styles.contactDrawerSection}>
                            <span className={styles.contactDrawerSectionTitle}>
                              Qualification
                            </span>
                            {activeConversation.tags[0] && getHeatTagLabel(activeConversation.tags[0]) ? (
                              <>
                                <span
                                  className={`${styles.contactDrawerHeatBadge} ${
                                    styles[
                                      `contactDrawerHeat_${activeConversation.tags[0]}`
                                    ] ?? ""
                                  }`}
                                >
                                  {getHeatTagLabel(activeConversation.tags[0])}
                                </span>
                                {activeConversation.heatReason && (
                                  <p className={styles.contactDrawerHeatReason}>
                                    {activeConversation.heatReason}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className={styles.contactDrawerEmptyText}>Non définie</p>
                            )}
                          </div>
                          <div className={styles.contactDrawerSection}>
                            <span className={styles.contactDrawerSectionTitle}>
                              Résumé IA
                            </span>
                            {activeConversation.summary ? (
                              <p className={styles.contactDrawerSummaryText}>
                                {activeConversation.summary}
                              </p>
                            ) : (
                              <p className={styles.contactDrawerEmptyText}>Aucun résumé disponible</p>
                            )}
                          </div>
                          <div className={styles.contactDrawerSection}>
                            <span className={styles.contactDrawerSectionTitle}>
                              Call
                            </span>
                            {convBookingData ? (
                              <div className={styles.contactDrawerBookingCard}>
                                <span className={styles.contactDrawerBookingBadge}>
                                  Call booké
                                </span>
                                <p className={styles.contactDrawerBookingDate}>
                                  Réservé le{" "}
                                  {new Date(convBookingData.created_at).toLocaleDateString("fr-FR", {
                                    day: "2-digit",
                                    month: "long",
                                    year: "numeric",
                                  })}
                                </p>
                              </div>
                            ) : (
                              <p className={styles.contactDrawerEmptyText}>Aucun call booké</p>
                            )}
                          </div>
                          <div className={styles.contactDrawerSection}>
                            <span className={styles.contactDrawerSectionTitle}>
                              Conversation
                            </span>
                            <div className={styles.contactDrawerStats}>
                              <div className={styles.contactDrawerStat}>
                                <svg
                                  className={styles.contactDrawerStatIcon}
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                >
                                  <rect
                                    x="1"
                                    y="2.5"
                                    width="12"
                                    height="10.5"
                                    rx="2"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                  />
                                  <path
                                    d="M1 6h12"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                  />
                                  <path
                                    d="M4.5 1v3M9.5 1v3"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <span>
                                  {new Date(
                                    activeConversation.createdAt,
                                  ).toLocaleDateString("fr-FR", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                              </div>
                              <div className={styles.contactDrawerStat}>
                                <svg
                                  className={styles.contactDrawerStatIcon}
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                >
                                  <path
                                    d="M2 4l5 4 5-4"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <rect
                                    x="1"
                                    y="2"
                                    width="12"
                                    height="10"
                                    rx="2"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                  />
                                  <path
                                    d="M7 10v-3"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M5.5 8.5L7 10l1.5-1.5"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span>{activeConversation.inboundCount} reçus</span>
                              </div>
                              <div className={styles.contactDrawerStat}>
                                <svg
                                  className={styles.contactDrawerStatIcon}
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                >
                                  <path
                                    d="M2 10l5-4 5 4"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <rect
                                    x="1"
                                    y="2"
                                    width="12"
                                    height="10"
                                    rx="2"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                  />
                                  <path
                                    d="M7 4v3"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M5.5 5.5L7 4l1.5 1.5"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span>
                                  {activeConversation.agentSentCount +
                                    activeConversation.humanSentCount}{" "}
                                  envoyés
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* ── Relances override ── */}
                          {convAgentAutoRelancesEnabled && (
                            <div className={styles.contactDrawerSection}>
                              <span className={styles.contactDrawerSectionTitle}>
                                Relances auto
                              </span>
                              <div className={styles.relancesOverrideToggleRow}>
                                <span className={styles.relancesOverrideToggleLabel}>
                                  Désactiver les relances pour ce contact
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={relancesDisabled}
                                  className={`${styles.relancesToggleSwitch} ${relancesDisabled ? styles.relancesToggleSwitchOn : ""}`}
                                  onClick={() => setRelancesDisabled((p) => !p)}
                                />
                              </div>
                              <div className={styles.relancesOverrideMsgField}>
                                <label className={styles.relancesOverrideMsgLabel}>
                                  Message personnalisé (optionnel)
                                </label>
                                <textarea
                                  className={styles.relancesOverrideMsgTextarea}
                                  placeholder="Remplace les messages de la séquence pour ce contact…"
                                  value={relanceMessageOverride}
                                  onChange={(e) => setRelanceMessageOverride(e.target.value)}
                                  rows={3}
                                />
                              </div>
                              <button
                                type="button"
                                className={styles.relancesOverrideSaveBtn}
                                onClick={() => void handleSaveRelancesOverride()}
                                disabled={relancesOverrideSaving}
                              >
                                {relancesOverrideSaving ? "Enregistrement…" : "Enregistrer"}
                              </button>
                            </div>
                          )}

                        </div>
                      </>
                    )}

                    <div
                      className={styles.chatMessages}
                      ref={messagesContainerRef}
                    >
                      {isAllMode && lazyMessagesLoading && (
                        <div className={styles.conversationLoading}>
                          Chargement des messages…
                        </div>
                      )}
                      {(() => {
                        const lastOutboundId = [...messagesForDisplay]
                          .reverse()
                          .find(
                            (item) =>
                              !("type" in item) &&
                              (item as Message).direction === "outbound",
                          )?.id;
                        return messagesForDisplay.map((item) => {
                          if ("type" in item && item.type === "date-separator") {
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
                              contactName={
                                activeConversation?.contactHandle ||
                                activeConversation?.contactName
                              }
                              isLastOutbound={item.id === lastOutboundId}
                              inlineReactions={
                                [
                                  ...(inlineReactionsByExternalMessageId.get(
                                    (item as Message).externalMessageId
                                      ? `external:${(item as Message).externalMessageId}`
                                      : "",
                                  ) ?? []),
                                  ...(inlineReactionsByExternalMessageId.get(
                                    `record:${(item as Message).messageRecordId}`,
                                  ) ?? []),
                                ].filter((emoji, index, arr) => arr.indexOf(emoji) === index)
                              }
                            />
                          );
                        });
                      })()}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className={styles.chatComposer}>
                      <textarea
                        ref={composerTextareaRef}
                        value={composerText}
                        onChange={(event) => {
                          setComposerText(event.target.value);
                          const el = event.target;
                          el.style.height = "40px";
                          el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                        }}
                        placeholder={
                          isWindowExpired
                            ? "Fenêtre 24h expirée"
                            : "Écrire un message…"
                        }
                        disabled={isWindowExpired}
                      />
                      <div className={styles.chatComposerActions}>
                        {isWindowExpired ? (
                          <span className={styles.windowExpiredNotice}>
                            Fenêtre 24h expirée · Impossible de répondre
                          </span>
                        ) : (
                          <span className={styles.chatComposerMeta}>
                            Canal actif: {activeConversation.channel}
                          </span>
                        )}
                        <div className={styles.chatComposerActionButtons}>
                          <button
                            type="button"
                            className={styles.voiceMicBtn}
                            onClick={openVoiceModal}
                            title="Envoyer un vocal"
                          >
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect x="5" y="1" width="5" height="8" rx="2.5" fill="currentColor"/>
                              <path d="M2.5 7.5C2.5 10.2614 4.73858 12.5 7.5 12.5C10.2614 12.5 12.5 10.2614 12.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              <line x1="7.5" y1="12.5" x2="7.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                          </button>
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
                    </div>
                  </>
                ) : (
                  <div className={styles.chatEmpty}>
                    Sélectionnez une conversation pour ouvrir le chat
                  </div>
                )}
              </div>
            </section>

            {/* ── Error detail modal */}
            {isErrorDetailOpen && activeConversation?.lastErrorMessage && (
              <div
                className={styles.errorModalBackdrop}
                onPointerDown={(event) =>
                  setBackdropPointerDownState(
                    errorDetailBackdropPointerDownRef,
                    event,
                  )
                }
                onPointerUp={(event) => {
                  if (
                    shouldCloseBackdropOnPointerUp(
                      errorDetailBackdropPointerDownRef,
                      event,
                    )
                  ) {
                    closeErrorDetail();
                  }
                }}
                onPointerCancel={() =>
                  resetBackdropPointerState(errorDetailBackdropPointerDownRef)
                }
                onPointerLeave={() =>
                  resetBackdropPointerState(errorDetailBackdropPointerDownRef)
                }
              >
                <div
                  className={styles.errorModal}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={styles.errorModalHeader}>
                    <h3>Message d'erreur</h3>
                    <button
                      type="button"
                      className={styles.errorModalClose}
                      onClick={closeErrorDetail}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M8 6.586L12.293 2.293a1 1 0 1 1 1.414 1.414L9.414 8l4.293 4.293a1 1 0 1 1-1.414 1.414L8 9.414l-4.293 4.293a1 1 0 1 1-1.414-1.414L6.586 8 2.293 3.707a1 1 0 0 1 1.414-1.414L8 6.586z" />
                      </svg>
                    </button>
                  </div>
                  <div className={styles.errorModalContent}>
                    <p>{activeConversation.lastErrorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Stop dialog */}
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

      {/* ── Modal vocal */}
      {isVoiceModalOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeIn 0.15s ease",
          }}
          onPointerDown={(event) =>
            setBackdropPointerDownState(voiceModalBackdropPointerDownRef, event)
          }
          onPointerUp={(event) => {
            if (
              shouldCloseBackdropOnPointerUp(
                voiceModalBackdropPointerDownRef,
                event,
              )
            ) {
              closeVoiceModal();
            }
          }}
          onPointerCancel={() =>
            resetBackdropPointerState(voiceModalBackdropPointerDownRef)
          }
          onPointerLeave={() =>
            resetBackdropPointerState(voiceModalBackdropPointerDownRef)
          }
        >
          <div
            style={{
              background: "var(--app-bg)", borderRadius: 18, padding: "28px 28px 24px",
              width: 460, maxWidth: "calc(100vw - 40px)",
              display: "flex", flexDirection: "column", gap: 18,
              boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
              border: "1px solid var(--app-border)",
              animation: "slideUp 0.18s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "var(--fs-18)", fontWeight: 700 }}>Envoyer un vocal</h3>
                <p style={{ margin: "4px 0 0", fontSize: "var(--fs-12)", color: "var(--app-text-secondary)" }}>
                  {activeConversation?.contactName}
                </p>
              </div>
              <button
                type="button"
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--app-text-secondary)", lineHeight: 1, padding: "0 2px" }}
                onClick={closeVoiceModal}
              >×</button>
            </div>

            {!voiceModalHasVoice ? (
              <div style={{ padding: "16px", borderRadius: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 14, color: "#dc2626" }}>
                Aucune voix configurée pour cet agent. Configurez-en une dans <strong>Paramètres &gt; Details &gt; Voice</strong>.
              </div>
            ) : (
              <>
                {/* Texte */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>
                    Texte à vocaliser
                  </label>
                  <textarea
                    rows={5}
                    value={voiceModalText}
                    onChange={(e) => setVoiceModalText(e.target.value)}
                    placeholder="Entrez le texte à envoyer en vocal…"
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 8,
                      border: "1px solid var(--app-border)", background: "var(--app-surface)",
                      color: "var(--app-text-primary)", fontSize: 14, outline: "none",
                      resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--app-text-secondary)", textAlign: "right" }}>
                    Coût estimé : <strong>{Math.max(1, Math.ceil(voiceModalText.length / 100)) * 5} crédits</strong>
                  </span>
                </div>

                {/* Erreur */}
                {voiceModalError && (
                  <div style={{ fontSize: 13, color: "#dc2626", padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    {voiceModalError}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    style={{
                      padding: "9px 20px", borderRadius: 9, border: "1px solid var(--app-border)",
                      background: "transparent", color: "var(--app-text-primary)", fontSize: 14,
                      fontWeight: 600, cursor: "pointer",
                    }}
                    disabled={!voiceModalText.trim() || voiceModalPreviewing}
                    onClick={handleVoicePreview}
                  >
                    {voiceModalPreviewing ? "Lecture…" : "Aperçu"}
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: "9px 20px", borderRadius: 9, border: "none",
                      background: "var(--app-primary)", color: "#fff", fontSize: 14,
                      fontWeight: 600, cursor: "pointer", opacity: voiceModalSending ? 0.7 : 1,
                    }}
                    disabled={!voiceModalText.trim() || voiceModalSending}
                    onClick={handleVoiceSend}
                  >
                    {voiceModalSending ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal planifier une relance */}
      {isClosingModalOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeIn 0.15s ease",
          }}
          onPointerDown={(event) =>
            setBackdropPointerDownState(
              closingModalBackdropPointerDownRef,
              event,
            )
          }
          onPointerUp={(event) => {
            if (
              shouldCloseBackdropOnPointerUp(
                closingModalBackdropPointerDownRef,
                event,
              )
            ) {
              setClosingModalOpen(false);
            }
          }}
          onPointerCancel={() =>
            resetBackdropPointerState(closingModalBackdropPointerDownRef)
          }
          onPointerLeave={() =>
            resetBackdropPointerState(closingModalBackdropPointerDownRef)
          }
        >
          <div
            style={{
              background: "var(--app-bg)", borderRadius: 18, padding: "28px 28px 24px",
              width: 420, maxWidth: "calc(100vw - 40px)",
              display: "flex", flexDirection: "column", gap: 20,
              boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
              border: "1px solid var(--app-border)",
              animation: "slideUp 0.18s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "var(--fs-18)", fontWeight: 700 }}>Marquer comme clôturée</h3>
                <p style={{ margin: "4px 0 0", fontSize: "var(--fs-12)", color: "var(--app-text-secondary)" }}>
                  {activeConversation?.contactName}
                </p>
              </div>
              <button
                type="button"
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--app-text-secondary)", lineHeight: 1, padding: "0 2px" }}
                onClick={() => setClosingModalOpen(false)}
              >×</button>
            </div>

            {/* Résultat toggle */}
            <div>
              <p style={{ margin: "0 0 10px", fontSize: "var(--fs-13)", fontWeight: 600 }}>Résultat</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setClosingIsWon(true)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${closingIsWon ? "#16a34a" : "var(--app-border)"}`,
                    background: closingIsWon ? "rgba(22,163,74,0.08)" : "var(--app-surface)",
                    color: closingIsWon ? "#16a34a" : "var(--app-text-secondary)",
                    fontSize: "var(--fs-13)", fontWeight: 700, transition: "all 0.15s",
                  }}
                >
                  Gagnée
                </button>
                <button
                  type="button"
                  onClick={() => setClosingIsWon(false)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${!closingIsWon ? "#dc2626" : "var(--app-border)"}`,
                    background: !closingIsWon ? "rgba(220,38,38,0.08)" : "var(--app-surface)",
                    color: !closingIsWon ? "#dc2626" : "var(--app-text-secondary)",
                    fontSize: "var(--fs-13)", fontWeight: 700, transition: "all 0.15s",
                  }}
                >
                  Perdue
                </button>
              </div>
            </div>

            {/* Montant */}
            <div>
              <p style={{ margin: "0 0 8px", fontSize: "var(--fs-13)", fontWeight: 600 }}>
                Montant {closingIsWon ? "(€)" : "(€, optionnel)"}
              </p>
              <input
                type="number"
                min={0}
                step={1}
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
                placeholder="0"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "10px 14px",
                  borderRadius: 10, border: "1px solid var(--app-border)",
                  background: "var(--app-surface)", color: "var(--app-text)",
                  fontSize: "var(--fs-18)", fontWeight: 700, outline: "none",
                  transition: "border-color 0.2s",
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setClosingModalOpen(false)}
                style={{
                  padding: "10px 20px", borderRadius: 10, border: "1px solid var(--app-border)",
                  background: "var(--app-surface)", color: "var(--app-text)",
                  fontSize: "var(--fs-13)", fontWeight: 600, cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmClosing}
                disabled={isClosing}
                style={{
                  padding: "10px 20px", borderRadius: 10,
                  border: `1.5px solid ${closingIsWon ? "#16a34a" : "#dc2626"}`,
                  background: closingIsWon ? "#16a34a" : "#dc2626",
                  color: "#fff", fontSize: "var(--fs-13)", fontWeight: 700,
                  cursor: isClosing ? "not-allowed" : "pointer",
                  opacity: isClosing ? 0.6 : 1, transition: "opacity 0.15s",
                }}
              >
                {isClosing ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isFollowupModalOpen && (
        <div
          className={styles.followupModalBackdrop}
          onPointerDown={(event) =>
            setBackdropPointerDownState(
              followupModalBackdropPointerDownRef,
              event,
            )
          }
          onPointerUp={(event) => {
            if (
              shouldCloseBackdropOnPointerUp(
                followupModalBackdropPointerDownRef,
                event,
              )
            ) {
              setFollowupModalOpen(false);
            }
          }}
          onPointerCancel={() =>
            resetBackdropPointerState(followupModalBackdropPointerDownRef)
          }
          onPointerLeave={() =>
            resetBackdropPointerState(followupModalBackdropPointerDownRef)
          }
        >
          <div
            className={styles.followupModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.followupModalHeader}>
              <div className={styles.followupModalTitleBlock}>
                <h3 className={styles.followupModalTitle}>Planifier une relance</h3>
                <p className={styles.followupModalSubtitle}>
                  {activeConversation?.contactName ?? "Conversation active"}
                </p>
              </div>
              <button
                type="button"
                className={styles.followupModalClose}
                onClick={() => setFollowupModalOpen(false)}
              >
                ×
              </button>
            </div>

            {existingFollowups.length > 0 && (
              <div className={styles.followupSection}>
                <p className={styles.followupSectionLabel}>Déjà planifiées ({existingFollowups.length})</p>
                <div className={styles.existingFollowupsList}>
                  {existingFollowups.map((f) => (
                    <div key={f.id} className={styles.existingFollowupRow}>
                      <div className={styles.existingFollowupInfo}>
                        <span className={styles.existingFollowupDate}>
                          {new Date(f.scheduled_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className={styles.existingFollowupMsg}>
                          {f.message_body
                            ? f.message_body.length > 60 ? f.message_body.slice(0, 60) + "…" : f.message_body
                            : "Template WhatsApp"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.existingFollowupDelete}
                        onClick={() => handleCancelFollowup(f.id)}
                        title="Annuler cette relance"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.followupSection}>
              <div className={styles.followupModeToggle}>
                <button
                  type="button"
                  onClick={() => { setUseSequence(false); }}
                  className={`${styles.followupModeBtn} ${!useSequence ? styles.followupModeBtnActive : ""}`}
                >
                  Date unique
                </button>
                <button
                  type="button"
                  onClick={() => { setUseSequence(true); setFollowupDate(""); }}
                  className={`${styles.followupModeBtn} ${useSequence ? styles.followupModeBtnActive : ""}`}
                >
                  Séquence J+1 · J+3 · J+7
                </button>
              </div>
            </div>

            {!useSequence ? (
              <>
                <div className={styles.followupSection}>
                  <p className={styles.followupSectionLabel}>Date</p>
                  <input
                    type="datetime-local"
                    value={followupDate}
                    onChange={(e) => setFollowupDate(e.target.value)}
                    className={styles.followupInput}
                  />
                </div>
                {activeConversation?.channel === "WhatsApp" ? (
                  <div className={styles.followupSection}>
                    <p className={styles.followupSectionLabel}>Template</p>
                    {followupTemplates.length === 0 ? (
                      <p className={styles.followupInfo}>Aucun template approuvé. Créez-en un dans la config agent.</p>
                    ) : (
                      <select value={followupTemplateId} onChange={(e) => setFollowupTemplateId(e.target.value)} className={styles.followupSelect}>
                        <option value="">Choisir un template</option>
                        {followupTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className={styles.followupSection}>
                    <p className={styles.followupSectionLabel}>Message</p>
                    <textarea
                      value={followupMessage}
                      onChange={(e) => setFollowupMessage(e.target.value)}
                      placeholder="Écris le message de relance..."
                      rows={3}
                      className={styles.followupTextarea}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className={styles.followupSection}>
                <p className={styles.followupSectionLabel}>Messages par jour</p>
                {([["J+1", 0], ["J+3", 1], ["J+7", 2]] as [string, number][]).map(([label, i]) => (
                  <div key={label} className={styles.followupSequenceRow}>
                    <span className={styles.followupSequenceDay}>{label}</span>
                    {activeConversation?.channel === "WhatsApp" ? (
                      followupTemplates.length === 0 ? (
                        <p className={styles.followupInfo}>Aucun template approuvé.</p>
                      ) : (
                        <select
                          value={sequenceTemplateIds[i]}
                          onChange={(e) => {
                            const next = [...sequenceTemplateIds] as [string, string, string];
                            next[i] = e.target.value;
                            setSequenceTemplateIds(next);
                          }}
                          className={styles.followupSelect}
                        >
                          <option value="">Choisir un template</option>
                          {followupTemplates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      )
                    ) : (
                      <textarea
                        value={sequenceMessages[i]}
                        onChange={(e) => {
                          const next = [...sequenceMessages] as [string, string, string];
                          next[i] = e.target.value;
                          setSequenceMessages(next);
                        }}
                        placeholder={`Message ${label}…`}
                        rows={2}
                        className={styles.followupTextarea}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className={styles.followupModalFooter}>
              <button
                type="button"
                onClick={() => setFollowupModalOpen(false)}
                className={`${styles.followupBtn} ${styles.followupBtnSecondary}`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleScheduleFollowup}
                disabled={isFollowupSubmitDisabled}
                className={`${styles.followupBtn} ${styles.followupBtnPrimary}`}
              >
                {isScheduling ? "..." : useSequence ? "Planifier la séquence" : "Planifier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Conversations;







