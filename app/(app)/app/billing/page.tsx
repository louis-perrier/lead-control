'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { callFunction } from '@/lib/api'
import { useBilling } from '@/lib/queries'
import { formatCurrency } from '@/lib/utils'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/misc'
import { useToast } from '@/components/ui/toast'

const BASIC_FEATURES = [
  'Assistant IA sur vos DM Instagram',
  '5 000 réponses par mois',
  'Boîte de réception, contacts et statistiques',
  'Réponses selon vos horaires',
]

function ChoosePlan() {
  const toast = useToast()
  const [agents, setAgents] = useState(1)
  const [loading, setLoading] = useState(false)
  const price = 700 + Math.max(0, agents - 1) * 60

  async function checkout() {
    setLoading(true)
    try {
      const { url } = await callFunction<{ url: string }>('billing/stripe-create-checkout-coach', {
        body: { agents_qty: agents },
      })
      window.location.href = url
    } catch {
      toast('Impossible d’ouvrir le paiement. Réessayez.', 'error')
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="border-primary/40">
        <CardBody className="flex h-full flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">Basic</h2>
            <p className="mt-2 text-3xl font-semibold">
              {formatCurrency(price)}
              <span className="text-sm font-normal text-muted"> /mois</span>
            </p>
            {agents > 1 ? (
              <p className="text-xs text-muted">700 € + {agents - 1} × 60 € par assistant supplémentaire</p>
            ) : null}
          </div>
          <ul className="space-y-2 text-sm">
            {BASIC_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-success" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Assistants</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAgents((a) => Math.max(1, a - 1))} aria-label="Moins d'assistants">
                  -
                </Button>
                <span className="w-6 text-center font-medium">{agents}</span>
                <Button size="sm" variant="secondary" onClick={() => setAgents((a) => Math.min(5, a + 1))} aria-label="Plus d'assistants">
                  +
                </Button>
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={checkout} disabled={loading}>
              {loading ? 'Ouverture du paiement…' : 'Commencer maintenant'}
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card className="opacity-70">
        <CardBody className="flex h-full flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">Premium</h2>
            <p className="mt-2 text-3xl font-semibold">
              950 €<span className="text-sm font-normal text-muted"> /mois</span>
            </p>
          </div>
          <p className="text-sm text-muted">
            Tout Basic, plus les canaux et modules avancés au fur et à mesure de leur ouverture.
          </p>
          <div className="mt-auto">
            <Button className="w-full" size="lg" variant="secondary" disabled>
              Disponible prochainement
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function ManagePlan() {
  const toast = useToast()
  const { data: billing } = useBilling()
  const [packQty, setPackQty] = useState(1)
  const [portalOpen, setPortalOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function buyCredits() {
    setBusy(true)
    try {
      const { url } = await callFunction<{ url: string }>('billing/stripe-create-checkout-credits', {
        body: { quantity: packQty },
      })
      window.location.href = url
    } catch {
      toast('Impossible d’ouvrir le paiement des crédits.', 'error')
      setBusy(false)
    }
  }

  async function openPortal() {
    setBusy(true)
    try {
      const { url } = await callFunction<{ url: string }>('billing/stripe-create-portal', { body: {} })
      window.location.href = url
    } catch {
      toast('Impossible d’ouvrir le portail de gestion.', 'error')
      setBusy(false)
      setPortalOpen(false)
    }
  }

  if (!billing) return null
  const remaining = billing.creditsRemaining
  const ratio =
    remaining != null && billing.creditsMonthly > 0 ? remaining / billing.creditsMonthly : null

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">
              {billing.planKey === 'coach_premium' ? 'Plan Premium' : billing.planKey === 'coach_basic' ? 'Plan Basic' : 'Accès spécial'}
            </h2>
            {billing.isTrial ? <Badge tone="primary">Période d'essai</Badge> : <Badge tone="success">Actif</Badge>}
          </div>
          <p className="text-sm text-muted">
            {billing.agentsSettingsQty} assistant{billing.agentsSettingsQty > 1 ? 's' : ''}
            {billing.currentPeriodEnd
              ? ` · renouvellement le ${new Date(billing.currentPeriodEnd).toLocaleDateString('fr-FR')}`
              : ''}
          </p>
          {remaining != null ? (
            <div>
              <div className="flex justify-between text-sm">
                <span>Crédits restants ce mois</span>
                <span className="font-medium">
                  {remaining.toLocaleString('fr-FR')} / {billing.creditsMonthly.toLocaleString('fr-FR')}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.round((ratio ?? 0) * 100))}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Réponses illimitées avec votre accès actuel.</p>
          )}
        </CardBody>
      </Card>

      {billing.planOverride != null ? (
        <Card className="border-primary/30">
          <CardBody className="text-sm text-muted">
            {billing.planOverride === 'free_unlimited'
              ? "Votre compte a un accès illimité offert par l'équipe LeadControl : votre plan actuel ne nécessite aucun paiement ici."
              : "Vous êtes bêta-testeur avec votre propre clé API Anthropic : vos réponses passent par votre clé, votre plan actuel ne nécessite aucun paiement ici."}
          </CardBody>
        </Card>
      ) : null}

      {billing.planOverride == null ? (
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-base font-semibold">Acheter des crédits supplémentaires</h2>
            <p className="text-sm text-muted">
              20 € les 50 crédits, utilisables immédiatement. Ils sont remis à zéro avec vos crédits
              mensuels à la fin de la période.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setPackQty((q) => Math.max(1, q - 1))} aria-label="Moins de packs">
                  -
                </Button>
                <span className="w-6 text-center font-medium">{packQty}</span>
                <Button size="sm" variant="secondary" onClick={() => setPackQty((q) => Math.min(10, q + 1))} aria-label="Plus de packs">
                  +
                </Button>
              </div>
              <Button onClick={buyCredits} disabled={busy}>
                Acheter {packQty * 50} crédits pour {packQty * 20} €
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {billing.planOverride == null ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Gérer mon abonnement</h2>
              <p className="mt-0.5 text-sm text-muted">
                Moyen de paiement, factures, annulation. L'accès reste actif jusqu'à la fin de la
                période en cours.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setPortalOpen(true)} disabled={busy}>
              Ouvrir le portail
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={portalOpen}
        onClose={() => setPortalOpen(false)}
        onConfirm={openPortal}
        title="Gérer mon abonnement"
        message="En cas d'annulation, votre assistant sera mis en pause à la fin de la période. Vos conversations et réglages sont conservés."
        confirmLabel="Continuer"
        loading={busy}
      />
    </div>
  )
}

export default function BillingPage() {
  const { data: billing, isLoading } = useBilling()
  const subscribed = billing && ['active', 'trialing'].includes(billing.status)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">{subscribed || billing?.planOverride ? 'Facturation' : 'Choisissez votre offre'}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        {subscribed || billing?.planOverride
          ? 'Votre plan, vos crédits et vos factures.'
          : 'Un abonnement, un assistant qui répond pour vous. Sans engagement.'}
      </p>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : subscribed || billing?.planOverride ? (
        <ManagePlan />
      ) : (
        <ChoosePlan />
      )}
    </div>
  )
}
