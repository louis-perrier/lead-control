'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Instagram, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
import { useAssistants, useChannelAccounts, useInvalidate, useProfile } from '@/lib/queries'
import type { Assistant, AssistantSettings } from '@/lib/types'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, FieldHint, FieldError } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton, Switch } from '@/components/ui/misc'
import { EmptyState } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function useSaveSettings(assistant: Assistant | undefined) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const [saving, setSaving] = useState(false)

  async function save(patch: Partial<AssistantSettings>, extra: Record<string, unknown> = {}) {
    if (!assistant) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('assistants')
      .update({ settings: { ...assistant.settings, ...patch }, ...extra })
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

function ChannelSection({ assistant }: { assistant: Assistant }) {
  const { data: channels } = useChannelAccounts()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const channel = channels?.find((c) => c.id === assistant.channel_account_id)

  async function connect() {
    setBusy(true)
    try {
      const { auth_url } = await callFunction<{ auth_url: string }>('instagram-oauth/start', {
        body: { assistant_id: assistant.id, return_to: window.location.href },
      })
      window.location.href = auth_url
    } catch {
      toast('Impossible de démarrer la connexion Instagram.', 'error')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!channel) return
    setBusy(true)
    try {
      await callFunction('instagram-oauth/disconnect', { body: { channel_account_id: channel.id } })
      toast('Compte Instagram déconnecté.')
      invalidate('channel-accounts', 'assistants')
    } catch {
      toast('La déconnexion a échoué.', 'error')
    }
    setBusy(false)
    setConfirmOpen(false)
  }

  return (
    <Card>
      <CardHeader
        title="Compte Instagram"
        description="Le compte dont l'assistant gère les messages privés."
      />
      <CardBody>
        {channel ? (
          <div className="flex flex-wrap items-center gap-3">
            <Instagram size={18} className="text-muted" />
            <span className="font-medium">@{channel.handle ?? channel.external_id}</span>
            {channel.status === 'connected' ? (
              <Badge tone="success">Connecté</Badge>
            ) : (
              <Badge tone="warning">Connexion expirée</Badge>
            )}
            <div className="ml-auto flex gap-2">
              {channel.status !== 'connected' ? (
                <Button size="sm" onClick={connect} disabled={busy}>
                  <RefreshCw size={14} />
                  Reconnecter
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(true)} disabled={busy}>
                Déconnecter
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Aucun compte relié pour le moment.</p>
            <Button onClick={connect} disabled={busy}>
              <Instagram size={15} />
              {busy ? 'Ouverture…' : 'Relier mon compte Instagram'}
            </Button>
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={disconnect}
        title="Déconnecter Instagram"
        message="L'assistant sera mis en pause et ne pourra plus lire ni envoyer de messages sur ce compte. Vos conversations restent visibles."
        confirmLabel="Déconnecter"
        danger
        loading={busy}
      />
    </Card>
  )
}

function ProfileSection({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const s = assistant.settings
  const [productName, setProductName] = useState(s.product?.name ?? '')
  const [context, setContext] = useState(s.context ?? '')
  const [qualification, setQualification] = useState(s.qualification ?? '')
  const [stopText, setStopText] = useState(s.stop_condition?.text ?? '')
  const [stopLink, setStopLink] = useState(s.stop_condition?.link ?? '')
  const [linkError, setLinkError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setLinkError('')
    if (stopLink.trim() && !/^https?:\/\/\S+$/.test(stopLink.trim())) {
      setLinkError('Le lien doit commencer par http:// ou https://')
      return
    }
    save({
      product: { name: productName.trim() },
      context: context.trim(),
      qualification: qualification.trim(),
      stop_condition: { text: stopText.trim(), link: stopLink.trim() },
    })
  }

  return (
    <Card>
      <CardHeader
        title="Ce que vend le coach"
        description="L'assistant s'appuie sur ces informations pour répondre à votre place."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="product">Produit ou service</Label>
            <Input
              id="product"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Coaching perte de poids 90 jours"
            />
          </div>
          <div>
            <Label htmlFor="context">Contexte de vente</Label>
            <Textarea
              id="context"
              rows={6}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Votre méthode, vos clients types, vos prix, vos arguments, ce que l'assistant doit savoir."
            />
            <FieldHint>Plus le contexte est précis, plus les réponses sont justes.</FieldHint>
          </div>
          <div>
            <Label htmlFor="qualification">Questions de qualification (optionnel)</Label>
            <Textarea
              id="qualification"
              rows={3}
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="Ce que l'assistant doit chercher à savoir sur le prospect."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="stopText">Objectif de la conversation</Label>
              <Textarea
                id="stopText"
                rows={3}
                value={stopText}
                onChange={(e) => setStopText(e.target.value)}
                placeholder="Amener le prospect à réserver un appel découverte."
              />
            </div>
            <div>
              <Label htmlFor="stopLink">Lien à partager une fois prêt</Label>
              <Input
                id="stopLink"
                value={stopLink}
                onChange={(e) => setStopLink(e.target.value)}
                placeholder="https://calendly.com/votre-lien"
              />
              <FieldError>{linkError}</FieldError>
              <FieldHint>Envoyé au prospect quand l'objectif est atteint.</FieldHint>
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

function ScheduleSection({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const schedule = assistant.settings.schedule ?? {}
  const [days, setDays] = useState<boolean[]>(
    schedule.days && schedule.days.length === 7 ? schedule.days : Array(7).fill(true),
  )
  const [start, setStart] = useState(schedule.start ?? '09:00')
  const [end, setEnd] = useState(schedule.end ?? '20:00')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (start >= end) {
      setError("L'heure de début doit précéder l'heure de fin.")
      return
    }
    if (!days.some(Boolean)) {
      setError('Sélectionnez au moins un jour actif.')
      return
    }
    save({ schedule: { ...schedule, days, start, end } })
  }

  return (
    <Card>
      <CardHeader
        title="Horaires de réponse"
        description="En dehors de ces créneaux, l'assistant attend l'ouverture suivante pour répondre."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setDays((d) => d.map((v, j) => (j === i ? !v : v)))}
                className={
                  days[i]
                    ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white'
                    : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted'
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="start">De</Label>
              <Input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-32" />
            </div>
            <div>
              <Label htmlFor="end">À</Label>
              <Input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-32" />
            </div>
          </div>
          <FieldError>{error}</FieldError>
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

const PAUSE_REASONS: Record<string, string> = {
  byok_removed: 'votre accès bêta a changé',
  subscription_ended: 'votre abonnement est terminé',
  channel_disconnected: 'le compte Instagram est déconnecté',
  v2_migration: 'la nouvelle version de LeadControl est en place, vérifiez vos réglages puis réactivez',
  paused_by_admin: "l'équipe LeadControl l'a mis en pause",
}

function ActivationSection({ assistant }: { assistant: Assistant }) {
  const { data: channels } = useChannelAccounts()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [busy, setBusy] = useState(false)
  const channel = channels?.find((c) => c.id === assistant.channel_account_id)

  const blockers: string[] = []
  if (!channel || channel.status !== 'connected') blockers.push('relier un compte Instagram connecté')
  if (!assistant.settings.product?.name?.trim()) blockers.push('renseigner le produit ou service')
  if (!assistant.settings.context?.trim()) blockers.push('renseigner le contexte de vente')
  if (!assistant.settings.stop_condition?.text?.trim()) blockers.push("définir l'objectif de la conversation")

  async function toggle(value: boolean) {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('assistants')
      .update({ is_active: value, paused_reason: value ? null : 'paused_by_user' })
      .eq('id', assistant.id)
    setBusy(false)
    if (error) {
      toast("Impossible de changer l'état de l'assistant.", 'error')
      return
    }
    toast(value ? 'Assistant activé : il répond aux nouveaux messages.' : 'Assistant mis en pause.')
    invalidate('assistants')
  }

  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">
            {assistant.is_active ? 'Assistant actif' : 'Assistant en pause'}
          </p>
          {!assistant.is_active && assistant.paused_reason && PAUSE_REASONS[assistant.paused_reason] ? (
            <p className="mt-0.5 text-sm text-muted">
              Mis en pause : {PAUSE_REASONS[assistant.paused_reason]}.
            </p>
          ) : null}
          {blockers.length > 0 ? (
            <p className="mt-0.5 text-sm text-muted">
              Avant d'activer : {blockers.join(', ')}.
            </p>
          ) : assistant.is_active ? (
            <p className="mt-0.5 text-sm text-muted">
              Il répond automatiquement aux nouveaux messages privés.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">Tout est prêt, vous pouvez activer.</p>
          )}
        </div>
        <Switch
          checked={assistant.is_active}
          onChange={toggle}
          disabled={busy || (!assistant.is_active && blockers.length > 0)}
          label="Activer l'assistant"
        />
      </CardBody>
    </Card>
  )
}

function AssistantContent() {
  const searchParams = useSearchParams()
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: profile } = useProfile()
  const { data: assistants, isLoading } = useAssistants()
  const [creating, setCreating] = useState(false)
  const assistant = assistants?.[0]

  useEffect(() => {
    if (searchParams.get('ig_connected') === '1') {
      toast('Compte Instagram connecté.')
      invalidate('channel-accounts', 'assistants')
      window.history.replaceState(null, '', window.location.pathname)
    } else if (searchParams.get('ig_error')) {
      toast('La connexion Instagram a échoué. Réessayez.', 'error')
      window.history.replaceState(null, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canCreate = useMemo(
    () => Boolean(profile),
    [profile],
  )

  async function createAssistant() {
    setCreating(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('create_assistant', { p_name: 'Mon assistant' })
    setCreating(false)
    if (error) {
      if (error.message.includes('no_subscription')) {
        toast('Un abonnement est nécessaire pour créer un assistant.', 'error')
      } else if (error.message.includes('assistant_quota_reached')) {
        toast('Votre offre ne permet pas d’assistant supplémentaire.', 'error')
      } else {
        toast('La création a échoué.', 'error')
      }
      return
    }
    invalidate('assistants')
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!assistant) {
    return (
      <Card>
        <EmptyState
          title="Aucun assistant pour le moment"
          description="Créez votre assistant puis reliez votre compte Instagram."
          action={
            <Button onClick={createAssistant} disabled={creating || !canCreate}>
              {creating ? 'Création…' : 'Créer mon assistant'}
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <ActivationSection assistant={assistant} />
      <ChannelSection assistant={assistant} />
      <ProfileSection assistant={assistant} />
      <ScheduleSection assistant={assistant} />
    </div>
  )
}

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Assistant</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Le réglage de votre assistant Instagram, section par section.
      </p>
      <Suspense>
        <AssistantContent />
      </Suspense>
    </div>
  )
}
