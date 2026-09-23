'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { FieldError, FieldHint } from '@/components/ui/input'

export const IMAGE_BUCKET = 'assistant-media'
export const ACCEPTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif']
// Limite d'Instagram pour une image envoyée en message.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type ImageValue = { path: string; mime: string }

type Props = {
  value: ImageValue | null
  onChange: (value: ImageValue | null) => void
  folder: string
  disabled?: boolean
}

export function ImageField({ value, onChange, folder, disabled }: Props) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    if (!value?.path) {
      setUrl(null)
      return
    }
    supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrl(value.path, 600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [value?.path, supabase])

  async function importFile(file: File) {
    const lower = file.name.toLowerCase()
    const extension = ACCEPTED_IMAGE_EXTENSIONS.find((ext) => lower.endsWith(ext))
    if (!extension) {
      setError(`Formats acceptés : ${ACCEPTED_IMAGE_EXTENSIONS.join(', ')}`)
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image trop lourde, 8 Mo maximum.')
      return
    }
    setBusy(true)
    setError('')
    const mime = file.type || (extension === '.png' ? 'image/png' : extension === '.gif' ? 'image/gif' : 'image/jpeg')
    const path = `${folder}/${crypto.randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`
    const previous = value?.path
    const res = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: mime })
    if (res.error) {
      setBusy(false)
      setError("L'image n'a pas pu être envoyée. Réessayez.")
      return
    }
    if (previous) await supabase.storage.from(IMAGE_BUCKET).remove([previous])
    setBusy(false)
    onChange({ path, mime })
  }

  async function remove() {
    if (value?.path) await supabase.storage.from(IMAGE_BUCKET).remove([value.path])
    onChange(null)
  }

  return (
    <div className="space-y-2">
      {value?.path ? (
        <div className="flex flex-wrap items-center gap-2">
          {url ? (
            <img src={url} alt="Image de relance" className="max-h-40 rounded-lg border border-border" />
          ) : (
            <span className="text-sm text-muted">Chargement de l’image…</span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled || busy}>
            Remplacer
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={disabled || busy}>
            <Trash2 className="size-4" /> Supprimer
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled || busy}>
          <Upload className="size-4" /> {busy ? 'Envoi…' : 'Importer une image'}
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void importFile(file)
        }}
      />
      {value?.path ? null : <FieldHint>jpg, png ou gif, 8 Mo au plus. La même image part à tous les prospects concernés.</FieldHint>}
      <FieldError>{error}</FieldError>
    </div>
  )
}
