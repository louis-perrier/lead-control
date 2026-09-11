'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  MAX_RECORDING_SECONDS,
  TARGET_SAMPLE_RATE,
  downsample,
  encodeWav,
  formatDuration,
} from '@/lib/audio'
import { Button } from '@/components/ui/button'
import { FieldError, FieldHint } from '@/components/ui/input'

export const AUDIO_BUCKET = 'assistant-audio'

export type AudioValue = { path: string; mime: string; durationMs?: number }

type Props = {
  value: AudioValue | null
  onChange: (value: AudioValue | null) => void
  folder: string
  disabled?: boolean
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export function AudioField({ value, onChange, folder, disabled }: Props) {
  const supabase = createClient()
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!value?.path) {
      setUrl(null)
      return
    }
    supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(value.path, 600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [value?.path, supabase])

  function teardown() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    processorRef.current?.disconnect()
    processorRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
  }

  useEffect(() => teardown, [])

  async function upload(blob: Blob, mime: string, durationMs?: number) {
    setBusy(true)
    setError('')
    const extension = mime === 'audio/wav' ? 'wav' : 'm4a'
    const path = `${folder}/${crypto.randomUUID()}.${extension}`
    const previous = value?.path
    const res = await supabase.storage.from(AUDIO_BUCKET).upload(path, blob, { contentType: mime })
    setBusy(false)
    if (res.error) {
      setError("L'enregistrement n'a pas pu être envoyé. Réessayez.")
      return
    }
    if (previous) await supabase.storage.from(AUDIO_BUCKET).remove([previous])
    onChange({ path, mime, durationMs })
  }

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      // Passer par un gain nul évite de réentendre le micro dans les enceintes.
      const mute = ctx.createGain()
      mute.gain.value = 0
      chunksRef.current = []
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0)
        chunksRef.current.push(downsample(new Float32Array(input), ctx.sampleRate))
      }
      source.connect(processor)
      processor.connect(mute)
      mute.connect(ctx.destination)
      ctxRef.current = ctx
      streamRef.current = stream
      processorRef.current = processor
      setElapsed(0)
      setRecording(true)
      const startedAt = Date.now()
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startedAt
        setElapsed(ms)
        if (ms >= MAX_RECORDING_SECONDS * 1000) void stopRecording()
      }, 200)
    } catch (_) {
      setError("Le micro n'est pas accessible. Autorisez-le dans votre navigateur.")
    }
  }

  async function stopRecording() {
    if (!recording) return
    const samples = concat(chunksRef.current)
    const durationMs = Math.round((samples.length / TARGET_SAMPLE_RATE) * 1000)
    teardown()
    setRecording(false)
    chunksRef.current = []
    if (samples.length === 0) {
      setError('Aucun son capté, vérifiez votre micro.')
      return
    }
    await upload(encodeWav(samples), 'audio/wav', durationMs)
  }

  async function importFile(file: File) {
    const lower = file.name.toLowerCase()
    if (!ACCEPTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setError(`Formats acceptés par Instagram : ${ACCEPTED_AUDIO_EXTENSIONS.join(', ')}`)
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Fichier trop lourd, 20 Mo maximum.')
      return
    }
    await upload(file, file.type || 'audio/mp4')
  }

  async function remove() {
    if (value?.path) await supabase.storage.from(AUDIO_BUCKET).remove([value.path])
    onChange(null)
  }

  if (recording) {
    return (
      <div className="flex items-center gap-3">
        <Button type="button" variant="danger" size="sm" onClick={stopRecording}>
          <Square className="size-4" /> Arrêter
        </Button>
        <span className="text-sm text-muted">
          Enregistrement en cours {formatDuration(elapsed)} sur {formatDuration(MAX_RECORDING_SECONDS * 1000)}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {value?.path ? (
        <div className="flex flex-wrap items-center gap-2">
          {url ? <audio controls preload="none" src={url} className="max-w-full" /> : <span className="text-sm text-muted">Chargement du vocal…</span>}
          <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled || busy}>
            Remplacer
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={disabled || busy}>
            <Trash2 className="size-4" /> Supprimer
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={startRecording} disabled={disabled || busy}>
            <Mic className="size-4" /> {busy ? 'Envoi…' : 'Enregistrer un vocal'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled || busy}>
            <Upload className="size-4" /> Importer un fichier
          </Button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_AUDIO_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void importFile(file)
        }}
      />
      {value?.path ? null : (
        <FieldHint>
          Deux minutes au maximum. Le même vocal part à tous les prospects concernés.
        </FieldHint>
      )}
      <FieldError>{error}</FieldError>
    </div>
  )
}
