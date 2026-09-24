'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
import { useChannelAccounts, useFlags, useInvalidate, useMyOverrides, useProfile } from '@/lib/queries'
import { hasFeature } from '@/lib/features'
import { Bell, BellOff, BellRing, ChevronRight, Share, Smartphone, SquarePlus } from 'lucide-react'
import { disablePush, enablePush, useNotificationsEnabled, usePushState } from '@/lib/notifications'
import type { PushState } from '@/lib/notifications'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, FieldError } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/dialog'
import { InfoTip } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'

const COMPANY_SIZES: { value: string; label: string }[] = [
  { value: '1', label: 'Solo' },
  { value: '2-10', label: '2 à 10' },
  { value: '11-50', label: '11 à 50' },
  { value: '51-200', label: '51 à 200' },
  { value: '200+', label: '200 et plus' },
]

function ProfileCard() {
  const { data: profile } = useProfile()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [timezone, setTimezone] = useState('Europe/Paris')
  const [city, setCity] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companySize, setCompanySize] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setTimezone(profile.timezone ?? 'Europe/Paris')
      setCity(profile.city ?? '')
      setCompanyName(profile.company_name ?? '')
      setCompanySize(profile.company_size ?? null)
    }
  }, [profile])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const { error } = await createClient()
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        timezone,
        city: city.trim() || null,
        company_name: companyName.trim() || null,
        company_size: companySize,
      })
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
              <Label htmlFor="timezone" className="inline-flex items-center gap-1.5">
                Fuseau horaire
                <InfoTip text="Sert aux horaires de réponse de l’assistant." />
              </Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Europe/Paris"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="city">Ville</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Paris" />
            </div>
            <div>
              <Label htmlFor="companyName">Entreprise</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Nom de votre entreprise"
              />
            </div>
          </div>
          <div>
            <Label>Taille de l'entreprise</Label>
            <div className="flex flex-wrap gap-2">
              {COMPANY_SIZES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCompanySize(companySize === c.value ? null : c.value)}
                  className={
                    companySize === c.value
                      ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white'
                      : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted'
                  }
                >
                  {c.label}
                </button>
              ))}
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
    <form onSubmit={save}>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold">Mot de passe</h3>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="secondary" disabled={saving || !password}>
            {saving ? 'Mise à jour…' : 'Mettre à jour'}
          </Button>
        </div>
      </CardBody>
    </form>
  )
}

function ByokBlock() {
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
    <CardBody className="space-y-3 border-t border-border">
      <div>
        <h3 className="text-sm font-semibold">Clé API Anthropic</h3>
        <p className="text-sm text-muted">En tant que bêta-testeur, vos réponses IA passent par votre propre clé.</p>
      </div>
      <div className="space-y-4">
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
      </div>
    </CardBody>
  )
}

function SecurityCard() {
  return (
    <Card>
      <CardHeader title="Sécurité" />
      <PasswordCard />
      <ByokBlock />
    </Card>
  )
}

function NotificationsBlock() {
  const enabled = useNotificationsEnabled()
  const toast = useToast()
  const [state, setState] = usePushState({ resave: true })
  const [busy, setBusy] = useState(false)

  if (!enabled) return null

  async function run(action: () => Promise<PushState>, success?: string) {
    setBusy(true)
    try {
      const next = await action()
      setState(next)
      if (next === 'on' && success) toast(success)
      if (next === 'denied') toast('Notifications bloquées sur cet appareil.', 'error')
    } catch {
      toast('L’opération a échoué. Réessayez.', 'error')
    }
    setBusy(false)
  }

  async function sendTest() {
    setBusy(true)
    try {
      const res = await callFunction<{ delivered: number }>('notifications-push', { body: { test: true } })
      toast(res.delivered > 0 ? 'Notification de test envoyée.' : 'Non reçue : désactivez puis réactivez.', res.delivered > 0 ? 'success' : 'error')
    } catch {
      toast('Impossible d’envoyer la notification de test.', 'error')
    }
    setBusy(false)
  }

  const status = (Icon: typeof Bell, text: string, tip?: string, tone = 'text-muted') => (
    <span className={`inline-flex items-center gap-2 ${tone}`}>
      <Icon size={16} />
      {text}
      {tip ? <InfoTip text={tip} /> : null}
    </span>
  )

  return (
    <CardBody className="space-y-3 text-sm">
      <div id="notifications" className="scroll-mt-16" />
      <h3 className="inline-flex items-center gap-1.5 font-semibold">
        Sur cet appareil
        <InfoTip text="Une alerte sur cet appareil quand l’assistant a besoin de vous." />
      </h3>
      <div>
        {state === 'loading' ? (
          <span className="text-muted">Vérification…</span>
        ) : state === 'unsupported' ? (
          status(BellOff, 'Non disponible sur ce navigateur', 'Utilisez Chrome sur Android, ou l’app installée sur iPhone.')
        ) : state === 'ios_install' ? (
          <div className="flex flex-wrap items-center gap-1.5 text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1">
              <Share size={14} /> Partager
            </span>
            <ChevronRight size={14} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1">
              <SquarePlus size={14} /> Sur l’écran d’accueil
            </span>
            <ChevronRight size={14} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1">
              <Smartphone size={14} /> Ouvrir l’icône
            </span>
            <InfoTip text="Sur iPhone, les notifications passent par l’app ajoutée à l’écran d’accueil." />
          </div>
        ) : state === 'denied' ? (
          status(BellOff, 'Bloquées sur cet appareil', 'Autorisez LeadControl dans les réglages de notifications du téléphone.')
        ) : state === 'off' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-1">{status(Bell, 'Désactivées sur cet appareil')}</span>
            <Button onClick={() => run(enablePush, 'Notifications activées.')} disabled={busy}>
              {busy ? 'Activation…' : 'Activer'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">{status(BellRing, 'Activées sur cet appareil', undefined, 'text-success')}</span>
            <Button size="sm" variant="secondary" onClick={sendTest} disabled={busy}>
              Tester
            </Button>
            <Button size="sm" variant="ghost" onClick={() => run(disablePush)} disabled={busy}>
              Désactiver
            </Button>
          </div>
        )}
      </div>
    </CardBody>
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
        message="Cette action est définitive : conversations, prospects et réglages seront supprimés. Confirmez-vous la demande de suppression ?"
        confirmLabel="Oui, supprimer mon compte"
        danger
        loading={busy}
      />
    </Card>
  )
}

// Un message dans le canal Slack choisi dès qu'un appel est réservé, quel que soit l'outil de
// réservation. Le canal se choisit dans l'écran de Slack au moment de l'installation.
function SlackBlock({ divided }: { divided: boolean }) {
  const { data: flags } = useFlags()
  const { data: profile } = useProfile()
  const { data: overrides } = useMyOverrides()
  const { data: channels } = useChannelAccounts()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const slack = channels?.find((c) => c.provider === 'slack')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('slack_connected')) {
      toast(
        params.get('slack_connected') === '1'
          ? 'Slack relié : un premier message vient d’arriver dans votre canal.'
          : 'Slack relié, mais le premier message n’est pas passé. Essayez « Envoyer un message d’essai ».',
        params.get('slack_connected') === '1' ? 'success' : 'error',
      )
      invalidate('channel-accounts')
    } else if (params.get('slack_error')) {
      toast(
        params.get('slack_error') === 'no_channel'
          ? 'Slack n’a renvoyé aucun canal. Dans la configuration de l’application Slack, activez Incoming Webhooks.'
          : 'La connexion Slack a échoué. Réessayez.',
        'error',
      )
    } else {
      return
    }
    params.delete('slack_connected')
    params.delete('slack_error')
    const rest = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
    // Une seule lecture au retour de Slack : les paramètres sont retirés juste après.
  }, [])

  if (!hasFeature('slack_notifications', flags, profile, overrides)) return null

  async function connect() {
    setBusy(true)
    try {
      const { auth_url } = await callFunction<{ auth_url: string }>('slack-oauth/start', {
        body: { return_to: window.location.href },
      })
      window.location.href = auth_url
    } catch {
      toast('Impossible de démarrer la connexion Slack.', 'error')
      setBusy(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      await callFunction('slack-oauth/test', { body: {} })
      toast(`Message envoyé dans ${slack?.label ?? 'votre canal'}.`)
    } catch (e) {
      if ((e as Error).message === 'slack_gone') {
        toast('L’application a été retirée de votre espace Slack. Reconnectez Slack.', 'error')
        invalidate('channel-accounts')
      } else {
        toast('Le message n’est pas passé. Réessayez dans un instant.', 'error')
      }
    }
    setTesting(false)
  }

  async function disconnect() {
    setBusy(true)
    try {
      await callFunction('slack-oauth/disconnect', { body: {} })
      toast('Slack déconnecté.')
      invalidate('channel-accounts')
    } catch {
      toast('La déconnexion a échoué.', 'error')
    }
    setBusy(false)
    setConfirmOpen(false)
  }

  return (
    <CardBody className={divided ? 'space-y-3 border-t border-border text-sm' : 'space-y-3 text-sm'}>
      <div>
        <h3 className="font-semibold">Slack</h3>
        <p className="text-muted">Un message dans votre canal dès qu’un appel est réservé.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {slack ? (
          <>
            <span className="min-w-0 truncate">
              {slack.handle ?? 'Espace Slack'}
              {slack.label ? `, canal ${slack.label}` : ''}
            </span>
            {slack.status === 'connected' ? (
              <Badge tone="success">Connecté</Badge>
            ) : (
              <Badge tone="warning">À reconnecter</Badge>
            )}
            <div className="ml-auto flex gap-2">
              {slack.status !== 'connected' ? (
                <Button onClick={connect} disabled={busy}>
                  Reconnecter
                </Button>
              ) : (
                <Button variant="secondary" onClick={sendTest} disabled={busy || testing}>
                  {testing ? 'Envoi…' : 'Envoyer un message d’essai'}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setConfirmOpen(true)} disabled={busy}>
                Déconnecter
              </Button>
            </div>
            {slack.status === 'connected' ? (
              <p className="w-full text-muted">
                Un message arrivera dans {slack.label ?? 'votre canal'} à chaque appel réservé, avec le prospect, la date
                et le résumé de la conversation.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <span className="flex-1 text-muted">Aucun espace Slack relié. Vous choisirez le canal dans Slack.</span>
            <Button onClick={connect} disabled={busy}>
              {busy ? 'Ouverture…' : 'Ajouter à Slack'}
            </Button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={disconnect}
        title="Déconnecter Slack"
        message="Plus aucun message ne partira dans votre canal. Les rendez-vous restent visibles dans LeadControl."
        confirmLabel="Déconnecter"
        danger
        loading={busy}
      />
    </CardBody>
  )
}

function NotifyCard() {
  const push = useNotificationsEnabled()
  const { data: flags } = useFlags()
  const { data: profile } = useProfile()
  const { data: overrides } = useMyOverrides()
  const slack = hasFeature('slack_notifications', flags, profile, overrides)
  if (!push && !slack) return null
  return (
    <Card>
      <CardHeader title="Où vous prévenir" />
      {push ? <NotificationsBlock /> : null}
      {slack ? <SlackBlock divided={push} /> : null}
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Réglages</h1>
      <ProfileCard />
      <NotifyCard />
      <SecurityCard />
      <DangerCard />
    </div>
  )
}
