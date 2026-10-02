'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useInvalidate, useProfile } from '@/lib/queries'
import { ABOUT_FIELDS, type AboutField, type SellerAbout } from '@/supabase/functions/assistant-dispatch/about-prompt'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

const LABELS: Record<AboutField, { label: string; placeholder?: string; rows?: number }> = {
  name: { label: 'Votre nom' },
  activity: { label: 'Ce que vous faites', placeholder: 'Votre métier, depuis quand, pour qui.' },
  story: { label: 'Votre parcours', placeholder: "D'où vous venez, ce qui vous a amené là.", rows: 3 },
  figures: {
    label: 'Vos résultats et chiffres',
    placeholder: "Ce que vous acceptez que l'assistant dise : vos revenus, votre audience, les résultats de vos clients.",
    rows: 3,
  },
  extra: { label: 'Autre chose à savoir', rows: 2 },
}

// Rangé sur le compte : tous les assistants du compte lisent la même fiche.
export function AboutCard() {
  const { data: profile } = useProfile()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [values, setValues] = useState<SellerAbout>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    const stored = profile.about ?? {}
    // Le nom du compte sert de point de départ, il n'est enregistré ici qu'au premier clic.
    setValues({ ...stored, name: stored.name ?? profile.full_name ?? '' })
  }, [profile])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    const about: SellerAbout = {}
    for (const field of ABOUT_FIELDS) {
      const text = (values[field.key] ?? '').trim()
      if (text) about[field.key] = text
    }
    setSaving(true)
    const { error } = await createClient().from('profiles').update({ about }).eq('user_id', profile.user_id)
    setSaving(false)
    if (error) {
      toast('Impossible d’enregistrer. Réessayez.', 'error')
      return
    }
    toast('Enregistré.')
    invalidate('profile')
  }

  return (
    <Card>
      <CardHeader title="À propos de vous" description="L’assistant ne dit de vous que ce qui est écrit ici." />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          {ABOUT_FIELDS.map((field) => {
            const { label, placeholder, rows } = LABELS[field.key]
            const id = `about-${field.key}`
            const common = {
              id,
              maxLength: field.max,
              value: values[field.key] ?? '',
              placeholder,
            }
            return (
              <div key={field.key}>
                <Label htmlFor={id}>{label}</Label>
                {rows ? (
                  <Textarea {...common} rows={rows} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
                ) : (
                  <Input {...common} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
                )}
              </div>
            )
          })}
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving || !profile}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
