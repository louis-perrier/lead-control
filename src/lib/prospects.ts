import supabase from "./supabase";

export type ContactStatus = "new" | "contacted" | "replied" | "booked" | "closed";

export type ProspectContactRecord = {
  id: string;
  full_name: string | null;
  phone_e164: string | null;
  instagram_handle: string | null;
  email: string | null;
  notes: string | null;
  conversation_id: string | null;
  status: ContactStatus | null;
  updated_at?: string | null;
};

type Channel = "Instagram" | "WhatsApp" | "Telegram";

type ProspectAuthorType = "agent" | "human" | "customer";

type ProspectMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  sentAt: string;
  authorType: ProspectAuthorType;
};

export type ProspectConversation = {
  id: string;
  contactId: string | null;
  contactName: string;
  contactHandle: string;
  phone: string;
  email: string;
  channel: Channel;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
  summary: string | null;
  inboundCount: number;
  heatTag: string | null;
  automationState: string;
  messages: ProspectMessage[];
};

type ConversationMessageRecord = {
  id?: string | number | null;
  direction?: string | null;
  body_text?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  author_type?: string | null;
  transcript?: string | null;
  transcribed_text?: string | null;
};

type ConversationRecord = {
  id: string | number;
  platform?: string | null;
  automation_state?: string | null;
  contact_id?: string | number | null;
  contact_display_name?: string | null;
  contact_name?: string | null;
  full_name?: string | null;
  profile_name?: string | null;
  instagram_name?: string | null;
  contact_full_name?: string | null;
  contact_handle?: string | null;
  instagram_handle?: string | null;
  contact_username?: string | null;
  username?: string | null;
  phone_e164?: string | null;
  contact_phone?: string | null;
  email?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  unread_count?: number | null;
  summary?: string | null;
  inbound_count?: number | null;
  heat_tag?: string | null;
  metadata?: unknown;
  conversation_messages?: ConversationMessageRecord[] | null;
};

const normalizeChannel = (platform?: string | null): Channel => {
  const normalized = normalizeTextValue(platform).toLowerCase();
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

const normalizeNoteValue = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizePhoneValue = (value: string): string => {
  const compact = value.replace(/\s+/g, "");
  if (!compact) return "";
  if (compact.startsWith("+")) return compact;
  if (/^\d{7,15}$/.test(compact)) return `+${compact}`;
  return compact;
};

const normalizeHandleValue = (value: string): string =>
  value.replace(/^@+/, "").trim();

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

const isLikelyPhone = (value: string): boolean =>
  /^\+?[0-9]{7,15}$/.test(value.replace(/\s+/g, ""));

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const mapMessageRecord = (
  conversationId: string,
  message: ConversationMessageRecord,
): ProspectMessage => {
  const normalizedDirection = normalizeTextValue(message.direction).toLowerCase();
  const isOutbound =
    normalizedDirection === "outbound" || normalizedDirection === "out";
  const text = pickFirstText(
    message.body_text,
    message.transcript,
    message.transcribed_text,
  );
  const normalizedAuthorType = normalizeTextValue(message.author_type).toLowerCase();
  const authorType: ProspectAuthorType =
    normalizedAuthorType === "human"
      ? "human"
      : normalizedAuthorType === "customer"
      ? "customer"
      : normalizedAuthorType === "agent"
      ? "agent"
      : isOutbound
      ? "agent"
      : "customer";

  return {
    id: `${conversationId}-${String(message.id ?? cryptoRandomFallback())}`,
    direction: isOutbound ? "outbound" : "inbound",
    text,
    sentAt:
      normalizeTextValue(message.sent_at) ||
      normalizeTextValue(message.created_at) ||
      new Date().toISOString(),
    authorType,
  };
};

const cryptoRandomFallback = (): string =>
  Math.random().toString(36).slice(2, 10);

export const mapConversationRecordToProspect = (
  rawRecord: Record<string, unknown>,
): ProspectConversation => {
  const record = rawRecord as ConversationRecord;
  const channel = normalizeChannel(record.platform);
  const metadata = toRecord(record.metadata);
  const metadataContact = toRecord(metadata.contact);
  const metadataProfile = toRecord(metadata.profile);
  const metadataCustomer = toRecord(metadata.customer);

  const messages = (record.conversation_messages ?? [])
    .map((message) => mapMessageRecord(String(record.id), message))
    .sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );

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

  const rawHandle = normalizeHandleValue(
    pickFirstText(
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
    ),
  );

  const phoneCandidate = pickFirstText(
    record.phone_e164,
    record.contact_phone,
    metadata.phone_e164,
    metadata.phone,
    metadataContact.phone_e164,
    metadataContact.phone,
    metadataCustomer.phone_e164,
    metadataCustomer.phone,
    metadataProfile.phone_e164,
    metadataProfile.phone,
  );
  const phone =
    isLikelyPhone(phoneCandidate)
      ? normalizePhoneValue(phoneCandidate)
      : channel === "WhatsApp" && isLikelyPhone(rawHandle)
      ? normalizePhoneValue(rawHandle)
      : "";

  const email = normalizeTextValue(
    pickFirstText(
      record.email,
      metadata.email,
      metadataContact.email,
      metadataCustomer.email,
      metadataProfile.email,
    ),
  );

  const displayHandle =
    channel === "Instagram" && isDigitsOnly(rawHandle) ? "" : rawHandle;
  const contactName = profileName || displayHandle || phone || "Contact";

  return {
    id: String(record.id),
    contactId:
      record.contact_id === null || record.contact_id === undefined
        ? null
        : String(record.contact_id),
    contactName,
    contactHandle: displayHandle,
    phone,
    email,
    channel,
    lastMessage:
      normalizeTextValue(record.last_message_preview) ||
      messages[messages.length - 1]?.text ||
      "",
    lastAt:
      normalizeTextValue(record.last_message_at) ||
      normalizeTextValue(record.updated_at) ||
      normalizeTextValue(record.created_at) ||
      new Date().toISOString(),
    unreadCount: typeof record.unread_count === "number" ? record.unread_count : 0,
    summary: normalizeTextValue(record.summary) || null,
    inboundCount:
      typeof record.inbound_count === "number" ? record.inbound_count : 0,
    heatTag: normalizeTextValue(record.heat_tag) || null,
    automationState: normalizeTextValue(record.automation_state) || "idle",
    messages,
  };
};

export const hasProspectReply = (conversation: ProspectConversation): boolean =>
  conversation.messages.some(
    (message) =>
      message.direction === "inbound" && message.authorType === "customer",
  ) || conversation.inboundCount > 0;

export const shouldIncludeConversationInContacts = (
  conversation: ProspectConversation,
): boolean => {
  if (!hasProspectReply(conversation)) return false;

  if (conversation.channel === "Instagram") {
    return Boolean(normalizeHandleValue(conversation.contactHandle));
  }

  return Boolean(
    normalizePhoneValue(conversation.phone) ||
      normalizeTextValue(conversation.email) ||
      normalizeHandleValue(conversation.contactHandle),
  );
};

export const isCrmEligibleConversation = (
  conversation: ProspectConversation,
): boolean => {
  const hasIdentity = Boolean(
    normalizeContactNameValue(conversation.contactName) ||
      normalizeHandleValue(conversation.contactHandle) ||
      normalizePhoneValue(conversation.phone) ||
      normalizeTextValue(conversation.email),
  );

  if (hasIdentity) return true;
  if (conversation.messages.length > 0) return true;
  return Boolean(normalizeTextValue(conversation.lastMessage));
};

export const getLeadOrigin = (
  conversation: ProspectConversation,
): "incoming" | "outreach_reply" => {
  const firstCustomerMessage = conversation.messages.find(
    (message) =>
      message.direction === "inbound" && message.authorType === "customer",
  );

  if (!firstCustomerMessage) return "incoming";

  const firstCustomerAt = new Date(firstCustomerMessage.sentAt).getTime();
  const hasOutboundBeforeReply = conversation.messages.some((message) => {
    if (message.direction !== "outbound") return false;
    return new Date(message.sentAt).getTime() <= firstCustomerAt;
  });

  return hasOutboundBeforeReply ? "outreach_reply" : "incoming";
};

export const getLeadOriginLabel = (conversation: ProspectConversation): string =>
  getLeadOrigin(conversation) === "outreach_reply"
    ? "Réponse prospection"
    : "Contact entrant";

export const getLastProspectReplyAt = (
  conversation: ProspectConversation,
): string => {
  const latestInbound = [...conversation.messages]
    .reverse()
    .find(
      (message) =>
        message.direction === "inbound" && message.authorType === "customer",
    );
  return latestInbound?.sentAt ?? conversation.lastAt;
};

export const buildLeadNote = (
  conversation: ProspectConversation,
  contactNotes?: string | null,
): string => {
  const savedNotes = normalizeNoteValue(normalizeTextValue(contactNotes));
  if (savedNotes) return savedNotes;

  const summary = normalizeNoteValue(normalizeTextValue(conversation.summary));
  if (summary) return summary;

  const latestInbound = [...conversation.messages]
    .reverse()
    .find(
      (message) =>
        message.direction === "inbound" && message.authorType === "customer",
    );
  if (latestInbound?.text) {
    return normalizeNoteValue(latestInbound.text);
  }

  return normalizeNoteValue(conversation.lastMessage);
};

export const findMatchingContact = (
  conversation: ProspectConversation,
  contacts: ProspectContactRecord[],
): ProspectContactRecord | null => {
  const conversationId = conversation.id;
  const contactId = conversation.contactId;
  const handle = normalizeHandleValue(conversation.contactHandle).toLowerCase();
  const phone = normalizePhoneValue(conversation.phone);
  const email = normalizeTextValue(conversation.email).toLowerCase();

  if (contactId) {
    const byId = contacts.find((contact) => contact.id === contactId);
    if (byId) return byId;
  }

  const byConversation = contacts.find(
    (contact) => normalizeTextValue(contact.conversation_id) === conversationId,
  );
  if (byConversation) return byConversation;

  if (handle) {
    const byHandle = contacts.find(
      (contact) =>
        normalizeHandleValue(normalizeTextValue(contact.instagram_handle)).toLowerCase() ===
        handle,
    );
    if (byHandle) return byHandle;
  }

  if (phone) {
    const byPhone = contacts.find(
      (contact) => normalizePhoneValue(normalizeTextValue(contact.phone_e164)) === phone,
    );
    if (byPhone) return byPhone;
  }

  if (email) {
    const byEmail = contacts.find(
      (contact) => normalizeTextValue(contact.email).toLowerCase() === email,
    );
    if (byEmail) return byEmail;
  }

  return null;
};

const findContactByConversationId = (
  conversationId: string,
  contacts: ProspectContactRecord[],
): ProspectContactRecord | null =>
  contacts.find(
    (contact) => normalizeTextValue(contact.conversation_id) === conversationId,
  ) ?? null;

type SyncResult = {
  inserted: number;
  updated: number;
  skipped: number;
};

export const syncProspectContacts = async (
  rawConversations: Record<string, unknown>[],
): Promise<SyncResult> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { inserted: 0, updated: 0, skipped: rawConversations.length };
  }

  const conversations = rawConversations
    .map(mapConversationRecordToProspect)
    .filter(shouldIncludeConversationInContacts);

  if (conversations.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, full_name, phone_e164, instagram_handle, email, notes, conversation_id, status, updated_at",
    )
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }

  const contacts = (data ?? []) as ProspectContactRecord[];
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (const conversation of conversations) {
    const existing = findContactByConversationId(conversation.id, contacts);
    const defaultStatus: ContactStatus =
      getLeadOrigin(conversation) === "outreach_reply" ? "replied" : "new";
    const conversationIdValue: string | number = /^\d+$/.test(conversation.id)
      ? Number(conversation.id)
      : conversation.id;
    const fullName =
      normalizeContactNameValue(conversation.contactName) || null;
    const instagramHandle =
      conversation.channel === "Instagram" && conversation.contactHandle
        ? normalizeHandleValue(conversation.contactHandle)
        : null;
    const phone = conversation.phone || null;
    const email = conversation.email || null;
    const generatedNote = buildLeadNote(conversation, null) || null;
    const fallbackFullName =
      fullName ||
      (instagramHandle ? `@${instagramHandle}` : null) ||
      phone ||
      email ||
      `Prospect ${conversation.id}`;

    if (!existing) {
      inserts.push({
        user_id: user.id,
        full_name: fullName || fallbackFullName,
        instagram_handle: instagramHandle,
        phone_e164: phone,
        email,
        tags: [],
        notes: generatedNote,
        source: "conversation",
        status: defaultStatus,
        conversation_id: conversationIdValue,
      });
      continue;
    }

    const payload: Record<string, unknown> = {};
    if (!normalizeTextValue(existing.full_name) && fullName) {
      payload.full_name = fullName;
    }
    if (!normalizeTextValue(existing.instagram_handle) && instagramHandle) {
      payload.instagram_handle = instagramHandle;
    }
    if (!normalizeTextValue(existing.phone_e164) && phone) {
      payload.phone_e164 = phone;
    }
    if (!normalizeTextValue(existing.email) && email) {
      payload.email = email;
    }
    if (!normalizeTextValue(existing.notes) && generatedNote) {
      payload.notes = generatedNote;
    }
    if (!normalizeTextValue(existing.conversation_id)) {
      payload.conversation_id = conversationIdValue;
    }

    const existingStatus = existing.status ?? "new";
    if (
      defaultStatus === "replied" &&
      (existingStatus === "new" || existingStatus === "contacted")
    ) {
      payload.status = "replied";
    }

    if (Object.keys(payload).length > 0) {
      updates.push({ id: existing.id, payload });
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("contacts").insert(inserts);
    if (insertError) throw insertError;
  }

  if (updates.length > 0) {
    await Promise.all(
      updates.map(async ({ id, payload }) => {
        const { error: updateError } = await supabase
          .from("contacts")
          .update(payload)
          .eq("id", id)
          .eq("user_id", user.id);
        if (updateError) throw updateError;
      }),
    );
  }

  return {
    inserted: inserts.length,
    updated: updates.length,
    skipped: Math.max(0, conversations.length - inserts.length - updates.length),
  };
};
