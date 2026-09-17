'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Instagram, Plus, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
import { isViewAsReadOnly, useViewAsTargetId } from '@/lib/view-as/state'
import {
  useAssistants,
  useChannelAccounts,
  useEffectiveUserId,
  useFlags,
  useInvalidate,
  useMyOverrides,
  useProfile,
} from '@/lib/queries'
import { hasFeature } from '@/lib/features'
import { formatDateTime, storageSafeName } from '@/lib/utils'
import { readShares } from '@/supabase/functions/_shared/context-budget'
import { ACCEPTED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES, documentKind } from '@/supabase/functions/_shared/document-text'
import { triggerKind } from '@/supabase/functions/_shared/canned-match'
import { MESSAGING_WINDOW_MINUTES, cumulativeOffsets } from '@/supabase/functions/_shared/followup-plan'
import {
  NAME_VARIABLE_TEMPLATE,
  hasMissingFallback,
  hasNameVariable,
  renderFollowupText,
} from '@/supabase/functions/_shared/followup-text'
import {
  DURATION_OPTIONS,
  HORIZON_OPTIONS,
  NOTICE_OPTIONS,
  RANGE_OPTIONS,
  agendaSettingsError,
  computeOffers,
  normalizeAgenda,
  type AgendaSettings,
} from '@/supabase/functions/_shared/agenda-slots'
import { formatDuration } from '@/lib/audio'
import type { AssistedFollowup, Assistant, AssistantSettings, CannedResponse, ContextDocument, FollowupItem } from '@/lib/types'
import { AudioField } from '@/components/ui/audio-field'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, FieldHint, FieldError } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/dialog'
import { InfoTip, Skeleton, Switch } from '@/components/ui/misc'
import { EmptyState } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function useSaveSettings(assistant: Assistant | undefined) {
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

function AccountRow({
  provider,
  name,
  emptyText,
  startPath,
  startBody,
  disconnectPath,
  disconnectMessage,
  beforeConnect,
}: {
  provider: 'calendly' | 'google'
  name: string
  emptyText: string
  startPath: string
  startBody: () => Record<string, unknown>
  disconnectPath: string
  disconnectMessage: string
  beforeConnect?: () => Promise<void>
}) {
  const { data: channels } = useChannelAccounts()
  const toast = useToast()
  const invalidate = useInvalidate()
  const viewingAs = useViewAsTargetId() !== null
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const channel = channels?.find((c) => c.provider === provider)

  async function connect() {
    setBusy(true)
    try {
      await beforeConnect?.()
      const { auth_url } = await callFunction<{ auth_url: string }>(startPath, { body: startBody() })
      window.location.href = auth_url
    } catch {
      toast(`Impossible de démarrer la connexion ${name}.`, 'error')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!channel) return
    setBusy(true)
    try {
      await callFunction(disconnectPath, { body: { channel_account_id: channel.id } })
      toast(`${name} déconnecté.`)
      invalidate('channel-accounts')
    } catch {
      toast('La déconnexion a échoué.', 'error')
    }
    setBusy(false)
    setConfirmOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-border px-3 py-2.5">
      <span className="text-sm font-medium">{name}</span>
      {channel ? (
        <>
          <span className="min-w-0 truncate text-sm text-muted">{channel.handle ?? channel.label ?? 'Compte relié'}</span>
          {channel.status === 'connected' ? (
            <Badge tone="success">Connecté</Badge>
          ) : (
            <Badge tone="warning">Connexion expirée</Badge>
          )}
          {viewingAs ? null : (
            <div className="ml-auto flex gap-2">
              {channel.status !== 'connected' ? (
                <Button type="button" size="sm" onClick={connect} disabled={busy}>
                  <RefreshCw size={14} />
                  Reconnecter
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmOpen(true)} disabled={busy}>
                Déconnecter
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <span className="text-sm text-muted">{emptyText}</span>
          {viewingAs ? null : (
            <Button type="button" size="sm" className="ml-auto" onClick={connect} disabled={busy}>
              {busy ? 'Ouverture…' : `Relier ${name}`}
            </Button>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={disconnect}
        title={`Déconnecter ${name}`}
        message={disconnectMessage}
        confirmLabel="Déconnecter"
        danger
        loading={busy}
      />
    </div>
  )
}

function ProfileSection({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const s = assistant.settings
  const [productName, setProductName] = useState(s.product?.name ?? '')
  const [context, setContext] = useState(s.context ?? '')
  const [qualification, setQualification] = useState(s.qualification ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    save({
      product: { name: productName.trim() },
      context: context.trim(),
      qualification: qualification.trim(),
    })
  }

  return (
    <Card>
      <CardHeader
        title="Ce que vous vendez"
        description="Ce que l'assistant sait de votre offre."
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
            <Label htmlFor="context">Présentation de l'offre</Label>
            <Textarea
              id="context"
              rows={6}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Votre méthode, vos clients types, vos prix, vos arguments, ce que l'assistant doit savoir."
            />
            <FieldHint>Plus c'est précis, plus les réponses sont justes.</FieldHint>
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

const MAX_SECONDARY_LINKS = 4

function SecondaryLinksField({ assistant }: { assistant: Assistant }) {
  const { save } = useSaveSettings(assistant)
  const [links, setLinks] = useState(assistant.settings.stop_condition?.secondary_links ?? [])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({})

  async function persist(next: typeof links) {
    setLinks(next)
    await save((fresh) => ({ stop_condition: { ...fresh.stop_condition, secondary_links: next } }))
  }

  function validateAndPersist(next: typeof links) {
    const errors: Record<string, string> = {}
    for (const l of next) {
      if (l.link.trim() && !/^https?:\/\/\S+$/.test(l.link.trim())) {
        errors[l.id] = 'Le lien doit commencer par http:// ou https://'
      }
    }
    setLinkErrors(errors)
    if (Object.keys(errors).length === 0) persist(next)
  }

  function addLink() {
    if (links.length >= MAX_SECONDARY_LINKS) return
    setLinks((l) => [...l, { id: crypto.randomUUID(), condition: '', link: '' }])
  }

  function editLink(id: string, patch: Partial<{ condition: string; link: string }>) {
    setLinks((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  async function confirmRemove() {
    if (!deleteTarget) return
    const id = deleteTarget
    setDeleteTarget(null)
    await persist(links.filter((x) => x.id !== id))
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div>
        <Label className="mb-0">Liens secondaires (optionnel)</Label>
        <FieldHint>Proposés à la place du lien ou de l'appel quand leur condition correspond mieux.</FieldHint>
      </div>
      {links.map((l) => (
        <div key={l.id} className="space-y-1.5 rounded-[10px] border border-border p-3">
          <div className="flex items-center gap-2">
            <Input
              value={l.condition}
              placeholder="Condition : quand proposer ce lien"
              onChange={(e) => editLink(l.id, { condition: e.target.value })}
              onBlur={() => validateAndPersist(links)}
              className="flex-1"
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(l.id)}>
              Supprimer
            </Button>
          </div>
          <Input
            value={l.link}
            placeholder="https://..."
            onChange={(e) => editLink(l.id, { link: e.target.value })}
            onBlur={() => validateAndPersist(links)}
          />
          <FieldError>{linkErrors[l.id]}</FieldError>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={addLink}
        disabled={links.length >= MAX_SECONDARY_LINKS}
      >
        <Plus size={14} className="mr-1" />
        {links.length >= MAX_SECONDARY_LINKS ? 'Maximum atteint' : 'Ajouter un lien'}
      </Button>
      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmRemove}
        title="Supprimer ce lien"
        message="Il ne sera plus proposé par l'assistant."
        confirmLabel="Supprimer"
        danger
      />
    </div>
  )
}

const selectClass =
  'h-10 w-full rounded-[10px] border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'

// Lundi 8 h : l'aperçu montre des jours de semaine sans dépendre de l'agenda réel.
const PREVIEW_NOW = Date.UTC(2026, 0, 5, 7, 0)

// Sans date, deux plages le même jour de semaine se distinguent par « suivant ».
function previewLabels(offers: { label: string }[]) {
  const seen = new Map<string, number>()
  return offers.map(({ label }) => {
    const day = label.split(' ')[0]
    const count = seen.get(day) ?? 0
    seen.set(day, count + 1)
    return count === 0 ? label : label.replace(day, `${day} suivant`)
  })
}

function agendaPreview(agenda: AgendaSettings): { steps: string[]; possible: boolean } {
  if (agenda.first_offer === 0) return { steps: ['Demande au prospect le moment qui l’arrange.'], possible: true }
  const offers = computeOffers({ now: PREVIEW_NOW, tz: 'Europe/Paris', settings: agenda, busy: [], withDate: false })
  const labels = previewLabels(offers)
  const first = labels.slice(0, agenda.first_offer)
  if (first.length === 0) return { steps: ['Aucune plage possible avec ces réglages.'], possible: false }
  const steps = [`Propose ${first.join(' ou ')}.`]
  for (const extra of labels.slice(agenda.first_offer)) steps.push(`Si ça ne va pas : ${extra}.`)
  steps.push('Sinon, demande le moment qui l’arrange.')
  return { steps, possible: true }
}

function GoalSection({
  assistant,
  allowCalendly,
  allowCalendar,
}: {
  assistant: Assistant
  allowCalendly: boolean
  allowCalendar: boolean
}) {
  const { save, saving } = useSaveSettings(assistant)
  const { data: channels } = useChannelAccounts()
  const google = channels?.find((c) => c.provider === 'google')
  const s = assistant.settings
  const [stopText, setStopText] = useState(s.stop_condition?.text ?? '')
  const [stopLink, setStopLink] = useState(s.stop_condition?.link ?? '')
  // Les drapeaux arrivent après l'assistant : le mode affiché suit le réglage tant que rien n'est choisi.
  const [modeChoice, setMode] = useState<'link' | 'calendar' | null>(null)
  const mode = modeChoice ?? (allowCalendar && s.booking?.mode === 'calendar' ? 'calendar' : 'link')
  const [agenda, setAgenda] = useState<AgendaSettings>(normalizeAgenda(s.booking?.calendar))
  const [linkError, setLinkError] = useState('')
  const agendaError = mode === 'calendar' ? agendaSettingsError(agenda) : null
  const preview = useMemo(() => agendaPreview(agenda), [agenda])

  function patchAgenda(patch: Partial<AgendaSettings>) {
    setAgenda((current) => {
      const next = { ...current, ...patch }
      // Une plage plus courte que l'appel n'a pas de sens : on l'élargit d'office.
      if (next.range_hours * 60 < next.duration_min) next.range_hours = Math.ceil(next.duration_min / 60)
      return next
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setLinkError('')
    if (mode === 'link' && stopLink.trim() && !/^https?:\/\/\S+$/.test(stopLink.trim())) {
      setLinkError('Le lien doit commencer par http:// ou https://')
      return
    }
    if (agendaError) return
    save((fresh) => ({
      stop_condition: { ...fresh.stop_condition, text: stopText.trim(), link: stopLink.trim() },
      // Module masqué : le mode déjà enregistré n'est pas touché.
      booking: { ...fresh.booking, mode: allowCalendar ? mode : fresh.booking?.mode ?? 'link', calendar: agenda },
    }))
  }

  // La connexion quitte la page : le choix du mode agenda est enregistré avant.
  async function saveCalendarChoice() {
    await save((fresh) => ({
      booking: { ...fresh.booking, mode: 'calendar', ...(agendaError ? {} : { calendar: agenda }) },
    }))
  }

  const modes: { value: 'link' | 'calendar'; label: string }[] = [
    { value: 'link', label: 'Par lien' },
    ...(allowCalendar ? [{ value: 'calendar' as const, label: 'Dans mon agenda Google' }] : []),
  ]

  return (
    <Card>
      <CardHeader title="Objectif et rendez-vous" description="Ce que l'assistant cherche à obtenir, et comment le prospect réserve." />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="stopText">Objectif visé</Label>
            <Textarea
              id="stopText"
              rows={2}
              value={stopText}
              onChange={(e) => setStopText(e.target.value)}
              placeholder="Amener le prospect à réserver un appel découverte."
            />
          </div>

          {modes.length > 1 ? (
            <div>
              <Label id="bookingModeLabel">Le prospect réserve</Label>
              <div role="radiogroup" aria-labelledby="bookingModeLabel" className="inline-flex rounded-[10px] border border-border bg-bg p-1">
                {modes.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.value}
                    onClick={() => setMode(m.value)}
                    className={
                      mode === m.value
                        ? 'rounded-[8px] bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-soft'
                        : 'rounded-[8px] px-3 py-1.5 text-sm font-medium text-muted hover:text-ink'
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === 'link' ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="stopLink">Lien envoyé au prospect</Label>
                <Input
                  id="stopLink"
                  value={stopLink}
                  onChange={(e) => setStopLink(e.target.value)}
                  placeholder="https://calendly.com/votre-lien"
                />
                <FieldError>{linkError}</FieldError>
              </div>
              {allowCalendly ? (
                <AccountRow
                  provider="calendly"
                  name="Calendly"
                  emptyText="Pour suivre les réservations dans vos conversations."
                  startPath="calendly-oauth/start"
                  startBody={() => ({ return_to: window.location.href })}
                  disconnectPath="calendly-oauth/disconnect"
                  disconnectMessage="Les rendez-vous déjà réservés restent visibles, mais les nouvelles réservations ne seront plus suivies."
                />
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <AccountRow
                provider="google"
                name="Google Agenda"
                emptyText="À relier pour que l'assistant réserve à votre place."
                startPath="google-oauth/start"
                startBody={() => ({ return_path: window.location.pathname })}
                disconnectPath="google-oauth/disconnect"
                disconnectMessage="L'assistant ne réservera plus d'appel et enverra votre lien à la place. Les rendez-vous déjà pris restent dans votre agenda."
                beforeConnect={saveCalendarChoice}
              />
              {!google ? (
                <FieldHint>Tant que Google Agenda n'est pas relié, l'assistant envoie votre lien à la place.</FieldHint>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label htmlFor="agendaDuration">Durée de l'appel</Label>
                  <select
                    id="agendaDuration"
                    className={selectClass}
                    value={agenda.duration_min}
                    onChange={(e) => patchAgenda({ duration_min: Number(e.target.value) })}
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d < 60 ? `${d} min` : d === 60 ? '1 h' : '1 h 30'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="agendaRange">Largeur d'une plage</Label>
                  <select
                    id="agendaRange"
                    className={selectClass}
                    value={agenda.range_hours}
                    onChange={(e) => patchAgenda({ range_hours: Number(e.target.value) })}
                  >
                    {RANGE_OPTIONS.filter((h) => h * 60 >= agenda.duration_min).map((h) => (
                      <option key={h} value={h}>
                        {h} h
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="agendaFirst">Plages proposées d'abord</Label>
                  <select
                    id="agendaFirst"
                    className={selectClass}
                    value={agenda.first_offer}
                    onChange={(e) => patchAgenda({ first_offer: Number(e.target.value) })}
                  >
                    <option value={0}>Aucune, demander</option>
                    <option value={1}>1 plage</option>
                    <option value={2}>2 plages</option>
                    <option value={3}>3 plages</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="agendaExtra">Si le prospect refuse</Label>
                  <select
                    id="agendaExtra"
                    className={selectClass}
                    value={agenda.extra_offers}
                    disabled={agenda.first_offer === 0}
                    onChange={(e) => patchAgenda({ extra_offers: Number(e.target.value) })}
                  >
                    <option value={0}>Demander directement</option>
                    <option value={1}>1 autre plage</option>
                    <option value={2}>2 autres plages</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="agendaNotice">Jamais avant</Label>
                  <select
                    id="agendaNotice"
                    className={selectClass}
                    value={agenda.notice_hours}
                    onChange={(e) => patchAgenda({ notice_hours: Number(e.target.value) })}
                  >
                    {NOTICE_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {h === 24 ? '24 h (le lendemain)' : `${h} h`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="agendaHorizon">Jamais au-delà de</Label>
                  <select
                    id="agendaHorizon"
                    className={selectClass}
                    value={agenda.horizon_days}
                    onChange={(e) => patchAgenda({ horizon_days: Number(e.target.value) })}
                  >
                    {HORIZON_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} jours
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label id="callHoursLabel">Quand vous prenez des appels</Label>
                <DaysHoursField
                  labelledBy="callHoursLabel"
                  days={agenda.days}
                  onDays={(days) => patchAgenda({ days })}
                  start={agenda.start}
                  onStart={(start) => patchAgenda({ start })}
                  end={agenda.end}
                  onEnd={(end) => patchAgenda({ end })}
                />
                <FieldHint>
                  Votre agenda principal est lu. Un événement marqué « Disponible » ne bloque pas. « Jamais avant » et « jamais
                  au-delà » encadrent aussi une heure proposée par le prospect.
                </FieldHint>
              </div>
              <div className="rounded-[10px] bg-bg px-3 py-2.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                  <CalendarDays size={14} />
                  Ce que fait l'assistant, par exemple
                </p>
                <ol className="space-y-1 text-sm">
                  {preview.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                  {preview.possible && !agendaError ? (
                    <li className="flex gap-2">
                      <span className="text-muted">{preview.steps.length + 1}.</span>
                      <span>Fait préciser l'heure, demande l'e-mail, réserve avec un lien Meet envoyé en message.</span>
                    </li>
                  ) : null}
                </ol>
              </div>
              <FieldError>{agendaError ?? ''}</FieldError>
            </div>
          )}

          <SecondaryLinksField assistant={assistant} />
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving || Boolean(agendaError)}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

// Deux menus plutôt que le champ natif : il s'affiche en 12 h chez un navigateur anglophone.
function TimeSelect({
  value,
  onChange,
  disabled,
  label = 'Heure',
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label?: string
}) {
  const [hour, minute] = value.split(':')
  const selectClass =
    'h-10 rounded-[10px] border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-50'
  return (
    <div className="flex items-center gap-1">
      <select
        disabled={disabled}
        aria-label={`${label}, heures`}
        value={hour ?? '09'}
        onChange={(e) => onChange(`${e.target.value}:${minute ?? '00'}`)}
        className={selectClass}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h} h
          </option>
        ))}
      </select>
      <select
        disabled={disabled}
        aria-label={`${label}, minutes`}
        value={minute ?? '00'}
        onChange={(e) => onChange(`${hour ?? '09'}:${e.target.value}`)}
        className={selectClass}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}

function DaysHoursField({
  days,
  onDays,
  start,
  onStart,
  end,
  onEnd,
  labelledBy,
}: {
  days: boolean[]
  onDays: (days: boolean[]) => void
  start: string
  onStart: (value: string) => void
  end: string
  onEnd: (value: string) => void
  labelledBy?: string
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex flex-wrap gap-2">
        {DAY_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={days[i]}
            onClick={() => onDays(days.map((v, j) => (j === i ? !v : v)))}
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
          <Label>De</Label>
          <TimeSelect value={start} onChange={onStart} label="Heure de début" />
        </div>
        <div>
          <Label>À</Label>
          <TimeSelect value={end} onChange={onEnd} label="Heure de fin" />
        </div>
      </div>
    </div>
  )
}

function ScheduleSection({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const schedule = assistant.settings.schedule ?? {}
  const [alwaysOn, setAlwaysOn] = useState(schedule.always_on ?? false)
  const [days, setDays] = useState<boolean[]>(
    schedule.days && schedule.days.length === 7 ? schedule.days : Array(7).fill(true),
  )
  const [start, setStart] = useState(schedule.start ?? '09:00')
  const [end, setEnd] = useState(schedule.end ?? '20:00')
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!alwaysOn) {
      if (!start || !end) {
        setError('Renseignez une heure de début et une heure de fin.')
        return
      }
      if (start >= end) {
        setError("L'heure de début doit précéder l'heure de fin.")
        return
      }
      if (!days.some(Boolean)) {
        setError('Sélectionnez au moins un jour actif.')
        return
      }
    }
    save({ schedule: { ...schedule, always_on: alwaysOn, days, start, end } })
  }

  return (
    <Card>
      <CardHeader title="Quand l'assistant répond" description="Hors de ces horaires, il attend l'ouverture suivante." />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label className="mb-0">Toujours actif (24h/24, 7j/7)</Label>
            <Switch checked={alwaysOn} onChange={setAlwaysOn} label="Toujours actif" />
          </div>
          {!alwaysOn ? (
            <DaysHoursField days={days} onDays={setDays} start={start} onStart={setStart} end={end} onEnd={setEnd} />
          ) : null}
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

function AudienceSection({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const audience = assistant.settings.audience ?? {}
  const [mode, setMode] = useState<'all' | 'allowlist' | 'blocklist'>(audience.mode ?? 'all')
  const [handlesText, setHandlesText] = useState((audience.handles ?? []).join('\n'))
  const [error, setError] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const handles = handlesText
      .split('\n')
      .map((h) => h.trim().replace(/^@/, ''))
      .filter(Boolean)
    if (mode !== 'all' && handles.length === 0) {
      setError('Ajoutez au moins un compte, ou repassez en Tout le monde.')
      return
    }
    save({ audience: { mode, handles } })
  }

  return (
    <Card>
      <CardHeader
        title="Qui reçoit une réponse"
        description="Par défaut, l'assistant répond à tout le monde."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: 'all', label: 'Tout le monde' },
                { value: 'allowlist', label: 'Seulement ces comptes' },
                { value: 'blocklist', label: 'Sauf ces comptes' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={
                  mode === opt.value
                    ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white'
                    : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted'
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          {mode !== 'all' ? (
            <div>
              <Label htmlFor="audienceHandles">Comptes Instagram concernés</Label>
              <Textarea
                id="audienceHandles"
                rows={4}
                value={handlesText}
                onChange={(e) => setHandlesText(e.target.value)}
                placeholder={'un compte par ligne, par exemple\nmon_compte_test'}
              />
              <FieldHint>Sans le @, un compte par ligne.</FieldHint>
            </div>
          ) : null}
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

const TONE_PRESETS = [
  { value: 'normal', label: 'Naturel' },
  { value: 'amical', label: 'Amical' },
  { value: 'pro', label: 'Professionnel' },
  { value: 'fun', label: 'Fun' },
] as const

const TONE_QUESTIONS: { key: string; question: string }[] = [
  { key: 'q1', question: 'Salut, je suis tombé sur ton contenu, tu proposes quoi exactement ?' },
  { key: 'q2', question: 'Honnêtement je galère depuis un moment et je ne sais pas par où commencer.' },
  { key: 'q3', question: 'Ça a l’air bien, mais je ne sais pas si c’est vraiment pour moi.' },
  { key: 'q4', question: 'Ça coûte combien ? Et est-ce que ça vaut vraiment le coup ?' },
  { key: 'q5', question: 'Vas droit au but, c’est quoi l’intérêt concret pour moi ?' },
  { key: 'q6', question: 'Ok, ça me parle, comment je fais pour rejoindre ?' },
]

const MAX_CUSTOM_TONE_QUESTIONS = 6

function ToneSection({ assistant, allowCustom }: { assistant: Assistant; allowCustom: boolean }) {
  const { save } = useSaveSettings(assistant)
  const toast = useToast()
  const invalidate = useInvalidate()
  const [preset, setPreset] = useState(assistant.settings.tone?.preset ?? 'normal')
  const [answers, setAnswers] = useState<Record<string, string>>(assistant.custom_tone_answers ?? {})
  const savedAnswersRef = useRef(JSON.stringify(assistant.custom_tone_answers ?? {}))
  const [generating, setGenerating] = useState(false)
  const [customQuestions, setCustomQuestions] = useState(assistant.custom_tone_questions)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const [touchedSinceGenerate, setTouchedSinceGenerate] = useState(false)

  useEffect(() => {
    if (mountedRef.current) setTouchedSinceGenerate(true)
    mountedRef.current = true
  }, [answers, customQuestions])

  // Les réponses sont gardées en base : les réécrire à chaque génération décourageait de régénérer.
  async function persistAnswers(next: Record<string, string>) {
    const serialized = JSON.stringify(next)
    if (serialized === savedAnswersRef.current || isViewAsReadOnly()) return
    const { error } = await createClient().from('assistants').update({ custom_tone_answers: next }).eq('id', assistant.id)
    if (error) {
      toast('Réponses non enregistrées. Réessayez.', 'error')
      return
    }
    savedAnswersRef.current = serialized
  }

  const latestAnswersRef = useRef(answers)
  useEffect(() => {
    latestAnswersRef.current = answers
    const timer = setTimeout(() => void persistAnswers(answers), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers])
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void persistAnswers(latestAnswersRef.current)
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function choosePreset(value: string) {
    setPreset(value)
    if (value !== 'custom') save({ tone: { preset: value } })
  }

  function addCustomQuestion() {
    if (customQuestions.length >= MAX_CUSTOM_TONE_QUESTIONS) return
    setCustomQuestions((qs) => [...qs, { id: crypto.randomUUID(), question: '' }])
  }

  function editCustomQuestion(id: string, question: string) {
    setCustomQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, question } : q)))
  }

  async function persistCustomQuestions(next: typeof customQuestions) {
    setCustomQuestions(next)
    await save({}, { custom_tone_questions: next })
  }

  async function confirmRemoveCustomQuestion() {
    if (!deleteTarget) return
    const id = deleteTarget
    setDeleteTarget(null)
    await persistCustomQuestions(customQuestions.filter((q) => q.id !== id))
    setAnswers((a) => {
      const next = { ...a }
      delete next[id]
      return next
    })
  }

  async function generate() {
    setGenerating(true)
    try {
      await callFunction('generate-custom-tone', { body: { assistant_id: assistant.id, answers } })
      await save({ tone: { preset: 'custom' } })
      setTouchedSinceGenerate(false)
      toast('Ton personnalisé généré et activé.')
      invalidate('assistants')
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      if (message === 'invalid_answers') {
        toast('Complétez toutes les réponses, avec au moins 200 caractères chacune.', 'error')
      } else if (message === 'no_api_key') {
        toast('Aucune clé API configurée : rendez-vous dans Réglages.', 'error')
      } else {
        toast('La génération a échoué. Réessayez.', 'error')
      }
    }
    setGenerating(false)
  }

  const MIN_ANSWER_LENGTH = 200
  const incompleteFixed = TONE_QUESTIONS.filter((q) => (answers[q.key] ?? '').trim().length < MIN_ANSWER_LENGTH).length
  const incompleteCustom = customQuestions.filter((q) => (answers[q.id] ?? '').trim().length < MIN_ANSWER_LENGTH).length
  const emptyCustomTitles = customQuestions.some((q) => q.question.trim().length === 0)
  const incompleteCount = incompleteFixed + incompleteCustom
  const answersReady = incompleteCount === 0 && !emptyCustomTitles
  const options = allowCustom ? [...TONE_PRESETS, { value: 'custom', label: 'Personnalisé' } as const] : TONE_PRESETS

  return (
    <Card>
      <CardHeader title="Ton de l'assistant" description="Comment l'assistant formule ses réponses." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {options.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => choosePreset(p.value)}
              className={
                preset === p.value
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted'
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && allowCustom ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm text-muted">
              Répondez avec vos mots, 200 caractères minimum. Seul votre style est repris, et tout s'enregistre au fil de la saisie.
            </p>
            {!assistant.custom_tone ? (
              <Badge tone="muted">Pas encore généré</Badge>
            ) : touchedSinceGenerate ? (
              <Badge tone="warning">Modifié depuis, pas encore régénéré</Badge>
            ) : (
              <Badge tone="success">
                {assistant.custom_tone_generated_at
                  ? `Ton généré le ${formatDateTime(assistant.custom_tone_generated_at)}`
                  : 'Ton généré'}
              </Badge>
            )}
            {TONE_QUESTIONS.map((q) => {
              const length = (answers[q.key] ?? '').trim().length
              const ok = length >= MIN_ANSWER_LENGTH
              return (
                <div key={q.key}>
                  <Label htmlFor={q.key}>{q.question}</Label>
                  <Textarea
                    id={q.key}
                    rows={3}
                    value={answers[q.key] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                  />
                  <FieldHint className={ok ? 'text-success' : undefined}>
                    {length}/{MIN_ANSWER_LENGTH} caractères
                  </FieldHint>
                </div>
              )
            })}
            {customQuestions.map((q) => {
              const length = (answers[q.id] ?? '').trim().length
              const ok = length >= MIN_ANSWER_LENGTH
              return (
                <div key={q.id} className="space-y-1.5 rounded-[10px] border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={q.question}
                      placeholder="Votre question"
                      onChange={(e) => editCustomQuestion(q.id, e.target.value)}
                      onBlur={() => persistCustomQuestions(customQuestions)}
                      className="flex-1"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(q.id)}>
                      Supprimer
                    </Button>
                  </div>
                  <Textarea
                    rows={3}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                  <FieldHint className={ok ? 'text-success' : undefined}>
                    {length}/{MIN_ANSWER_LENGTH} caractères
                  </FieldHint>
                </div>
              )
            })}
            <Button
              size="sm"
              variant="secondary"
              onClick={addCustomQuestion}
              disabled={customQuestions.length >= MAX_CUSTOM_TONE_QUESTIONS}
            >
              <Plus size={14} className="mr-1" />
              {customQuestions.length >= MAX_CUSTOM_TONE_QUESTIONS ? 'Maximum atteint' : 'Ajouter une question'}
            </Button>
          </div>
        ) : null}
      </CardBody>
      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmRemoveCustomQuestion}
        title="Supprimer cette question"
        message="Elle ne sera plus utilisée pour générer votre ton personnalisé."
        confirmLabel="Supprimer"
        danger
      />
      {preset === 'custom' && allowCustom ? (
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3.5">
          {emptyCustomTitles ? (
            <p className="text-xs text-muted">Donnez un intitulé à chaque question ajoutée.</p>
          ) : incompleteCount > 0 ? (
            <p className="text-xs text-muted">
              Encore {incompleteCount} réponse{incompleteCount > 1 ? 's' : ''} à compléter (200 caractères minimum).
            </p>
          ) : null}
          <Button onClick={generate} disabled={generating || !answersReady}>
            {generating ? 'Génération…' : 'Générer mon ton'}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

// Au-delà, un document encore « en traitement » a été interrompu côté serveur.
const STALE_IMPORT_MS = 2 * 60 * 1000

// Un message par cause : sans raison affichée, l'utilisateur ne peut que signaler « ça ne marche pas ».
function documentFormatError(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['doc', 'pages', 'odt', 'rtf'].includes(ext)) return 'Format non accepté : enregistrez-le en .docx ou en PDF puis réimportez-le.'
  return 'Format non accepté : fichiers .txt, .md, .pdf ou .docx uniquement.'
}

function documentUploadError(message: string) {
  if (/invalid key/i.test(message)) return 'Nom de fichier refusé : renommez-le sans caractères spéciaux.'
  if (/too large|exceed|payload/i.test(message)) return 'Fichier trop lourd : 5 Mo maximum.'
  if (/fetch|network|timeout|load failed/i.test(message)) return 'Connexion interrompue : réessayez.'
  return 'Envoi impossible pour le moment : réessayez dans un instant.'
}

function ContextDocumentsSection() {
  const toast = useToast()
  const invalidate = useInvalidate()
  const effectiveUserId = useEffectiveUserId()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: docs, isLoading } = useQuery({
    queryKey: ['context-documents', effectiveUserId],
    enabled: effectiveUserId !== null,
    queryFn: async (): Promise<ContextDocument[]> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('context_documents')
        .select('id, title, status, char_count, source_char_count, error_message, created_at')
        .eq('user_id', effectiveUserId!)
        .order('created_at', { ascending: true })
      return (data ?? []) as ContextDocument[]
    },
  })
  const { data: quota } = useQuery({
    queryKey: ['context-documents-quota'],
    queryFn: () => callFunction<{ max: number; used: number }>('context-documents/quota', { method: 'GET' }),
  })

  async function upload(file: File) {
    if (!documentKind(file.name)) {
      toast(documentFormatError(file.name), 'error')
      return
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast(`Fichier trop lourd (${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo) : 5 Mo maximum.`, 'error')
      return
    }
    setUploading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const path = `${user!.id}/${crypto.randomUUID()}-${storageSafeName(file.name)}`
    const { error: uploadError } = await supabase.storage.from('context-documents').upload(path, file)
    if (uploadError) {
      toast(documentUploadError(uploadError.message), 'error')
      setUploading(false)
      return
    }
    try {
      const res = await callFunction<{ status: string; message?: string }>('context-documents/register', {
        body: { storage_path: path, title: file.name, mime_type: file.type },
      })
      toast(
        res.status === 'ready' ? 'Document ajouté.' : res.message ?? 'Aucun texte lisible dans ce fichier.',
        res.status === 'ready' ? 'success' : 'error',
      )
    } catch (e) {
      toast(
        e instanceof Error && e.message === 'quota_reached'
          ? `Limite atteinte (${quota?.max ?? 0} documents) : supprimez-en un pour en ajouter.`
          : 'Import interrompu : réessayez.',
        'error',
      )
    }
    setUploading(false)
    invalidate('context-documents', 'context-documents-quota')
  }

  async function remove(id: number) {
    try {
      await callFunction(`context-documents/${id}`, { method: 'DELETE' })
      toast('Document supprimé.')
      invalidate('context-documents', 'context-documents-quota')
    } catch {
      toast('La suppression a échoué.', 'error')
    }
  }

  const atQuota = quota ? quota.used >= quota.max : false
  // Même partage que l'assistant : seuls les documents prêts se répartissent la place.
  const shares = useMemo(() => {
    const ready = (docs ?? []).filter((d) => d.status === 'ready')
    const computed = readShares(ready.map((d) => ({ length: d.char_count ?? 0, sourceLength: d.source_char_count })))
    return new Map(ready.map((d, i) => [d.id, computed[i]]))
  }, [docs])
  const somePartial = [...shares.values()].some((share) => !share.complete)

  return (
    <Card>
      <CardHeader
        title="Documents de contexte"
        description="Vos textes longs sur l'offre, lus par l'assistant."
      />
      <CardBody className="space-y-3">
        {quota ? (
          <p className="text-xs text-muted">
            {quota.used} / {quota.max} document{quota.max > 1 ? 's' : ''} utilisé{quota.used > 1 ? 's' : ''}
            {quota.max === 0 ? ', nécessite un abonnement actif' : ' · .txt, .md, .pdf, .docx · 5 Mo max'}
          </p>
        ) : null}
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (docs?.length ?? 0) === 0 ? (
          <EmptyState title="Aucun document" description="Ajoutez un document pour enrichir le contexte de l'assistant." />
        ) : (
          <div className="divide-y divide-border/60 rounded-[10px] border border-border">
            {docs!.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{d.title}</span>
                <div className="flex items-center gap-2">
                  {d.status === 'ready' ? (
                    shares.get(d.id)?.complete === false ? (
                      <Badge tone="warning">Lu en partie · {shares.get(d.id)!.percent} %</Badge>
                    ) : (
                      <Badge tone="success">Lu en entier</Badge>
                    )
                  ) : d.status === 'error' || Date.now() - Date.parse(d.created_at) > STALE_IMPORT_MS ? (
                    <span className="inline-flex items-center gap-1">
                      <Badge tone="danger">Erreur</Badge>
                      <InfoTip
                        text={
                          d.status === 'error' && d.error_message
                            ? d.error_message
                            : 'Import interrompu : supprimez ce document et réimportez-le.'
                        }
                      />
                    </span>
                  ) : (
                    <Badge tone="muted">Traitement…</Badge>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {somePartial ? (
          <FieldHint>Vos documents dépassent la place disponible. Raccourcissez le plus long pour qu'il soit lu en entier.</FieldHint>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || atQuota}>
            {uploading ? 'Envoi…' : 'Ajouter un document'}
          </Button>
          {atQuota && quota && quota.max > 0 ? (
            <span className="text-xs text-muted">Limite atteinte : supprimez un document pour en ajouter.</span>
          ) : null}
        </div>
      </CardBody>
    </Card>
  )
}

const MAX_FOLLOWUPS = 3
const MAX_VARIANTS = 3
const MIN_DELAY_MINUTES = 15
const MAX_DELAY_MINUTES = 23 * 60 + 45
const pillClass = (active: boolean) =>
  active
    ? 'rounded-full bg-primary px-3 py-1 text-sm text-white'
    : 'rounded-full border border-border px-3 py-1 text-sm text-muted'

// 60 minutes saisies basculent sur l'heure suivante, la valeur stockée restant un nombre
// de minutes. Rien à corriger à la saisie, l'affichage se renormalise au rendu.
function DelaySelect({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  const inputClass =
    'h-10 w-16 rounded-[10px] border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'
  const part = (raw: string) => Math.max(0, Math.floor(Number(raw) || 0))
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={23}
        aria-label="Heures"
        value={hour}
        onChange={(e) => onChange(part(e.target.value) * 60 + minute)}
        className={inputClass}
      />
      <span className="text-sm text-muted">h</span>
      <input
        type="number"
        min={0}
        max={59}
        aria-label="Minutes"
        value={minute}
        onChange={(e) => onChange(hour * 60 + part(e.target.value))}
        className={inputClass}
      />
      <span className="text-sm text-muted">min</span>
    </div>
  )
}

function newFollowup(): FollowupItem {
  return { id: crypto.randomUUID(), delay_minutes: 120, kind: 'text', variants: [''] }
}

function formatDelay(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

function FollowupTimeline({ delays }: { delays: number[] }) {
  const offsets = cumulativeOffsets(delays)
  const late = offsets.findIndex((offset) => offset > MESSAGING_WINDOW_MINUTES)
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted">Quand partent vos relances</p>
      <div className="relative ml-1 mr-10 h-9">
        <div className="absolute inset-x-0 top-[9px] h-1 rounded-full bg-primary/15" />
        <span className="absolute -right-10 top-1 text-[11px] tabular-nums text-muted">24 h</span>
        {offsets.map((offset, i) => (
          <span
            key={i}
            className={`absolute top-[5px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-surface ${offset > MESSAGING_WINDOW_MINUTES ? 'bg-warning' : 'bg-primary'}`}
            style={{ left: `${Math.min(100, (offset / MESSAGING_WINDOW_MINUTES) * 100)}%` }}
          >
            <span className="absolute left-1/2 top-3.5 -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-ink">
              {formatDelay(offset)}
            </span>
          </span>
        ))}
      </div>
      {late >= 0 ? (
        <p className="text-xs text-amber-700">
          La relance {late + 1} tomberait plus de 24 h après votre message : Instagram ne la laissera pas partir.
        </p>
      ) : (
        <FieldHint>Compté depuis votre dernier message. Si l’assistant a répondu tard, la limite arrive plus tôt.</FieldHint>
      )}
    </div>
  )
}

function VariantField({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function insertName() {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + NAME_VARIABLE_TEMPLATE + value.slice(end))
    requestAnimationFrame(() => {
      const position = start + NAME_VARIABLE_TEMPLATE.length
      el?.focus()
      el?.setSelectionRange(position, position)
    })
  }

  return (
    <div className="space-y-1">
      <Textarea ref={ref} rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        {hasNameVariable(value) ? (
          <p className="min-w-0 flex-1 text-xs text-muted">
            Avec un prénom : « {renderFollowupText(value, 'Julien')} ». Sans : « {renderFollowupText(value, null)} ».
          </p>
        ) : (
          <span />
        )}
        <button type="button" onClick={insertName} className="shrink-0 text-xs text-primary hover:underline">
          Insérer le prénom
        </button>
      </div>
    </div>
  )
}

function followupPreview(item: FollowupItem) {
  if (item.kind === 'audio') {
    return item.media_path ? `Vocal${item.media_duration_ms ? ` · ${formatDuration(item.media_duration_ms)}` : ''}` : 'Vocal à enregistrer'
  }
  const first = (item.variants ?? []).find((v) => v.trim())
  return first ? renderFollowupText(first, null) : 'Message à écrire'
}

const MAX_ASSISTED = 3
const ASSISTED_DAYS = [2, 3, 4, 5, 6]

function FollowupsSection({ assistant, allowAssisted }: { assistant: Assistant; allowAssisted: boolean }) {
  const { save, saving } = useSaveSettings(assistant)
  const initial = assistant.settings.followups
  const [assisted, setAssisted] = useState<AssistedFollowup[]>(initial?.assisted ?? [])
  const [assistedDeleteTarget, setAssistedDeleteTarget] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [afterOwn, setAfterOwn] = useState(initial?.after_own_message ?? false)
  const [items, setItems] = useState<FollowupItem[]>(
    initial?.items?.length ? initial.items : [newFollowup()],
  )
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  function edit(id: string, patch: Partial<FollowupItem>) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function editVariant(id: string, index: number, text: string) {
    setItems((list) =>
      list.map((it) =>
        it.id === id ? { ...it, variants: (it.variants ?? ['']).map((v, i) => (i === index ? text : v)) } : it,
      ),
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = items.map((it) => ({
      ...it,
      variants: it.kind === 'text' ? (it.variants ?? []).map((v) => v.trim()).filter(Boolean) : undefined,
    }))
    if (enabled) {
      for (const [index, it] of cleaned.entries()) {
        const delay = Number(it.delay_minutes)
        const fail = (message: string) => {
          setOpenId(it.id)
          setError(`Relance ${index + 1} : ${message}`)
        }
        if (delay < MIN_DELAY_MINUTES || delay > MAX_DELAY_MINUTES) {
          return fail('le délai doit être compris entre 15 minutes et 23 h 45.')
        }
        if (it.kind === 'audio' && !it.media_path) return fail('enregistrez ou importez un vocal.')
        if (it.kind === 'text' && (it.variants ?? []).length === 0) return fail('écrivez le message à envoyer.')
        if (it.kind === 'text' && (it.variants ?? []).some(hasMissingFallback)) {
          return fail('ajoutez un texte de secours au prénom, par exemple {prénom|toi}.')
        }
      }
    }
    const cleanedAssisted = assisted.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text)
    const assistedWithoutFallback = cleanedAssisted.findIndex((t) => hasMissingFallback(t.text))
    if (assistedWithoutFallback >= 0) {
      setError(`Message proposé du jour ${cleanedAssisted[assistedWithoutFallback].days} : ajoutez un texte de secours au prénom, par exemple {prénom|toi}.`)
      return
    }
    setError('')
    await save({ followups: { enabled, after_own_message: afterOwn, items: cleaned, assisted: cleanedAssisted } })
  }

  return (
    <Card>
      <CardHeader
        title="Relances"
        description="Vos messages, envoyés si le prospect ne répond plus, dans les 24 h permises par Instagram."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label className="mb-0">Activer les relances</Label>
            <Switch checked={enabled} onChange={setEnabled} label="Activer les relances" />
          </div>

          {enabled ? (
            <>
              <FollowupTimeline delays={items.map((it) => Number(it.delay_minutes) || 0)} />

              {items.map((item, index) => {
                const after = index === 0 ? 'après votre dernier message' : `après la relance ${index}`
                if (openId !== item.id) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setOpenId(item.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5 text-left hover:bg-bg/60"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm">
                          <span className="font-medium">Relance {index + 1}</span>
                          <span className="text-muted"> · {formatDelay(Number(item.delay_minutes) || 0)} {after}</span>
                        </span>
                        <span className="block truncate text-sm text-muted">{followupPreview(item)}</span>
                      </span>
                      <span className="shrink-0 text-sm text-primary">Modifier</span>
                    </button>
                  )
                }
                return (
                  <div key={item.id} className="space-y-3 rounded-[10px] border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label className="mb-0">Relance {index + 1}</Label>
                        <DelaySelect
                          value={Number(item.delay_minutes) || 0}
                          onChange={(minutes) => edit(item.id, { delay_minutes: minutes })}
                        />
                        <span className="text-sm text-muted">{after}</span>
                      </div>
                      {index > 0 ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(item.id)}>
                          Supprimer
                        </Button>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <button type="button" className={pillClass(item.kind !== 'audio')} onClick={() => edit(item.id, { kind: 'text' })}>
                        Texte
                      </button>
                      <button type="button" className={pillClass(item.kind === 'audio')} onClick={() => edit(item.id, { kind: 'audio' })}>
                        Vocal
                      </button>
                    </div>

                    {item.kind === 'audio' ? (
                      <AudioField
                        value={item.media_path ? { path: item.media_path, mime: item.media_mime ?? 'audio/wav', durationMs: item.media_duration_ms } : null}
                        onChange={(value) =>
                          edit(item.id, {
                            media_path: value?.path,
                            media_mime: value?.mime,
                            media_duration_ms: value?.durationMs,
                            transcript: value?.transcript,
                          })
                        }
                        folder={`${assistant.user_id}/${assistant.id}/followup-${item.id}`}
                      />
                    ) : (
                      <div className="space-y-2">
                        {(item.variants ?? ['']).map((variant, vIndex) => (
                          <VariantField
                            key={vIndex}
                            value={variant}
                            placeholder={vIndex === 0 ? 'Votre message de relance' : `Variante ${vIndex + 1}`}
                            onChange={(text) => editVariant(item.id, vIndex, text)}
                          />
                        ))}
                        {(item.variants ?? []).length > 1 ? (
                          <FieldHint>Une variante est tirée au hasard à chaque envoi.</FieldHint>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={(item.variants ?? []).length >= MAX_VARIANTS}
                          onClick={() => edit(item.id, { variants: [...(item.variants ?? []), ''] })}
                        >
                          <Plus size={14} className="mr-1" />
                          {(item.variants ?? []).length >= MAX_VARIANTS ? 'Maximum atteint' : 'Ajouter une variante'}
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}

              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={items.length >= MAX_FOLLOWUPS}
                onClick={() => {
                  const added = newFollowup()
                  setItems((list) => [...list, added])
                  setOpenId(added.id)
                }}
              >
                <Plus size={14} className="mr-1" />
                {items.length >= MAX_FOLLOWUPS ? 'Maximum atteint' : 'Ajouter une relance'}
              </Button>

              <FieldHint>Une conversation en pause, clôturée ou jugée froide n'est jamais relancée.</FieldHint>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="mb-0">Relancer aussi après un message que j'ai écrit moi même</Label>
                  <Switch checked={afterOwn} onChange={setAfterOwn} label="Relancer après mes propres messages" />
                </div>
                <FieldHint>Jamais après une prise de main de votre part.</FieldHint>
              </div>
            </>
          ) : null}

          {allowAssisted ? (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="mb-0">Après 24 h, envoyées par vous</Label>
                <Badge tone="primary">Human Agent</Badge>
              </div>
              <FieldHint>Passé 24 h, ils vous attendent dans « À relancer » et partent d'un clic.</FieldHint>
              {assisted.map((template) => (
                <div key={template.id} className="space-y-2 rounded-[10px] border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={`assisted-${template.id}`} className="mb-0">
                        Jour
                      </Label>
                      <select
                        id={`assisted-${template.id}`}
                        value={template.days}
                        onChange={(e) =>
                          setAssisted((list) => list.map((t) => (t.id === template.id ? { ...t, days: Number(e.target.value) } : t)))
                        }
                        className="h-10 rounded-[10px] border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                      >
                        {ASSISTED_DAYS.map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                      <span className="text-sm text-muted">après votre dernier message</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAssistedDeleteTarget(template.id)}
                    >
                      Supprimer
                    </Button>
                  </div>
                  <VariantField
                    value={template.text}
                    placeholder="Le message qui vous sera proposé"
                    onChange={(text) => setAssisted((list) => list.map((t) => (t.id === template.id ? { ...t, text } : t)))}
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={assisted.length >= MAX_ASSISTED}
                onClick={() =>
                  setAssisted((list) => [
                    ...list,
                    { id: crypto.randomUUID(), days: Math.min(6, list.length ? Math.max(...list.map((t) => t.days)) + 2 : 2), text: '' },
                  ])
                }
              >
                <Plus size={14} className="mr-1" />
                {assisted.length >= MAX_ASSISTED ? 'Maximum atteint' : 'Ajouter un message proposé'}
              </Button>
            </div>
          ) : null}
          <FieldError>{error}</FieldError>
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          setItems((list) => list.filter((it) => it.id !== deleteTarget))
          setDeleteTarget(null)
        }}
        title="Supprimer cette relance"
        message="Elle ne sera plus envoyée. Pensez à enregistrer ensuite."
        confirmLabel="Supprimer"
        danger
      />
      <ConfirmDialog
        open={assistedDeleteTarget != null}
        onClose={() => setAssistedDeleteTarget(null)}
        onConfirm={() => {
          setAssisted((list) => list.filter((t) => t.id !== assistedDeleteTarget))
          setAssistedDeleteTarget(null)
        }}
        title="Supprimer ce message proposé"
        message="Il ne vous sera plus proposé dans « À relancer ». Pensez à enregistrer ensuite."
        confirmLabel="Supprimer"
        danger
      />
    </Card>
  )
}

const MAX_CANNED = 5

function CannedResponsesSection({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const [entries, setEntries] = useState<CannedResponse[]>(assistant.settings.canned_responses ?? [])
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  function edit(id: string, patch: Partial<CannedResponse>) {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    for (const [index, entry] of entries.entries()) {
      if (!entry.trigger.trim()) {
        setError(`Réponse ${index + 1} : décrivez la question à laquelle elle répond.`)
        return
      }
      if (entry.kind === 'audio' ? !entry.media_path : !(entry.text ?? '').trim()) {
        setError(`Réponse ${index + 1} : ajoutez le contenu à envoyer.`)
        return
      }
    }
    setError('')
    await save({ canned_responses: entries.map((entry) => ({ ...entry, moment: entry.moment?.trim() || undefined })) })
  }

  return (
    <Card>
      <CardHeader
        title="Réponses préenregistrées"
        description="Envoyées telles quelles sur un mot-clé ou une situation, une fois par conversation."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-3">
          {entries.length === 0 ? (
            <FieldHint>Aucune réponse préenregistrée. L'assistant rédige toutes ses réponses.</FieldHint>
          ) : null}
          {entries.map((entry, index) => (
            <div key={entry.id} className="space-y-3 rounded-[10px] border border-border p-3">
              <div>
                <Label htmlFor={`canned-trigger-${entry.id}`}>Mot-clé ou situation</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`canned-trigger-${entry.id}`}
                    value={entry.trigger}
                    placeholder="Vidéo IA, ou : le prospect demande ce que vous faites"
                    onChange={(e) => edit(entry.id, { trigger: e.target.value })}
                    className="flex-1"
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(entry.id)}>
                    Supprimer
                  </Button>
                </div>
                {entry.trigger.trim() ? (
                  <FieldHint>
                    {triggerKind(entry.trigger) === 'keyword'
                      ? `Mot-clé : part quand le prospect écrit « ${entry.trigger.trim()} », même sans accents ni majuscules.`
                      : 'Situation : part quand le prospect écrit un message qui y correspond.'}
                  </FieldHint>
                ) : index === 0 ? (
                  <FieldHint>Un mot-clé court (ex. Vidéo IA) ou une situation décrite en phrase.</FieldHint>
                ) : null}
              </div>
              <div>
                <Label htmlFor={`canned-moment-${entry.id}`}>
                  Moment de la conversation <span className="font-normal text-muted">(facultatif)</span>
                </Label>
                <Input
                  id={`canned-moment-${entry.id}`}
                  value={entry.moment ?? ''}
                  placeholder="Ex. : il vient de dire qu’il débute"
                  onChange={(e) => edit(entry.id, { moment: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" className={pillClass(entry.kind !== 'audio')} onClick={() => edit(entry.id, { kind: 'text' })}>
                  Texte
                </button>
                <button type="button" className={pillClass(entry.kind === 'audio')} onClick={() => edit(entry.id, { kind: 'audio' })}>
                  Vocal
                </button>
              </div>
              {entry.kind === 'audio' ? (
                <AudioField
                  value={entry.media_path ? { path: entry.media_path, mime: entry.media_mime ?? 'audio/wav', durationMs: entry.media_duration_ms } : null}
                  onChange={(value) =>
                    edit(entry.id, {
                      media_path: value?.path,
                      media_mime: value?.mime,
                      media_duration_ms: value?.durationMs,
                      transcript: value?.transcript,
                    })
                  }
                  folder={`${assistant.user_id}/${assistant.id}/canned-${entry.id}`}
                />
              ) : (
                <Textarea
                  rows={3}
                  value={entry.text ?? ''}
                  placeholder="La réponse envoyée mot pour mot"
                  onChange={(e) => edit(entry.id, { text: e.target.value })}
                />
              )}
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={entries.length >= MAX_CANNED}
            onClick={() =>
              setEntries((list) => [...list, { id: crypto.randomUUID(), trigger: '', kind: 'text', text: '' }])
            }
          >
            <Plus size={14} className="mr-1" />
            {entries.length >= MAX_CANNED ? 'Maximum atteint' : 'Ajouter une réponse'}
          </Button>
          <FieldError>{error}</FieldError>
        </CardBody>
        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          setEntries((list) => list.filter((e) => e.id !== deleteTarget))
          setDeleteTarget(null)
        }}
        title="Supprimer cette réponse"
        message="L'assistant rédigera de nouveau lui même pour cette question. Pensez à enregistrer ensuite."
        confirmLabel="Supprimer"
        danger
      />
    </Card>
  )
}

const PAUSE_REASONS: Record<string, string> = {
  byok_removed: 'votre accès bêta a changé',
  subscription_ended: 'votre abonnement est terminé',
  channel_disconnected: 'le compte Instagram est déconnecté',
  paused_by_admin: "l'équipe LeadControl l'a mis en pause",
}

function ActivationSection({ assistant, allowCalendar }: { assistant: Assistant; allowCalendar: boolean }) {
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
  const google = channels?.find((c) => c.provider === 'google')
  // Sans compte relié, l'assistant envoie le lien : seul un compte expiré bloque le mode agenda.
  if (allowCalendar && assistant.settings.booking?.mode === 'calendar' && google && google.status !== 'connected') {
    blockers.push('reconnecter Google Agenda')
  }

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
              {assistant.is_active ? 'À régler' : "Avant d'activer"} : {blockers.join(', ')}.
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
  const { data: flags } = useFlags()
  const { data: overrides } = useMyOverrides()
  const { data: assistants, isLoading } = useAssistants()
  const [creating, setCreating] = useState(false)
  const assistant = assistants?.[0]
  const allowCustomTone = hasFeature('custom_tone', flags, profile, overrides)
  const allowContextDocuments = hasFeature('context_documents', flags, profile, overrides)
  const allowCalendly = hasFeature('calendly', flags, profile, overrides)
  const allowFollowups = hasFeature('followups', flags, profile, overrides)
  const allowCannedResponses = hasFeature('canned_responses', flags, profile, overrides)
  const allowHumanAgent = hasFeature('human_agent', flags, profile, overrides)
  const allowCalendar = hasFeature('google_calendar', flags, profile, overrides)

  useEffect(() => {
    if (searchParams.get('ig_connected') === '1') {
      toast('Compte Instagram connecté.')
      invalidate('channel-accounts', 'assistants')
      window.history.replaceState(null, '', window.location.pathname)
    } else if (searchParams.get('ig_error')) {
      toast('La connexion Instagram a échoué. Réessayez.', 'error')
      window.history.replaceState(null, '', window.location.pathname)
    } else if (searchParams.get('calendly_connected') === '1') {
      toast('Compte Calendly connecté.')
      invalidate('channel-accounts')
      window.history.replaceState(null, '', window.location.pathname)
    } else if (searchParams.get('calendly_error')) {
      toast('La connexion Calendly a échoué. Réessayez.', 'error')
      window.history.replaceState(null, '', window.location.pathname)
    } else if (searchParams.get('google_code') && searchParams.get('google_state')) {
      const code = searchParams.get('google_code')
      const state = searchParams.get('google_state')
      // Le code ne doit pas rester dans l'adresse ni être rejoué au rechargement.
      window.history.replaceState(null, '', window.location.pathname)
      toast('Connexion de Google Agenda…')
      callFunction('google-oauth/finish', { body: { code, state } })
        .then(() => {
          toast('Google Agenda connecté.')
          invalidate('channel-accounts', 'assistants')
        })
        .catch((e: unknown) =>
          toast(
            String(e).includes('scope_missing')
              ? 'Cochez les deux accès à l’agenda demandés par Google, puis réessayez.'
              : 'La connexion Google a échoué. Réessayez.',
            'error',
          ),
        )
    } else if (searchParams.get('google_error')) {
      toast(
        searchParams.get('google_error') === 'denied'
          ? 'Connexion Google annulée.'
          : 'La connexion Google a expiré. Réessayez.',
        'error',
      )
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

  // Une carte seule sur sa rangée (module masqué) prend toute la largeur.
  const soloAutomation = allowFollowups !== allowCannedResponses
  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <ActivationSection assistant={assistant} allowCalendar={allowCalendar} />
      </div>
      <ChannelSection assistant={assistant} />
      <ScheduleSection assistant={assistant} />
      <div className="xl:col-span-2">
        <ProfileSection assistant={assistant} />
      </div>
      {allowContextDocuments ? (
        <div className="xl:col-span-2">
          <ContextDocumentsSection />
        </div>
      ) : null}
      <div className="xl:col-span-2">
        <GoalSection assistant={assistant} allowCalendly={allowCalendly} allowCalendar={allowCalendar} />
      </div>
      <ToneSection assistant={assistant} allowCustom={allowCustomTone} />
      <AudienceSection assistant={assistant} />
      {allowFollowups ? (
        <div className={soloAutomation ? 'xl:col-span-2' : undefined}>
          <FollowupsSection assistant={assistant} allowAssisted={allowHumanAgent} />
        </div>
      ) : null}
      {allowCannedResponses ? (
        <div className={soloAutomation ? 'xl:col-span-2' : undefined}>
          <CannedResponsesSection assistant={assistant} />
        </div>
      ) : null}
    </div>
  )
}

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold">Assistant</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Le réglage de votre assistant Instagram.</p>
      <Suspense>
        <AssistantContent />
      </Suspense>
    </div>
  )
}
