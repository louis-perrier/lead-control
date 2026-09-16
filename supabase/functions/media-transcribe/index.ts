// Transcription d'un vocal (OpenAI Whisper). Appel interne (clé service role) pour un vocal
// Instagram, suivi d'une replanification ; appel utilisateur pour un vocal de l'assistant.
import { admin, getUser, handleOptions, isServiceCall, json, logEvent } from '../_shared/core.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

async function whisper(file: Blob, name: string, mime: string) {
  const form = new FormData()
  form.set('model', 'whisper-1')
  form.set('response_format', 'verbose_json')
  form.set('file', new File([file], name, { type: mime }))
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  })
  const payload = await res.json()
  if (!res.ok) throw new Error(`whisper_${res.status}:${JSON.stringify(payload).slice(0, 200)}`)
  return payload as { text?: string; duration?: number }
}

// Vocal enregistré dans les réglages : le texte est rangé avec la réponse ou la relance.
async function transcribeSavedAudio(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  let body: { audio_path?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  const path = body.audio_path ?? ''
  if (!path.startsWith(`${user.id}/`) || path.includes('..')) return json(req, { error: 'not_found' }, 404)
  if (!OPENAI_API_KEY) return json(req, { error: 'openai_key_missing' }, 409)
  const file = await admin.storage.from('assistant-audio').download(path)
  if (file.error || !file.data) return json(req, { error: 'not_found' }, 404)
  const mime = file.data.type || 'audio/wav'
  const name = mime.includes('wav') ? 'audio.wav' : mime.includes('mp4') ? 'audio.mp4' : 'audio.m4a'
  try {
    const out = await whisper(file.data, name, mime)
    return json(req, { text: (out.text ?? '').trim() })
  } catch (e) {
    await logEvent('warn', 'media-transcribe', `vocal de l'assistant non transcrit : ${String(e).slice(0, 200)}`, { user_id: user.id })
    return json(req, { error: 'transcription_failed' }, 502)
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!isServiceCall(req)) return transcribeSavedAudio(req)

  let body: { message_id?: number } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  if (!body.message_id) return json(req, { error: 'invalid_body' }, 400)

  const msgRes = await admin
    .from('conversation_messages')
    .select('id, conversation_id, direction, media_path, media_mime, transcript_status, sent_at')
    .eq('id', body.message_id)
    .maybeSingle()
  const msg = msgRes.data
  if (!msg?.media_path) return json(req, { error: 'not_found' }, 404)

  async function reschedule() {
    // Un vocal du coach est transcrit pour que l'agent le lise, il ne déclenche pas de réponse.
    if (msg!.direction !== 'in') return
    const conv = await admin
      .from('conversations')
      .select('id, assistant_id, automation_state')
      .eq('id', msg!.conversation_id)
      .single()
    if (!conv.data?.assistant_id) return
    if (['stopped', 'error', 'condition_stop'].includes(conv.data.automation_state)) return
    const assistant = await admin
      .from('assistants')
      .select('is_active')
      .eq('id', conv.data.assistant_id)
      .maybeSingle()
    if (!assistant.data?.is_active) return
    await admin.rpc('schedule_conversation_debounce', {
      p_conversation_id: msg!.conversation_id,
      p_next_reply_at: new Date(Date.now() + 2000).toISOString(),
      p_cursor_at: msg!.sent_at,
      p_automation_reason: 'audio_transcript_ready',
    })
  }

  if (!OPENAI_API_KEY) {
    await admin
      .from('conversation_messages')
      .update({ transcript_status: 'failed', transcript_error: 'OPENAI_API_KEY manquante' })
      .eq('id', msg.id)
    await reschedule()
    return json(req, { ok: false, error: 'openai_key_missing' })
  }

  try {
    const file = await admin.storage.from('ig-audio').download(msg.media_path)
    if (file.error || !file.data) throw new Error(`download:${file.error?.message}`)

    const payload = await whisper(file.data, 'audio.m4a', msg.media_mime ?? 'audio/mp4')

    await admin
      .from('conversation_messages')
      .update({
        transcript: payload.text ?? '',
        transcript_status: 'done',
        transcript_error: null,
        media_duration_ms: payload.duration ? Math.round(payload.duration * 1000) : null,
      })
      .eq('id', msg.id)
  } catch (e) {
    await admin
      .from('conversation_messages')
      .update({ transcript_status: 'failed', transcript_error: String(e).slice(0, 200) })
      .eq('id', msg.id)
  }

  await reschedule()
  return json(req, { ok: true })
})
