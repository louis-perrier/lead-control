'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
import { useInvalidate, useProfile } from '@/lib/queries'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, FieldError, FieldHint } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

function ProfileCard() {
  const { data: profile } = useProfile()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [timezone, setTimezone] = useState('Europe/Paris')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setTimezone(profile.timezone ?? 'Europe/Paris')
    }
  }, [profile])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const { error } = await createClient()
      .from('profiles')
      .update({ full_name: fullName.trim() || null, timezone })
      .eq('user_id', profile.user_id)
    setSaving(false)
    if (error) {
      toast('Impossible d’enregistrer le profil.', 'error')
      return
    }
    toast('Profil enregistré.')
    invalidate('profile')
  }

  return (
    <Card>
      <CardHeader title="Profil" />
      <form onSubmit={save}>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile?.email ?? ''} disabled />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName">Nom</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="timezone">Fuseau horaire</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Europe/Paris"
              />
              <FieldHint>Utilisé pour les horaires de réponse de l'assistant.</FieldHint>
            </div>
          </div>
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('8 caractères minimum.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setSaving(true)
    const { error: err } = await createClient().auth.updateUser({ password })
    setSaving(false)
    if (err) {
      setError('Le changement de mot de passe a échoué.')
      return
    }
    setPassword('')
    setConfirm('')
    toast('Mot de passe mis à jour.')
  }

  return (
    <Card>
      <CardHeader title="Mot de passe" />
      <form onSubmit={save}>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="newPassword">Nouveau mot de passe</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirmation</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <FieldError>{error}</FieldError>
          </div>
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving || !password}>
            {saving ? 'Mise à jour…' : 'Mettre à jour'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ByokCard() {
  const { data: profile } = useProfile()
  const toast = useToast()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const invalidate = useInvalidate()
  const keyState = useQuery({
    queryKey: ['ai-key'],
    enabled: profile?.plan_override === 'beta_byok',
    queryFn: async () => {
      const { data } = await createClient()
        .from('user_ai_keys')
        .select('key_hint, status, last_checked_at')
        .maybeSingle()
      return data
    },
  })

  if (profile?.plan_override !== 'beta_byok') return null

  async function saveKey(e: React.FormEvent) {
    e.preventDefault()
    if (key.trim().length < 20) return
    setBusy(true)
    try {
      const res = await callFunction<{ valid: boolean }>('ai-key/validate', { body: { key: key.trim() } })
      toast(res.valid ? 'Clé enregistrée et vérifiée.' : 'Clé enregistrée mais refusée par Anthropic : vérifiez-la.', res.valid ? 'success' : 'error')
      setKey('')
      invalidate('ai-key')
    } catch {
      toast('Impossible d’enregistrer la clé.', 'error')
    }
    setBusy(false)
  }

  async function removeKey() {
    setBusy(true)
    try {
      await callFunction('ai-key', { method: 'DELETE' })
      toast('Clé supprimée. L’assistant ne peut plus répondre sans clé.')
      invalidate('ai-key')
    } catch {
      toast('La suppression a échoué.', 'error')
    }
    setBusy(false)
  }

  const current = keyState.data

  return (
    <Card>
      <CardHeader
        title="Clé API Anthropic"
        description="En tant que bêta-testeur, vos réponses IA passent par votre propre clé."
      />
      <CardBody className="space-y-4">
        {current ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Clé enregistrée se terminant par {current.key_hint}</span>
            {current.status === 'valid' ? (
              <Badge tone="success">Vérifiée</Badge>
            ) : current.status === 'invalid' ? (
              <Badge tone="danger">Refusée</Badge>
            ) : (
              <Badge tone="muted">Non vérifiée</Badge>
            )}
            <Button size="sm" variant="secondary" onClick={removeKey} disabled={busy}>
              Supprimer la clé
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Aucune clé enregistrée : l'assistant ne peut pas répondre. Créez une clé sur
            console.anthropic.com puis collez-la ici.
          </p>
        )}
        <form onSubmit={saveKey} className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <Label htmlFor="apiKey">{current ? 'Remplacer la clé' : 'Votre clé API'}</Label>
            <Input
              id="apiKey"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={busy || key.trim().length < 20}>
            {busy ? 'Vérification…' : 'Tester et enregistrer'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function DangerCard() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function deleteAccount() {
    setBusy(true)
    // La suppression du compte auth passe par le support : ici on déconnecte
    // et on marque la demande, pour ne rien détruire sans trace.
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('feedback').insert({
        user_id: user.id,
        message: 'Demande de suppression de compte',
        page: '/app/settings',
      })
    }
    await supabase.auth.signOut()
    toast('Demande envoyée. Votre compte sera supprimé par notre équipe.')
    router.replace('/login')
  }

  return (
    <Card className="border-danger/30">
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Supprimer mon compte</h2>
          <p className="mt-0.5 text-sm text-muted">
            Toutes vos conversations et données seront supprimées définitivement.
          </p>
        </div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Supprimer
        </Button>
      </CardBody>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={deleteAccount}
        title="Supprimer mon compte"
        message="Cette action est définitive : conversations, contacts et réglages seront supprimés. Confirmez-vous la demande de suppression ?"
        confirmLabel="Oui, supprimer mon compte"
        danger
        loading={busy}
      />
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Réglages</h1>
        <p className="mt-1 text-sm text-muted">Votre compte et vos préférences.</p>
      </div>
      <ProfileCard />
      <PasswordCard />
      <ByokCard />
      <DangerCard />
    </div>
  )
}
