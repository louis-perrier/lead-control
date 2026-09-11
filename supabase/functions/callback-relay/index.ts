// Webhook Instagram (slug historique conservé : cette URL est déclarée chez Meta).
// Signature HMAC obligatoire, dédoublonnage par mid, échos réconciliés,
// planification de la réponse via schedule_conversation_debounce.
import { admin, json, logEvent, SERVICE_ROLE_KEY, SUPABASE_URL } from '../_shared/core.ts'
import { fetchContactProfile, getChannelToken, markSeen } from '../_shared/instagram.ts'
import { planFollowups } from '../_shared/followups.ts'
import type { FollowupSettings } from '../_shared/followups.ts'

const IG_APP_SECRET = Deno.env.get('IG_APP_SECRET')!
const IG_VERIFY_TOKEN = Deno.env.get('IG_VERIFY_TOKEN')

type IgMessagingEvent = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    attachments?: { type?: string; payload?: { url?: string } }[]
  }
  read?: { mid?: string }
}

async function verifySignature(req: Request, rawBody: string) {
  const header = req.headers.get('x-hub-signature-256') ?? ''
  if (!header.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(IG_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return header === `sha256=${hex}`
}

function computeWaitSeconds(text: string) {
  const bonus = Math.ceil(text.length / 100) * 2
  return Math.min(90, Math.max(12, 12 + bonus))
}

async function downloadMedia(url: string, bucket: string, path: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`media_download_${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`media_upload:${error.message}`)
  return contentType
}

async function findChannel(accountExternalId: string) {
  const { data } = await admin
    .from('channel_accounts')
    .select('id, user_id, external_id, status')
    .eq('provider', 'instagram')
    .eq('external_id', accountExternalId)
    .neq('status', 'disconnected')
    .maybeSingle()
  return data
}

async function findAssistant(channelAccountId: string) {
  const { data } = await admin
    .from('assistants')
    .select('id, user_id, is_active, settings')
    .eq('channel_account_id', channelAccountId)
    .maybeSingle()
  return data
}

async function findOrCreateConversation(opts: {
  channel: { id: string; user_id: string; external_id: string }
  assistantId: string | null
  contactId: string
}) {
  const threadId = `ig:${opts.channel.external_id}:${opts.contactId}`
  const existing = await admin
    .from('conversations')
    .select('id, automation_state, assistant_id, contact_name, contact_handle, pending_cursor_at')
    .eq('channel_account_id', opts.channel.id)
    .eq('external_thread_id', threadId)
    .maybeSingle()
  if (existing.data) return { conv: existing.data, created: false }

  let contactName: string | null = null
  let contactHandle: string | null = null
  try {
    const token = await getChannelToken(opts.channel.id)
    if (token) {
      const profile = await fetchContactProfile(token, opts.contactId)
      contactName = profile?.name ?? null
      contactHandle = profile?.username ?? null
    }
  } catch (_) {
    // le nom du contact est un confort, pas un prérequis
  }

  const inserted = await admin
    .from('conversations')
    .insert({
      user_id: opts.channel.user_id,
      assistant_id: opts.assistantId,
      channel_account_id: opts.channel.id,
      provider: 'instagram',
      external_thread_id: threadId,
      contact_external_id: opts.contactId,
      contact_name: contactName,
      contact_handle: contactHandle,
    })
    .select('id, automation_state, assistant_id, contact_name, contact_handle, pending_cursor_at')
    .single()
  if (inserted.error) {
    // course entre deux webhooks : on relit
    const retry = await admin
      .from('conversations')
      .select('id, automation_state, assistant_id, contact_name, contact_handle, pending_cursor_at')
      .eq('channel_account_id', opts.channel.id)
      .eq('external_thread_id', threadId)
      .single()
    return { conv: retry.data!, created: false }
  }
  return { conv: inserted.data, created: true }
}

function audienceBlocks(settings: Record<string, unknown> | null, handle: string | null) {
  const audience = (settings as { audience?: { mode?: string; handles?: string[] } } | null)?.audience
  if (!audience || !handle) return false
  const handles = (audience.handles ?? []).map((h) => h.replace(/^@/, '').toLowerCase())
  const h = handle.replace(/^@/, '').toLowerCase()
  if (audience.mode === 'blocklist') return handles.includes(h)
  if (audience.mode === 'allowlist') return !handles.includes(h)
  return false
}

async function handleEvent(accountId: string, event: IgMessagingEvent) {
  if (event.read?.mid) {
    await admin
      .from('conversation_messages')
      .update({ read_by_contact_at: new Date().toISOString() })
      .eq('provider', 'instagram')
      .eq('external_message_id', event.read.mid)
      .is('read_by_contact_at', null)
    return
  }

  const message = event.message
  if (!message?.mid) return
  const attachment = message.attachments?.find((a) => a.type === 'audio' || a.type === 'image')
  if (!message.text?.trim() && !attachment?.payload?.url) return

  const isEcho = Boolean(message.is_echo)
  const contactId = isEcho ? event.recipient?.id : event.sender?.id
  if (!contactId) return

  const channel = await findChannel(accountId)
  if (!channel) return

  if (!isEcho) {
    // Vu dès la réception, pas juste avant l'envoi de la réponse : sinon le
    // badge "Vu" et la réponse apparaissent au même instant, ce qui trahit le bot.
    // @ts-ignore fourni par le runtime Edge
    EdgeRuntime.waitUntil(
      getChannelToken(channel.id).then((token) => (token ? markSeen(token, channel.external_id, contactId) : null)),
    )
  }

  const assistant = await findAssistant(channel.id)
  const { conv } = await findOrCreateConversation({
    channel,
    assistantId: assistant?.id ?? null,
    contactId,
  })

  const now = new Date().toISOString()
  const messageType = attachment ? (attachment.type === 'audio' ? 'audio' : 'image') : 'text'
  const preview =
    message.text?.trim().slice(0, 140) || (messageType === 'audio' ? '[Vocal]' : '[Photo]')

  const insert = await admin
    .from('conversation_messages')
    .insert({
      conversation_id: conv.id,
      provider: 'instagram',
      external_message_id: message.mid,
      direction: isEcho ? 'out' : 'in',
      author_type: isEcho ? 'human' : 'customer',
      author_ref: isEcho ? accountId : contactId,
      body_text: message.text ?? null,
      message_type: messageType,
      send_state: isEcho ? 'sent' : 'received',
      transcript_status: messageType === 'audio' && !isEcho ? 'processing' : 'none',
      sent_at: event.timestamp ? new Date(event.timestamp).toISOString() : now,
    })
    .select('id, sent_at')
    .single()

  if (insert.error) {
    if (insert.error.code === '23505') return // déjà reçu (echo de notre propre envoi inclus)
    throw new Error(`message_insert:${insert.error.message}`)
  }

  if (isEcho) {
    await admin.rpc('bump_conversation_human_sent', {
      p_conversation_id: conv.id,
      p_now: now,
      p_preview: preview,
    })
    // Le coach a répondu depuis l'app Instagram : même règle que depuis la boîte de réception,
    // sinon l'option ne vaudrait que pour la moitié des endroits où il écrit.
    const followups = (assistant?.settings as { followups?: FollowupSettings } | undefined)?.followups
    if (assistant?.is_active && followups?.after_own_message) {
      try {
        await planFollowups({
          conversationId: conv.id,
          assistantId: assistant.id,
          anchorMessageId: insert.data.id,
          settings: followups,
        })
      } catch (_) {
        // le message est déjà chez le prospect, une relance non programmée n'est pas bloquante
      }
    }
    return
  }

  await admin.rpc('bump_conversation_inbound', {
    p_conversation_id: conv.id,
    p_now: now,
    p_preview: preview,
  })

  if (messageType === 'audio' && attachment?.payload?.url) {
    const path = `${conv.id}/${insert.data.id}.m4a`
    try {
      const mime = await downloadMedia(attachment.payload.url, 'ig-audio', path)
      await admin
        .from('conversation_messages')
        .update({ media_path: path, media_mime: mime })
        .eq('id', insert.data.id)
      // @ts-ignore fourni par le runtime Edge
      EdgeRuntime.waitUntil(
        fetch(`${SUPABASE_URL}/functions/v1/media-transcribe`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ message_id: insert.data.id }),
        }),
      )
    } catch (e) {
      await admin
        .from('conversation_messages')
        .update({ transcript_status: 'failed', transcript_error: String(e).slice(0, 200) })
        .eq('id', insert.data.id)
      // sans transcription possible, on planifie quand même une réponse
      if (assistant?.is_active && !['stopped', 'error', 'condition_stop'].includes(conv.automation_state)) {
        await admin.rpc('schedule_conversation_debounce', {
          p_conversation_id: conv.id,
          p_next_reply_at: new Date(Date.now() + 12_000).toISOString(),
          p_cursor_at: insert.data.sent_at,
          p_automation_reason: 'audio_fallback',
        })
      }
    }
  }

  if (messageType === 'image' && attachment?.payload?.url) {
    const path = `${conv.id}/${insert.data.id}.jpg`
    try {
      const mime = await downloadMedia(attachment.payload.url, 'ig-images', path)
      await admin
        .from('conversation_messages')
        .update({ media_path: path, media_mime: mime })
        .eq('id', insert.data.id)
    } catch (_) {
      // photo perdue, le texte de la conversation reste exploitable
    }
    return // comme en V1, une image seule ne déclenche pas de réponse automatique
  }

  // Planification de la réponse automatique
  if (!assistant || !assistant.is_active) return
  if (['stopped', 'error', 'condition_stop'].includes(conv.automation_state)) return
  if (audienceBlocks(assistant.settings, conv.contact_handle)) return
  if (messageType === 'audio') return // media-transcribe replanifie une fois le texte prêt

  const allowedRes = await admin.rpc('assistant_next_allowed_time', {
    p_assistant_id: assistant.id,
    p_at: now,
  })
  const allowed = allowedRes.data ? new Date(allowedRes.data as string) : null
  if (!allowed) return // aucun jour actif dans les horaires

  const wait = new Date(Date.now() + computeWaitSeconds(message.text ?? '') * 1000)
  const target = allowed > wait ? allowed : wait
  await admin.rpc('schedule_conversation_debounce', {
    p_conversation_id: conv.id,
    p_next_reply_at: target.toISOString(),
    p_cursor_at: insert.data.sent_at,
    p_automation_reason: allowed > wait ? 'outside_schedule' : 'debounce_inbound',
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (url.pathname.endsWith('/insta/webhook') && req.method === 'GET') {
    if (!IG_VERIFY_TOKEN) return new Response('verify token not configured', { status: 500 })
    if (
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === IG_VERIFY_TOKEN
    ) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
    }
    return new Response('forbidden', { status: 403 })
  }

  if (url.pathname.endsWith('/insta/webhook') && req.method === 'POST') {
    const raw = await req.text()
    if (!(await verifySignature(req, raw))) {
      return new Response('invalid signature', { status: 401 })
    }
    let payload: { entry?: { id?: string; messaging?: IgMessagingEvent[] }[] }
    try {
      payload = JSON.parse(raw)
    } catch {
      return new Response('bad json', { status: 400 })
    }
    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        try {
          await handleEvent(entry.id ?? event.recipient?.id ?? '', event)
        } catch (e) {
          await logEvent('error', 'callback-relay', `webhook event failed: ${String(e).slice(0, 300)}`)
        }
      }
    }
    return new Response('EVENT_RECEIVED', { status: 200 })
  }

  // Routes V1 retirées (WhatsApp, ManyChat, callback n8n, commentaires)
  return json(req, { error: 'gone' }, 410)
})
