// supabase/functions/conversations/insta-webhook.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getInstagramAccessTokenForConnector } from './instagram-token.ts';
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const IG_VERIFY_TOKEN = Deno.env.get("IG_VERIFY_TOKEN") ?? "CHANGE_ME";
// même URL que dans index.ts (garde identique)
const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json"
    }
  });
}
function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "text/plain"
    }
  });
}
async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b)=>b.toString(16).padStart(2, "0")).join("");
}
// ✅ Lookup connector par l’ID receveur du webhook (entry.id / recipient.id)
// -> ici tu relies à all_connectors_users.id_user_plateform = "178414...."
async function getConnectorByIgReceiverId(igReceiverId) {
  const { data, error } = await supabase.from("all_connectors_users").select("id,user_id,provider,connectors_label,id_user_plateform").eq("provider", "instagram").eq("id_user_plateform", igReceiverId).maybeSingle();
  if (error) throw new Error(`DB connector lookup failed: ${error.message}`);
  return data; // null si pas trouvé
}
async function getConnectorConfigAgent(connectorId) {
  const { data, error } = await supabase.from("connectors_config_agent").select("configs_id,current_config_connexion").eq("user_connexion_id", connectorId).maybeSingle();
  if (error) throw new Error(`DB connector->config lookup failed: ${error.message}`);
  return data;
}
function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}
function getConfigEntryValue(config, id, fallback) {
  if (!Array.isArray(config)) return fallback;
  const found = config.find((item)=>item?.id === id);
  return found?.value ?? fallback;
}
function parseContactFilters(currentConfigConnexion) {
  const switchRaw = getConfigEntryValue(currentConfigConnexion, "switchContactOnly", "off");
  const contactOnlyRaw = getConfigEntryValue(currentConfigConnexion, "contactOnly", []);
  const neverContactRaw = getConfigEntryValue(currentConfigConnexion, "neverContact", []);
  return {
    switchContactOnly: normalizeUsername(switchRaw) === "on",
    contactOnly: Array.isArray(contactOnlyRaw) ? contactOnlyRaw.map(normalizeUsername).filter(Boolean) : [],
    neverContact: Array.isArray(neverContactRaw) ? neverContactRaw.map(normalizeUsername).filter(Boolean) : []
  };
}
function shouldProcessContact(params) {
  const username = normalizeUsername(params.username);
  if (!username) {
    return {
      allow: !params.switchContactOnly,
      reason: params.switchContactOnly ? "missing_username_switch_contact_only_on" : "missing_username_switch_contact_only_off"
    };
  }
  if (params.switchContactOnly) {
    const allow = params.contactOnly.includes(username);
    return {
      allow,
      reason: allow ? "contact_only_match" : "contact_only_no_match"
    };
  }
  const blocked = params.neverContact.includes(username);
  return {
    allow: !blocked,
    reason: blocked ? "never_contact_match" : "not_in_never_contact"
  };
}
async function getAgentConfig(configsId) {
  const { data, error } = await supabase.from("agent_configs").select("configs_id,is_active,configs").eq("configs_id", configsId).maybeSingle();
  if (error) throw new Error(`DB agent_configs lookup failed: ${error.message}`);
  return data;
}
function extractContextFromConfigs(configsJson) {
  const context = configsJson?.Details?.context ?? configsJson?.details?.context ?? "";
  const stopText = configsJson?.Details?.stopText ?? "";
  const stopLink = configsJson?.Details?.stopLink ?? "";
  const productName = configsJson?.Details?.productName ?? "";
  const data = {
    context,
    stop_condition: {
      text: stopText,
      link: stopLink
    },
    productName
  };
  return data;
}
async function upsertConversation(params) {
  const row = {
    user_id: params.user_id,
    agent_config_id: params.agent_config_id,
    user_connector_id: params.user_connector_id,
    platform: params.platform,
    external_thread_id: params.external_thread_id,
    contact_external_id: params.contact_external_id ?? null,
    contact_display_name: params.contact_display_name ?? null,
    contact_handle: params.contact_handle ?? null,
    last_message_at: params.nowIso,
    last_message_preview: params.last_message_preview ?? null,
    updated_at: params.nowIso
  };
  const { data, error } = await supabase.from("conversations").upsert(row, {
    onConflict: "user_connector_id,platform,external_thread_id"
  }).select("id,inbound_count,unread_count,external_thread_id,agent_thread_id,contact_handle,user_connector_id,pending_cursor_at,pending_since,pending_inbound_count,automation_state").single();
  if (error) throw new Error(`DB upsert conversation failed: ${error.message}`);
  return data;
}
async function ensureConversationMemoryRow(conversationId) {
  const { error } = await supabase.from("conversation_memory").upsert({
    conversation_id: conversationId
  }, {
    onConflict: "conversation_id"
  });
  if (error) throw new Error(`DB upsert memory failed: ${error.message}`);
}
async function insertInboundMessage(params) {
  const is_echo = params.is_echo;
  const row = {
    conversation_id: params.conversation_id,
    platform: params.platform,
    external_message_id: params.external_message_id,
    direction: is_echo ? "out" : "in",
    author_type: is_echo ? "human" : "customer",
    author_ref: params.author_ref ?? null,
    body_text: params.body_text,
    sent_at: params.sent_at_iso,
    send_state: is_echo ? "sent" : "received",
    message_type: params.message_type ?? "text"
  };
  if (params.media_path != null) row.media_path = params.media_path;
  if (params.media_mime != null) row.media_mime = params.media_mime;
  if (params.transcript_status != null) row.transcript_status = params.transcript_status;
  if (params.transcript_error != null) row.transcript_error = params.transcript_error;
  const { data, error } = await supabase.from("conversation_messages").insert(row).select("id").single();
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    throw new Error(`DB insert inbound message failed: ${error.message}`);
  }
  return data?.id ?? null;
}
async function reconcileOrInsertEchoMessage(params) {
  // Lookup avec retries — laisse le temps à index.ts d'écrire le vrai mid après l'envoi Meta
  let existing = null;
  let findErr = null;
  for(let attempt = 0; attempt < 4; attempt++){
    const res = await supabase.from("conversation_messages").select("id, send_state").eq("conversation_id", params.conversation_id).eq("platform", params.platform).eq("external_message_id", params.external_message_id).maybeSingle();
    existing = res.data ?? null;
    findErr = res.error ?? null;
    if (findErr) {
      throw new Error(`DB reconcile echo lookup failed: ${findErr.message}`);
    }
    if (existing) break;
    if (attempt < 3) {
      await sleep(150);
    }
  }
  if (existing) {
    // Message local déjà présent (envoyé depuis l'app) → confirmation enrichie
    const patch = {
      send_state: "sent"
    };
    if (params.message_type) patch.message_type = params.message_type;
    if (params.media_path) patch.media_path = params.media_path;
    if (params.media_mime) patch.media_mime = params.media_mime;
    if (params.transcript_status) patch.transcript_status = params.transcript_status;
    if (params.transcript_error) patch.transcript_error = params.transcript_error;
    const { error: patchErr } = await supabase.from("conversation_messages").update(patch).eq("id", existing.id);
    if (patchErr) {
      console.error("[RECONCILE_ECHO] failed to patch existing message", existing.id, patchErr);
    }
    return {
      mode: "updated",
      id: existing.id
    };
  }
  // Aucune ligne trouvée → message envoyé directement depuis Instagram, on insère
  const insertedId = await insertInboundMessage({
    conversation_id: params.conversation_id,
    platform: params.platform,
    external_message_id: params.external_message_id,
    author_ref: params.author_ref,
    body_text: params.body_text,
    sent_at_iso: params.sent_at_iso,
    is_echo: true,
    message_type: params.message_type,
    media_path: params.media_path,
    media_mime: params.media_mime,
    transcript_status: params.transcript_status,
    transcript_error: params.transcript_error
  });
  return {
    mode: "inserted",
    id: insertedId
  };
}
async function bumpConversationAfterInbound(conversationId, nowIso, preview, is_echo) {
  if (!is_echo) {
    const { error } = await supabase.rpc("bump_conversation_inbound", {
      p_conversation_id: conversationId,
      p_now: nowIso,
      p_preview: preview
    });
    if (error) throw new Error(`RPC bump_conversation_inbound failed: ${error.message}`);
  } else {
    const { error } = await supabase.rpc("bump_conversation_human_sent", {
      p_conversation_id: conversationId,
      p_now: nowIso,
      p_preview: preview
    });
    if (error) throw new Error(`RPC bump_conversation_human_sent failed: ${error.message}`);
  }
}
async function getConversationMemory(conversationId) {
  const { data, error } = await supabase.from("conversation_memory").select("summary").eq("conversation_id", conversationId).maybeSingle();
  if (error) throw new Error(`DB get conversation memory failed: ${error.message}`);
  return data?.summary ?? "";
}
function shortErr(e) {
  if (!e) return "erreur technique";
  return String(e).slice(0, 80);
}
function renderInboundForAgent(m) {
  if (m.message_type !== "audio") {
    return {
      shouldRun: true,
      inboundText: (m.body_text ?? "").trim()
    };
  }
  if (m.transcript_status === "done" && (m.transcript ?? "").trim()) {
    return {
      shouldRun: true,
      inboundText: (m.transcript ?? "").trim()
    };
  }
  if (m.transcript_status === "processing") {
    return {
      shouldRun: false,
      inboundText: "[Vocal reçu, transcription en cours]"
    };
  }
  // failed / none / done vide
  return {
    shouldRun: true,
    inboundText: `[Vocal reçu mais transcription impossible : ${shortErr(m.transcript_error)}]`
  };
}
async function getLastMessages(conversationId, limit = 10) {
  const { data, error } = await supabase.from("conversation_messages").select("author_type,body_text,sent_at,direction,message_type,transcript_status,transcript,transcript_error").eq("conversation_id", conversationId).order("sent_at", {
    ascending: false
  }).limit(limit);
  if (error) {
    throw new Error(`DB get last messages failed: ${error.message}`);
  }
  return (data ?? []).reverse().map((msg)=>{
    const { inboundText } = renderInboundForAgent(msg);
    return `${msg.author_type} | ${msg.message_type} | ${msg.sent_at} | ${inboundText}`;
  });
}
async function getIgUserProfile(recipientId, userConnectorId, timeoutMs = 7000) {
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const info = await getInstagramAccessTokenForConnector(userConnectorId);
    if (!info?.long_access_token || !info?.id_user_plateform) {
      return null;
    }
    const { long_access_token: token, id_user_plateform } = info;
    if (!token) return null;
    const url = new URL(`https://graph.instagram.com/v25.0/${encodeURIComponent(recipientId)}`);
    url.searchParams.set("fields", "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user");
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString(), {
      signal: controller.signal
    });
    const raw = await res.text();
    if (!res.ok) {
      console.log("[IG][PROFILE][ERR]", res.status, raw);
      return null;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch  {
      console.log("[IG][PROFILE][ERR] invalid json", raw);
      return null;
    }
    // Normalisation
    return {
      id: String(data.id ?? recipientId),
      username: data.username ?? undefined,
      name: data.name ?? undefined,
      profile_pic: data.profile_pic ?? undefined,
      follower_count: typeof data.follower_count === "number" ? data.follower_count : undefined,
      is_user_follow_business: typeof data.is_user_follow_business === "boolean" ? data.is_user_follow_business : undefined,
      is_business_follow_user: typeof data.is_business_follow_user === "boolean" ? data.is_business_follow_user : undefined
    };
  } catch (e) {
    console.log("[IG][PROFILE][ERR]", e);
    return null;
  } finally{
    clearTimeout(t);
  }
}
// Audio helpers
function mimeToExt(mime) {
  const map = {
    "audio/ogg": ".ogg",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/aac": ".aac",
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "video/mp4": ".mp4"
  };
  return map[mime.split(";")[0].trim()] ?? ".bin";
}
function createRandomUUID() {
  const uuid = crypto.randomUUID();
  return uuid;
}
function sleep(ms) {
  return new Promise((resolve)=>setTimeout(resolve, ms));
}
async function downloadAndStoreAudio(params) {
  try {
    const res = await fetch(params.audioUrl);
    if (!res.ok) {
      console.log("[IG][AUDIO][DOWNLOAD_ERR]", res.status);
      return null;
    }
    const srcMime = res.headers.get("content-type") ?? "";
    const forcedMime = srcMime.startsWith("video/mp4") ? "audio/mp4" : srcMime || "audio/mpeg";
    const ext = mimeToExt(forcedMime);
    // sanitize le thread id (contient des ':')
    const safePath = params.externalThreadId.replace(/[:/\\]/g, "_");
    const path = `${params.userId}/${params.connectorId}/${safePath}/${params.mid}${ext}`;
    const bytes = await res.arrayBuffer();
    const { error } = await supabase.storage.from("ig-audio").upload(path, bytes, {
      contentType: forcedMime,
      upsert: true
    });
    if (error) {
      console.log("[IG][AUDIO][UPLOAD_ERR]", error.message);
      return null;
    }
    return {
      path,
      mime: forcedMime
    };
  } catch (e) {
    console.log("[IG][AUDIO][ERR]", e);
    return null;
  }
}
const MINUTES_IN_DAY = 24 * 60;
function roundToMinute(date, addMinutes = 0) {
  const target = new Date(date.getTime() + addMinutes * 60000);
  target.setSeconds(0, 0);
  return target;
}
function parseTimeToMinutes(value) {
  const [hours, minutes] = (value ?? "").split(":").map((part)=>Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}
function getWeekdayKey(name) {
  if (!name) return null;
  const normalized = name.slice(0, 3).toLowerCase();
  const map = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun"
  };
  return map[normalized] ?? null;
}
function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short"
  });
  const parts = formatter.formatToParts(date);
  const result = {};
  for (const part of parts){
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }
  return {
    year: Number(result.year ?? 0),
    month: Number(result.month ?? 0),
    day: Number(result.day ?? 0),
    hour: Number(result.hour ?? 0),
    minute: Number(result.minute ?? 0),
    weekday: result.weekday
  };
}
function getDayOrdinal(year, month, day) {
  return Date.UTC(year, month - 1, day) / 86400000;
}
function buildZonedDateTime(year, month, day, minuteOfDay, timeZone) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  let ts = Date.UTC(year, month - 1, day, hour, minute);
  const targetOrdinal = getDayOrdinal(year, month, day);
  for(let attempt = 0; attempt < 10; attempt++){
    const candidate = new Date(ts);
    const zoned = getZonedParts(candidate, timeZone);
    const observedOrdinal = getDayOrdinal(zoned.year, zoned.month, zoned.day);
    const observedMinute = zoned.hour * 60 + zoned.minute;
    const targetMinute = hour * 60 + minute;
    const deltaMinutes = (observedOrdinal - targetOrdinal) * MINUTES_IN_DAY + (observedMinute - targetMinute);
    if (deltaMinutes === 0) {
      return candidate;
    }
    ts -= deltaMinutes * 60000;
  }
  console.warn(`[SCHEDULE][WARN] unable to align ${year}-${month}-${day} ${hour}:${minute} ${timeZone}`);
  return new Date(ts);
}
function buildTimeWindows(details) {
  const slots = (details.timeSlots ?? []).map((slot)=>{
    const start = parseTimeToMinutes(slot.time);
    const duration = Number(slot.durationMinutes);
    if (start === null || !Number.isFinite(duration) || duration <= 0) return null;
    const end = Math.min(MINUTES_IN_DAY, start + Math.floor(duration));
    if (end <= start) return null;
    return {
      start,
      end
    };
  }).filter(Boolean);
  if (slots.length > 0) {
    return slots.sort((a, b)=>a.start - b.start);
  }
  const rangeStart = parseTimeToMinutes(details.timeStart ?? "");
  const rangeEnd = parseTimeToMinutes(details.timeEnd ?? "");
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
    return [];
  }
  return [
    {
      start: rangeStart,
      end: rangeEnd
    }
  ];
}
export function compute_next_allowed_time(details, now) {
  const fallbackAllowed = {
    is_allowed_now: true,
    next_allowed_at: roundToMinute(now).toISOString(),
    window_end_at: null
  };
  if (!details?.timezone) {
    return fallbackAllowed;
  }
  const activeDays = {
    mon: Boolean(details.activeDays?.mon),
    tue: Boolean(details.activeDays?.tue),
    wed: Boolean(details.activeDays?.wed),
    thu: Boolean(details.activeDays?.thu),
    fri: Boolean(details.activeDays?.fri),
    sat: Boolean(details.activeDays?.sat),
    sun: Boolean(details.activeDays?.sun)
  };
  const windows = buildTimeWindows(details);
  if (windows.length === 0) {
    console.warn(`[SCHEDULE][WARN] invalid time window (${details.timeStart} -> ${details.timeEnd}) for timezone ${details.timezone}`);
    const fallbackNext = roundToMinute(now, 1);
    return {
      is_allowed_now: false,
      next_allowed_at: fallbackNext.toISOString(),
      window_end_at: null
    };
  }
  const nowRounded = roundToMinute(now);
  const nowParts = getZonedParts(nowRounded, details.timezone);
  const currentKey = getWeekdayKey(nowParts.weekday);
  if (!currentKey) {
    return fallbackAllowed;
  }
  const localMinutes = nowParts.hour * 60 + nowParts.minute;
  if (activeDays[currentKey]) {
    const activeWindow = windows.find((window)=>localMinutes >= window.start && localMinutes < window.end);
    if (activeWindow) {
      const windowEndDate = buildZonedDateTime(nowParts.year, nowParts.month, nowParts.day, activeWindow.end, details.timezone);
      return {
        is_allowed_now: true,
        next_allowed_at: nowRounded.toISOString(),
        window_end_at: windowEndDate.toISOString()
      };
    }
    const nextSameDay = windows.find((window)=>localMinutes < window.start);
    if (nextSameDay) {
      const startDate = buildZonedDateTime(nowParts.year, nowParts.month, nowParts.day, nextSameDay.start, details.timezone);
      return {
        is_allowed_now: false,
        next_allowed_at: startDate.toISOString(),
        window_end_at: null
      };
    }
  }
  for(let dayOffset = 1; dayOffset <= 7; dayOffset++){
    const futureDate = new Date(nowRounded.getTime() + dayOffset * 86400000);
    const futureParts = getZonedParts(futureDate, details.timezone);
    const futureKey = getWeekdayKey(futureParts.weekday);
    if (!futureKey || !activeDays[futureKey]) {
      continue;
    }
    const nextWindow = windows[0];
    if (!nextWindow) continue;
    const startDate = buildZonedDateTime(futureParts.year, futureParts.month, futureParts.day, nextWindow.start, details.timezone);
    return {
      is_allowed_now: false,
      next_allowed_at: startDate.toISOString(),
      window_end_at: null
    };
  }
  const fallbackNext = roundToMinute(now, 1);
  return {
    is_allowed_now: false,
    next_allowed_at: fallbackNext.toISOString(),
    window_end_at: null
  };
}
//Je suis pas sûre de là /////////////////////////////////////////////////////////////////////////////////
// helpers (en haut du fichier)
const META_APP_SECRET = Deno.env.get("IG_APP_SECRET");
function hex(buf) {
  return [
    ...new Uint8Array(buf)
  ].map((b)=>b.toString(16).padStart(2, "0")).join("");
}
async function hmacSha256Hex(key, payload) {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, payload);
  return hex(sig);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for(let i = 0; i < a.length; i++)out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
async function verifyMetaSignature(req, rawBody) {
  const header = req.headers.get("x-hub-signature-256") || "";
  // format: "sha256=<hex>"
  const [, sigHex] = header.split("sha256=");
  if (!sigHex) return false;
  if (!META_APP_SECRET) throw new Error("Missing META_APP_SECRET");
  const expected = await hmacSha256Hex(META_APP_SECRET, rawBody);
  return timingSafeEqual(sigHex.trim(), expected);
}
export default async function handleInstaWebhook(req) {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return text("ok", 200);
  // ✅ Meta verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === IG_VERIFY_TOKEN && challenge) {
      return text(challenge, 200);
    }
    return text("Forbidden", 403);
  }
  // ✅ Webhook event (POST)
  if (req.method === "POST") {
    //Pas sure de ça /////////////////////////////////////////////////////////////////////////////////:
    // dans if (req.method === "POST") { ... }
    const rawBytes = new Uint8Array(await req.arrayBuffer());
    // ✅ vérif signature AVANT de parser
    const okSig = await verifyMetaSignature(req, rawBytes);
    if (!okSig) return text("Invalid signature", 401);
    const raw = new TextDecoder().decode(rawBytes);
    // new au lieu de : const raw = await req.text(); //////////////////////////////////////////////////
    console.log("[META][WEBHOOK][RAW]", raw);
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch  {
      return json({
        ok: true
      }, 200); // accuse réception même si payload cassé
    }
    // 1) extrait les messages text + audio
    const events = [];
    for (const e of payload.entry ?? []){
      for (const m of e.messaging ?? []){
        const msg = m.message ?? {};
        const t = (m.message?.text ?? "").trim();
        const mid = m.message?.mid ?? "";
        const attachments = m.message?.attachments ?? [];
        const audioAttachment = attachments.find((a)=>a?.type === "audio");
        if (!mid) continue; // toujours besoin du mid
        if (!t && !audioAttachment) continue; // ignore read/delivery/empty
        const igReceiverId = msg.is_echo ? String(m.recipient?.id ?? "") : e.id;
        const tsIso = new Date(m.timestamp).toISOString();
        events.push({
          igReceiverId,
          senderScopedId: String(m.sender?.id ?? ""),
          mid,
          text: t,
          tsIso,
          is_echo: msg.is_echo,
          audioUrl: audioAttachment?.payload?.url ?? null
        });
      }
    }
    if (events.length === 0) return json({
      ok: true,
      ignored: true
    }, 200);
    // 2) traite chaque event (tu peux batcher après)
    for (const ev of events){
      // ✅ connector par compte receveur (178414...)
      const connector = await getConnectorByIgReceiverId(ev.is_echo ? ev.senderScopedId : ev.igReceiverId);
      if (!connector) {
        console.log("[IG][SKIP] no connector for igReceiverId=", ev.is_echo ? ev.senderScopedId : ev.igReceiverId);
        continue;
      }
      const connectorConfig = await getConnectorConfigAgent(connector.id);
      if (!connectorConfig?.configs_id) {
        console.log("[IG][SKIP] no agent config for connector=", connector.id);
        continue;
      }
      const agentConfigId = connectorConfig.configs_id;
      const contactFilters = parseContactFilters(connectorConfig.current_config_connexion);
      // ✅ ID contact à filtrer : recipient si echo, sender sinon
      const targetContactIgId = ev.is_echo ? ev.igReceiverId : ev.senderScopedId;
      // ✅ Fetch profil AVANT upsert pour filtrage
      const profile = await getIgUserProfile(targetContactIgId, connector.id);
      const targetUsername = profile?.username ?? null;
      const decision = shouldProcessContact({
        username: targetUsername,
        switchContactOnly: contactFilters.switchContactOnly,
        contactOnly: contactFilters.contactOnly,
        neverContact: contactFilters.neverContact
      });
      if (!decision.allow) {
        console.log("[IG][FILTER][SKIP]", {
          reason: decision.reason,
          switchContactOnly: contactFilters.switchContactOnly,
          contactOnly: contactFilters.contactOnly,
          neverContact: contactFilters.neverContact,
          username: targetUsername,
          targetContactIgId,
          is_echo: ev.is_echo,
          mid: ev.mid
        });
        continue;
      }
      const agentConfig = await getAgentConfig(agentConfigId);
      if (!agentConfig) {
        console.log("[IG][SKIP] agent config not found=", agentConfigId);
        continue;
      }
      // ✅ thread stable (comme Manychat), basé sur receiver + sender scopé
      const conversationKey = `igwebhook:${ev.is_echo ? ev.senderScopedId : ev.igReceiverId}:${ev.is_echo ? ev.igReceiverId : ev.senderScopedId}`;
      const now = new Date();
      const nowIso = now.toISOString();
      const conv = await upsertConversation({
        user_id: connector.user_id,
        agent_config_id: agentConfigId,
        user_connector_id: connector.id,
        platform: "instagram",
        external_thread_id: conversationKey,
        contact_external_id: targetContactIgId,
        contact_display_name: profile?.name ?? undefined,
        contact_handle: targetUsername ?? undefined,
        last_message_preview: (ev.text || "[Vocal]").slice(0, 240),
        nowIso
      });
      await ensureConversationMemoryRow(conv.id);
      // Branche AUDIO
      if (ev.audioUrl) {
        const stored = await downloadAndStoreAudio({
          audioUrl: ev.audioUrl,
          userId: connector.user_id,
          connectorId: connector.id,
          externalThreadId: conversationKey,
          mid: ev.mid
        });
        let msgId = null;
        if (ev.is_echo) {
          // echo audio = réconciliation, pas d'insert aveugle
          const result = await reconcileOrInsertEchoMessage({
            conversation_id: conv.id,
            platform: "instagram",
            external_message_id: ev.mid,
            author_ref: ev.senderScopedId,
            body_text: "[Vocal]",
            sent_at_iso: ev.tsIso,
            message_type: "audio",
            media_path: stored?.path ?? null,
            media_mime: stored?.mime ?? null,
            transcript_status: stored ? "processing" : "failed",
            transcript_error: stored ? undefined : "storage_upload_failed"
          });
          msgId = result.id;
          if (result.mode === "inserted") {
            await bumpConversationAfterInbound(conv.id, nowIso, "[Vocal]", true);
          }
        } else {
          msgId = await insertInboundMessage({
            conversation_id: conv.id,
            platform: "instagram",
            external_message_id: ev.mid,
            author_ref: ev.senderScopedId,
            body_text: "[Vocal]",
            sent_at_iso: ev.tsIso,
            is_echo: false,
            message_type: "audio",
            media_path: stored?.path ?? null,
            media_mime: stored?.mime ?? null,
            transcript_status: stored ? "processing" : "failed",
            transcript_error: stored ? undefined : "storage_upload_failed"
          });
          await bumpConversationAfterInbound(conv.id, nowIso, "[Vocal]", false);
        }
        if (msgId && stored) {
          // ✅ Upload OK → transcription asynchrone, l'agent dispatché après
          // @ts-ignore
          EdgeRuntime.waitUntil(supabase.functions.invoke("transcribe-audio", {
            body: {
              message_id: msgId
            }
          }).catch((e)=>console.log("[IG][TRANSCRIBE][INVOKE_ERR]", e)));
        } else if (!ev.is_echo) {
          // ❌ Upload échoué → dispatch agent avec renderInboundForAgent
          const { shouldRun, inboundText } = renderInboundForAgent({
            message_type: "audio",
            body_text: "[Vocal]",
            transcript_status: "failed",
            transcript: null,
            transcript_error: "storage_upload_failed"
          });
          const state = conv.automation_state;
          const state_good = state !== "stopped" && state !== "error" && state !== "condition_stop";
          if (shouldRun && state_good && agentConfig.is_active) {
            const details = agentConfig.configs?.Details ?? null;
            const schedule = details && typeof details === "object" ? compute_next_allowed_time(details, now) : {
              is_allowed_now: true,
              next_allowed_at: nowIso,
              window_end_at: null
            };
            if (!schedule.is_allowed_now) {
              await supabase.rpc("schedule_conversation_debounce", {
                p_conversation_id: conv.id,
                p_next_reply_at: schedule.next_allowed_at,
                p_cursor_at: ev.tsIso,
                p_automation_reason: "outside_schedule"
              });
            } else {
              await supabase.rpc("schedule_conversation_debounce", {
                p_conversation_id: conv.id,
                p_next_reply_at: new Date(now.getTime() + 8000).toISOString(),
                p_cursor_at: ev.tsIso,
                p_automation_reason: "debounce_audio_fallback"
              });
            }
          }
        }
        continue;
      }
      // Branche TEXTE
      if (ev.is_echo) {
        // echo = réconciliation : update si message local déjà présent, insert sinon
        const result = await reconcileOrInsertEchoMessage({
          conversation_id: conv.id,
          platform: "instagram",
          external_message_id: ev.mid,
          author_ref: ev.senderScopedId,
          body_text: ev.text,
          sent_at_iso: ev.tsIso,
          message_type: "text"
        });
        // On ne bumpe les compteurs que si c'est un vrai nouvel insert
        // (évite de ré-incrémenter human_sent_count sur un message déjà en base)
        if (result.mode === "inserted") {
          await bumpConversationAfterInbound(conv.id, nowIso, ev.text.slice(0, 240), true);
        }
      } else {
        // ✅ idempotence native grâce à mid
        await insertInboundMessage({
          conversation_id: conv.id,
          platform: "instagram",
          external_message_id: ev.mid,
          author_ref: ev.senderScopedId,
          body_text: ev.text,
          sent_at_iso: ev.tsIso,
          is_echo: false
        });
        await bumpConversationAfterInbound(conv.id, nowIso, ev.text.slice(0, 240), false);
      }
      //On continue que si on est pas le sender.
      const state = conv.automation_state;
      const state_good = state !== "stopped" && state !== "error" && state !== "condition_stop";
      if (!ev.is_echo && state_good) {
        if (!agentConfig.is_active) {
          continue;
        }
        const details = agentConfig.configs?.Details ?? null;
        const schedule = details && typeof details === "object" ? compute_next_allowed_time(details, now) : {
          is_allowed_now: true,
          next_allowed_at: nowIso,
          window_end_at: null
        };
        if (!schedule.is_allowed_now) {
          console.log(`[SCHEDULE][SCHEDULED] conv=${conv.id} next=${schedule.next_allowed_at} reason=outside_schedule`);
          await supabase.rpc("schedule_conversation_debounce", {
            p_conversation_id: conv.id,
            p_next_reply_at: schedule.next_allowed_at,
            p_cursor_at: ev.tsIso,
            p_automation_reason: "outside_schedule"
          });
          continue;
        }
        console.log(`[SCHEDULE][ALLOWED] conv=${conv.id} now=${nowIso} end=${schedule.window_end_at}`);
        await supabase.rpc("schedule_conversation_debounce", {
          p_conversation_id: conv.id,
          p_next_reply_at: new Date(now.getTime() + 8000).toISOString(),
          p_cursor_at: ev.tsIso,
          p_automation_reason: "debounce_inbound"
        });
      }
    }
    return json({
      ok: true,
      processed: events.length
    }, 200);
  }
  return text("Method not allowed", 405);
}
