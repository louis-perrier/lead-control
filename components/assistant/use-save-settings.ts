'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useInvalidate } from '@/lib/queries'
import { useToast } from '@/components/ui/toast'
import type { Assistant, AssistantSettings } from '@/lib/types'

export function useSaveSettings(assistant: Assistant | undefined) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const [saving, setSaving] = useState(false)

  // Un objet imbriqué (stop_condition, booking) se passe en fonction : il est alors
  // fusionné avec la valeur relue en base, pas avec celle du cache.
  async function save(
    patch: Partial<AssistantSettings> | ((base: AssistantSettings) => Partial<AssistantSettings>),
    extra: Record<string, unknown> = {},
  ) {
    if (!assistant) return
    setSaving(true)
    const supabase = createClient()
    // Relecture juste avant l'écriture : le cache peut dater, et un second onglet
    // écraserait sinon des réglages enregistrés entre-temps.
    const current = await supabase.from('assistants').select('settings').eq('id', assistant.id).maybeSingle()
    const base = (current.data?.settings ?? assistant.settings) as AssistantSettings
    const resolved = typeof patch === 'function' ? patch(base) : patch
    const { error } = await supabase
      .from('assistants')
      .update({ settings: { ...base, ...resolved }, ...extra })
      .eq('id', assistant.id)
    setSaving(false)
    if (error) {
      toast('Impossible d’enregistrer. Réessayez.', 'error')
      return
    }
    toast('Enregistré.')
    invalidate('assistants')
  }
  return { save, saving }
}
