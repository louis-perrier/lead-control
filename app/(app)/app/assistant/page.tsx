'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Instagram, Plus, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { callFunction } from '@/lib/api'
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
import { formatDateTime } from '@/lib/utils'
import type { Assistant, AssistantSettings, CannedResponse, ContextDocument, FollowupItem } from '@/lib/types'
import { AudioField } from '@/components/ui/audio-field'
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
    // Relecture juste avant l'écriture : le cache peut dater, et un second onglet
    // écraserait sinon des réglages enregistrés entre-temps.
    const current = await supabase.from('assistants').select('settings').eq('id', assistant.id).maybeSingle()
    const base = (current.data?.settings ?? assistant.settings) as AssistantSettings
    const { error } = await supabase
      .from('assistants')
      .update({ settings: { ...base, ...patch }, ...extra })
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

function CalendlySection() {
  const { data: channels } = useChannelAccounts()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const channel = channels?.find((c) => c.provider === 'calendly')

  async function connect() {
    setBusy(true)
    try {
      const { auth_url } = await callFunction<{ auth_url: string }>('calendly-oauth/start', {
        body: { return_to: window.location.href },
      })
      window.location.href = auth_url
    } catch {
      toast('Impossible de démarrer la connexion Calendly.', 'error')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!channel) return
    setBusy(true)
    try {
      await callFunction('calendly-oauth/disconnect', { body: { channel_account_id: channel.id } })
      toast('Compte Calendly déconnecté.')
      invalidate('channel-accounts')
    } catch {
      toast('La déconnexion a échoué.', 'error')
    }
    setBusy(false)
    setConfirmOpen(false)
  }

  return (
    <Card>
      <CardHeader
        title="Calendly"
        description="Reçoit les rendez-vous réservés par vos prospects via le lien envoyé par l'assistant."
      />
      <CardBody>
        {channel ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{channel.handle ?? channel.label ?? 'Compte relié'}</span>
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
            <p className="text-sm text-muted">Aucun compte Calendly relié pour le moment.</p>
            <Button onClick={connect} disabled={busy}>
              {busy ? 'Ouverture…' : 'Relier mon compte Calendly'}
            </Button>
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={disconnect}
        title="Déconnecter Calendly"
        message="Les rendez-vous déjà réservés restent visibles, mais les nouvelles réservations ne seront plus suivies."
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
      stop_condition: { ...s.stop_condition, text: stopText.trim(), link: stopLink.trim() },
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
            <Label htmlFor="context">Présentation de l'offre</Label>
            <Textarea
              id="context"
              rows={6}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Votre méthode, vos clients types, vos prix, vos arguments, ce que l'assistant doit savoir."
            />
            <FieldHint>
              Plus c'est précis, plus les réponses sont justes. Pour des documents longs, utilisez plutôt les documents de contexte juste en dessous.
            </FieldHint>
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
              <Label htmlFor="stopText">Objectif visé (contexte donné à l'assistant)</Label>
              <Textarea
                id="stopText"
                rows={3}
                value={stopText}
                onChange={(e) => setStopText(e.target.value)}
                placeholder="Amener le prospect à réserver un appel découverte."
              />
            </div>
            <div>
              <Label htmlFor="stopLink">Lien principal</Label>
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
          <SecondaryLinksField assistant={assistant} />
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
    await save({ stop_condition: { ...assistant.settings.stop_condition, secondary_links: next } })
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
        <FieldHint>
          Proposés à la place du lien principal quand leur condition correspond mieux, par exemple une offre gratuite pour un prospect pas encore prêt à investir.
        </FieldHint>
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

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

function TimeSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [hour, minute] = value.split(':')
  const selectClass =
    'h-10 rounded-[10px] border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-50'
  return (
    <div className="flex items-center gap-1">
      <select
        disabled={disabled}
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
      <CardHeader
        title="Horaires de réponse"
        description="En dehors de ces créneaux, l'assistant attend l'ouverture suivante pour répondre."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label className="mb-0">Toujours actif (24h/24, 7j/7)</Label>
            <Switch checked={alwaysOn} onChange={setAlwaysOn} label="Toujours actif" />
          </div>
          {!alwaysOn ? (
            <>
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
                  <Label>De</Label>
                  <TimeSelect value={start} onChange={setStart} />
                </div>
                <div>
                  <Label>À</Label>
                  <TimeSelect value={end} onChange={setEnd} />
                </div>
              </div>
            </>
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
        description="Par défaut, l'assistant répond à tout le monde. Vous pouvez le limiter."
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
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [customQuestions, setCustomQuestions] = useState(assistant.custom_tone_questions)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const mountedRef = useRef(false)
  const [touchedSinceGenerate, setTouchedSinceGenerate] = useState(false)

  useEffect(() => {
    if (mountedRef.current) setTouchedSinceGenerate(true)
    mountedRef.current = true
  }, [answers, customQuestions])

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
              Répondez à ces messages comme vous le feriez vraiment, avec vos mots. L'assistant en tire votre façon de vous exprimer, jamais le contenu de vos réponses. 200 caractères minimum par réponse, pour avoir assez de matière.
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
        .select('id, title, status, char_count, error_message, created_at')
        .eq('user_id', effectiveUserId!)
        .order('created_at', { ascending: false })
      return (data ?? []) as ContextDocument[]
    },
  })
  const { data: quota } = useQuery({
    queryKey: ['context-documents-quota'],
    queryFn: () => callFunction<{ max: number; used: number }>('context-documents/quota', { method: 'GET' }),
  })

  async function upload(file: File) {
    if (!/\.(txt|md)$/i.test(file.name)) {
      toast('Seuls les fichiers .txt et .md sont acceptés pour le moment.', 'error')
      return
    }
    if (file.size > 300_000) {
      toast('Fichier trop volumineux (300 Ko maximum).', 'error')
      return
    }
    setUploading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const path = `${user!.id}/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('context-documents').upload(path, file)
    if (uploadError) {
      toast('L’envoi a échoué.', 'error')
      setUploading(false)
      return
    }
    try {
      const res = await callFunction<{ status: string }>('context-documents/register', {
        body: { storage_path: path, title: file.name, mime_type: file.type },
      })
      toast(
        res.status === 'ready' ? 'Document ajouté.' : 'Le document n’a pas pu être lu.',
        res.status === 'ready' ? 'success' : 'error',
      )
    } catch (e) {
      toast(
        e instanceof Error && e.message === 'quota_reached'
          ? 'Vous avez atteint le nombre de documents autorisé par votre offre.'
          : 'L’ajout a échoué.',
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

  return (
    <Card>
      <CardHeader
        title="Documents de contexte"
        description="Plutôt que tout écrire dans le contexte, importez un ou plusieurs documents (.txt, .md)."
      />
      <CardBody className="space-y-3">
        {quota ? (
          <p className="text-xs text-muted">
            {quota.used} / {quota.max} document{quota.max > 1 ? 's' : ''} utilisé{quota.used > 1 ? 's' : ''}
            {quota.max === 0 ? ', nécessite un abonnement actif' : ''}
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
                  <Badge tone={d.status === 'ready' ? 'success' : d.status === 'error' ? 'danger' : 'muted'}>
                    {d.status === 'ready' ? 'Prêt' : d.status === 'error' ? 'Erreur' : 'Traitement…'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || atQuota}>
          {uploading ? 'Envoi…' : 'Ajouter un document'}
        </Button>
      </CardBody>
    </Card>
  )
}

const MAX_FOLLOWUPS = 3
const MAX_VARIANTS = 3
const MIN_DELAY_MINUTES = 15
const MAX_DELAY_MINUTES = 23 * 60 + 45
const DELAY_HOURS = Array.from({ length: 24 }, (_, i) => i)
const DELAY_MINUTES = [0, 15, 30, 45]

const pillClass = (active: boolean) =>
  active
    ? 'rounded-full bg-primary px-3 py-1 text-sm text-white'
    : 'rounded-full border border-border px-3 py-1 text-sm text-muted'

function DelaySelect({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  const selectClass =
    'h-10 rounded-[10px] border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-50'
  return (
    <div className="flex items-center gap-1">
      <select value={hour} onChange={(e) => onChange(Number(e.target.value) * 60 + minute)} className={selectClass}>
        {DELAY_HOURS.map((h) => (
          <option key={h} value={h}>
            {h} h
          </option>
        ))}
      </select>
      <select value={minute} onChange={(e) => onChange(hour * 60 + Number(e.target.value))} className={selectClass}>
        {DELAY_MINUTES.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
    </div>
  )
}

function newFollowup(): FollowupItem {
  return { id: crypto.randomUUID(), delay_minutes: 120, kind: 'text', variants: [''] }
}

function FollowupsSection({ assistant }: { assistant: Assistant }) {
  const { save, saving } = useSaveSettings(assistant)
  const initial = assistant.settings.followups
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [afterOwn, setAfterOwn] = useState(initial?.after_own_message ?? false)
  const [items, setItems] = useState<FollowupItem[]>(
    initial?.items?.length ? initial.items : [newFollowup()],
  )
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
      let previous = 0
      for (const [index, it] of cleaned.entries()) {
        const delay = Number(it.delay_minutes)
        if (delay < MIN_DELAY_MINUTES || delay > MAX_DELAY_MINUTES) {
          setError(`Relance ${index + 1} : le délai doit être compris entre 15 minutes et 23 h 45.`)
          return
        }
        if (delay <= previous) {
          setError(`Relance ${index + 1} : son délai doit être plus long que celui de la relance précédente.`)
          return
        }
        previous = delay
        if (it.kind === 'audio' && !it.media_path) {
          setError(`Relance ${index + 1} : enregistrez ou importez un vocal.`)
          return
        }
        if (it.kind === 'text' && (it.variants ?? []).length === 0) {
          setError(`Relance ${index + 1} : écrivez le message à envoyer.`)
          return
        }
      }
    }
    setError('')
    await save({ followups: { enabled, after_own_message: afterOwn, items: cleaned } })
  }

  return (
    <Card>
      <CardHeader
        title="Relances"
        description="Si le prospect ne répond plus, l'assistant envoie les messages que vous avez écrits ici. Instagram n'autorise ces envois que dans les 24 h qui suivent le dernier message du prospect."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label className="mb-0">Activer les relances</Label>
            <Switch checked={enabled} onChange={setEnabled} label="Activer les relances" />
          </div>

          {enabled ? (
            <>
              <FieldHint>
                Le délai part du dernier message échangé. Une relance prévue après la fermeture de la fenêtre de 24 h n'est pas envoyée, et une conversation en pause, clôturée ou jugée froide n'est jamais relancée.
              </FieldHint>

              {items.map((item, index) => (
                <div key={item.id} className="space-y-3 rounded-[10px] border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="mb-0">Relance {index + 1}</Label>
                      <span className="text-sm text-muted">après</span>
                      <DelaySelect
                        value={Number(item.delay_minutes) || 0}
                        onChange={(minutes) => edit(item.id, { delay_minutes: minutes })}
                      />
                      <span className="text-sm text-muted">sans réponse</span>
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
                        })
                      }
                      folder={`${assistant.user_id}/${assistant.id}/followup-${item.id}`}
                    />
                  ) : (
                    <div className="space-y-2">
                      {(item.variants ?? ['']).map((variant, vIndex) => (
                        <Textarea
                          key={vIndex}
                          rows={2}
                          value={variant}
                          placeholder={vIndex === 0 ? 'Votre message de relance' : `Variante ${vIndex + 1}`}
                          onChange={(e) => editVariant(item.id, vIndex, e.target.value)}
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
              ))}

              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={items.length >= MAX_FOLLOWUPS}
                onClick={() => setItems((list) => [...list, newFollowup()])}
              >
                <Plus size={14} className="mr-1" />
                {items.length >= MAX_FOLLOWUPS ? 'Maximum atteint' : 'Ajouter une relance'}
              </Button>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="mb-0">Relancer aussi après un message que j'ai écrit moi même</Label>
                  <Switch checked={afterOwn} onChange={setAfterOwn} label="Relancer après mes propres messages" />
                </div>
                <FieldHint>
                  Sans effet si vous avez pris la main sur la conversation, dans ce cas l'assistant ne relance jamais.
                </FieldHint>
              </div>
            </>
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
    await save({ canned_responses: entries })
  }

  return (
    <Card>
      <CardHeader
        title="Réponses préenregistrées"
        description="Quand le prospect pose une de ces questions, l'assistant envoie votre réponse telle quelle au lieu d'en rédiger une. Chaque réponse ne part qu'une fois par conversation."
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-3">
          {entries.length === 0 ? (
            <FieldHint>Aucune réponse préenregistrée. L'assistant rédige toutes ses réponses.</FieldHint>
          ) : null}
          {entries.map((entry, index) => (
            <div key={entry.id} className="space-y-3 rounded-[10px] border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={entry.trigger}
                  placeholder="Quand le prospect demande ce que vous faites dans la vie"
                  onChange={(e) => edit(entry.id, { trigger: e.target.value })}
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(entry.id)}>
                  Supprimer
                </Button>
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
    <div className="space-y-3">
      <ActivationSection assistant={assistant} />
      <ChannelSection assistant={assistant} />
      {allowCalendly ? <CalendlySection /> : null}
      <ProfileSection assistant={assistant} />
      {allowContextDocuments ? <ContextDocumentsSection /> : null}
      <ToneSection assistant={assistant} allowCustom={allowCustomTone} />
      <ScheduleSection assistant={assistant} />
      {allowFollowups ? <FollowupsSection assistant={assistant} /> : null}
      {allowCannedResponses ? <CannedResponsesSection assistant={assistant} /> : null}
      <AudienceSection assistant={assistant} />
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
