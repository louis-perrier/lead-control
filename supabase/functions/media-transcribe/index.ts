// Transcription d'un vocal Instagram (OpenAI Whisper), puis replanification
// du dispatch. Appel interne uniquement (clé service role).
import { admin, isServiceCall, json } from '../_shared/core.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!isServiceCall(req)) return new Response('unauthorized', { status: 401 })

  let body: { message_id?: number } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }
  if (!body.message_id) return json(req, { error: 'invalid_body' }, 400)

  const msgRes = await admin
    .from('conversation_messages')
    .select('id, conversation_id, media_path, media_mime, transcript_status, sent_at')
    .eq('id', body.message_id)
    .maybeSingle()
  const msg = msgRes.data
  if (!msg?.media_path) return json(req, { error: 'not_found' }, 404)

  async function reschedule() {
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

    const form = new FormData()
    form.set('model', 'whisper-1')
    form.set('response_format', 'verbose_json')
    form.set('file', new File([file.data], 'audio.m4a', { type: msg.media_mime ?? 'audio/mp4' }))
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    })
    const payload = await res.json()
    if (!res.ok) throw new Error(`whisper_${res.status}:${JSON.stringify(payload).slice(0, 200)}`)

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
