import { FunctionComponent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import supabase from "../lib/supabase";
import useSubscriptionState, { PlanKey } from "../hooks/useSubscriptionState";
import styles from "./PricingPage.module.css";

const PLAN_LABELS: Record<PlanKey, string> = {
  coach_basic: "PLAN BASIC",
  coach_premium: "PLAN PREMIUM",
  none: "Plan gratuit",
  TESTEUR: "TESTEUR",
};

const formatCurrency = (value: number) =>
  `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;

const getReadableErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    // Messages d'erreur déjà user-friendly
    if (
      error.message.includes("Impossible de") || 
      error.message.includes("Aucune URL") ||
      error.message.includes("Session expirée")
    ) {
      return error.message;
    }
    
    // Erreurs réseau courantes
    if (
      error.message.toLowerCase().includes("failed to fetch") ||
      error.message.toLowerCase().includes("network error") ||
      error.message.toLowerCase().includes("fetch")
    ) {
      return "Impossible de charger la page de paiement. Vérifiez votre connexion internet et réessayez.";
    }
    
    // Erreurs de timeout
    if (error.message.toLowerCase().includes("timeout")) {
      return "La requête a pris trop de temps. Réessayez dans quelques instants.";
    }
    
    // Erreurs d'authentification
    if (error.message.toLowerCase().includes("unauthorized") || error.message.toLowerCase().includes("401")) {
      return "Votre session a expiré. Reconnectez-vous et réessayez.";
    }
    
    // Erreurs serveur
    if (error.message.toLowerCase().includes("500") || error.message.toLowerCase().includes("server")) {
      return "Problème temporaire de nos serveurs. Réessayez dans quelques minutes.";
    }
  }
  
  return "Une erreur inattendue est survenue. Réessayez ou contactez le support.";
};

const formatRenewalDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
};

const PricingPage: FunctionComponent = () => {
  const [agentsQty, setAgentsQty] = useState(1);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);
  const [packQty, setPackQty] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const PACK_PRICE = 20;
  const PACK_CREDITS = 50;

  const { data: billing, isLoading, error } = useSubscriptionState();
  const isSubscribed = billing?.status === "active" || billing?.status === "trialing";

  const planName = billing
    ? PLAN_LABELS[billing.planKey] ?? billing.planKey
    : "LeadControl";
  const agentsSettingsQty = billing?.agentsSettingsQty ?? 1;
  const pricePerMonth = 350 + Math.max(0, agentsQty - 1) * 60;
  const showPriceFormula = agentsQty > 1;

  const creditsRemaining =
    billing?.creditsRemaining ?? billing?.creditsBalance ?? 0;
  const creditsMonthly = billing?.creditsMonthly ?? 0;
  const creditsProgress = creditsMonthly
    ? Math.min(100, Math.max(0, (creditsRemaining / creditsMonthly) * 100))
    : 0;

  const renewalDate = useMemo(
    () => formatRenewalDate(billing?.currentPeriodEnd),
    [billing?.currentPeriodEnd],
  );

  const badgeLabel = billing && billing.isTrial ? "Période d'essai" : "Actif";
  const badgeClass = billing && billing.isTrial ? styles.badgeTrial : styles.badgeActive;

  const creditsLabel = creditsMonthly
    ? `${creditsRemaining.toLocaleString("fr-FR")} / ${creditsMonthly.toLocaleString(
        "fr-FR",
      )} crédits restants ce mois`
    : "Crédits mensuels non définis";

  const generalError = actionError || (error ? "Impossible de récupérer vos informations d'abonnement. Vérifiez votre connexion." : null);

  const adjustAgents = (delta: number) => {
    setAgentsQty((prev) => {
      const next = Math.min(5, Math.max(1, prev + delta));
      return next;
    });
  };

  const getAuthHeaders = async () => {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) {
      throw new Error("Session expirée. Merci de vous reconnecter.");
    }
    return {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    };
  };

  const handleCoachCheckout = async () => {
    setActionError(null);
    setCheckoutLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing/stripe-create-checkout-coach`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ agents_qty: agentsQty }),
        },
      );
      if (!response.ok) {
        throw new Error("Impossible de générer la redirection Stripe.");
      }
      const payload = await response.json();
      if (!payload.url) {
        throw new Error("Aucune URL de paiement disponible pour le moment.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setActionError(getReadableErrorMessage(err));
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setActionError(null);
    setPortalLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing/stripe-create-portal`,
        {
          method: "POST",
          headers,
        },
      );
      if (!response.ok) {
        throw new Error("Impossible de générer le portail Stripe.");
      }
      const payload = await response.json();
      if (!payload.url) {
        throw new Error("Aucune URL de portail disponible.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setActionError(getReadableErrorMessage(err));
      setPortalLoading(false);
    }
  };

  const handleCreditsPurchase = async () => {
    setActionError(null);
    setCreditsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing/stripe-create-checkout-credits`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ quantity: packQty }),
        },
      );
      if (!response.ok) {
        throw new Error("Impossible de lancer l'achat de crédits.");
      }
      const payload = await response.json();
      if (!payload.url) {
        throw new Error("Aucune URL de paiement disponible.");
      }
      window.location.href = payload.url;
    } catch (err) {
      setActionError(getReadableErrorMessage(err));
      setCreditsLoading(false);
    }
  };

  const toggleCreditsModal = () => setIsCreditsModalOpen((prev) => !prev);
  const togglePortalModal = () => setIsPortalModalOpen((prev) => !prev);

  const handlePortalConfirmed = async () => {
    setIsPortalModalOpen(false);
    await handlePortal();
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageContent}>
          <p className={styles.loadingText}>Chargement…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageContent}>
        <div className={styles.logoSection}>
          <Link to="/app" className={styles.logoLink}>
            <img 
              src="/logo@2x.png" 
              alt="LeadControl" 
              className={styles.logo}
            />
          </Link>
        </div>

        <header className={styles.header}>
          <p className={styles.kicker}>LEADCONTROL</p>
          <h1 className={styles.title}>Choisissez votre offre</h1>
          <p className={styles.subtitle}>Facturation mensuelle · Sans engagement</p>
        </header>

        {generalError && <p className={styles.errorText}>{generalError}</p>}

        {!isSubscribed && (
          <section className={styles.cardsWrapper}>
            <article className={`${styles.card} ${styles.activeCard}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Basic</h2>
                <p className={styles.cardDescription}>
                  Qualifiez vos prospects et automatisez vos prises de RDV sur Instagram
                </p>
              </div>
              <div className={styles.priceRow}>
                <div>
                  <span className={styles.priceValue}>{formatCurrency(pricePerMonth)}</span>
                  <span className={styles.priceFormula}>/mois</span>
                </div>
                {showPriceFormula && (
                  <span className={styles.priceFormula}>
                    350 € + {agentsQty - 1} × 60 €
                  </span>
                )}
              </div>
              <div className={styles.selector}>
                <span className={styles.selectorLabel}>Nombre d'agents de setting</span>
                <div className={styles.selectorControls}>
                  <button
                    type="button"
                    onClick={() => adjustAgents(-1)}
                    disabled={agentsQty === 1}
                    className={styles.selectorButton}
                    aria-label="Réduire le nombre d'agents"
                  >
                    −
                  </button>
                  <span className={styles.selectorValue}>{agentsQty}</span>
                  <button
                    type="button"
                    onClick={() => adjustAgents(1)}
                    disabled={agentsQty === 5}
                    className={styles.selectorButton}
                    aria-label="Augmenter le nombre d'agents"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className={styles.creditMessage}>5 000 crédits/mois inclus</p>
              <ul className={styles.featuresList}>
                <li>{`${agentsQty} agent${agentsQty > 1 ? "s" : ""} de setting IA`}</li>
                <li>Qualification automatique Instagram DM</li>
                <li>Prise de RDV automatisée</li>
                <li>5 000 messages/mois</li>
                <li>Support inclus</li>
              </ul>
              <button
                type="button"
                className={`${styles.primaryButton} ${
                  checkoutLoading ? styles.buttonLoading : ""
                }`}
                onClick={handleCoachCheckout}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? "Redirection…" : "Commencer maintenant"}
              </button>
            </article>

            <article className={`${styles.card} ${styles.premiumCard}`}>
              <span className={styles.badgeSoon}>Bientôt disponible</span>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Premium</h2>
                <p className={styles.cardDescription}>
                  Agent setting et agent vocal combinés pour une qualification multicanal
                </p>
              </div>
              <div className={styles.priceRow}>
                <div>
                  <span className={styles.priceValue}>950 €</span>
                  <span className={styles.priceFormula}>/mois</span>
                </div>
              </div>
              <ul className={styles.featuresList} aria-disabled="true">
                <li>✓ Tout de l'offre Basic</li>
                <li>✓ Agent vocal IA</li>
                <li>✓ Qualification par appel automatisé</li>
                <li>✓ Crédits vocaux inclus</li>
              </ul>
              <button type="button" className={styles.disabledButton} disabled>
                Disponible prochainement
              </button>
            </article>
          </section>
        )}

        {isSubscribed && billing && (
          <>
            <section className={styles.infoSection}>
              <div className={styles.infoCard}>
                <div className={styles.planHeader}>
                  <div className={styles.planInfo}>
                    <p className={styles.planLabel}>PLAN</p>
                    <h3 className={styles.planName}>{planName}</h3>
                  </div>
                  <span className={`${styles.planBadge} ${badgeClass}`}>
                    {badgeLabel}
                  </span>
                </div>

                <div className={styles.planDetails}>
                  <div className={styles.planDetailsRow}>
                    <span className={styles.planDetailsLabel}>Agents de setting</span>
                    <span className={styles.planDetailsValue}>
                      {agentsSettingsQty} agent{agentsSettingsQty > 1 ? "s" : ""}
                    </span>
                  </div>
                  {(billing?.agentsVocalQty || 0) > 0 && (
                    <div className={styles.planDetailsRow}>
                      <span className={styles.planDetailsLabel}>Agents vocaux</span>
                      <span className={styles.planDetailsValue}>
                        {billing.agentsVocalQty} agent{billing.agentsVocalQty > 1 ? "s" : ""} vocal
                      </span>
                    </div>
                  )}
                  {billing.planKey !== 'TESTEUR' && (
                    <div className={styles.planDetailsRow}>
                      <span className={styles.planDetailsLabel}>Prix</span>
                      <span className={styles.planDetailsValue}>
                        {formatCurrency(350 + Math.max(0, agentsSettingsQty - 1) * 60)} / mois
                      </span>
                    </div>
                  )}
                  {renewalDate && (
                    <div className={styles.planDetailsRow}>
                      <span className={styles.planDetailsLabel}>Renouvellement</span>
                      <span className={styles.planDetailsValue}>{renewalDate}</span>
                    </div>
                  )}
                </div>

                <div className={styles.progressGroup}>
                  <div
                    className={styles.progressBar}
                    role="progressbar"
                    aria-valuenow={creditsRemaining}
                    aria-valuemin={0}
                    aria-valuemax={creditsMonthly || 1}
                  >
                    <div
                      className={styles.progressFill}
                      style={{ width: `${creditsProgress}%` }}
                    />
                  </div>
                  <p className={styles.creditsHint}>{creditsLabel}</p>
                </div>

                <button
                  type="button"
                  className={`${styles.manageButton} ${
                    portalLoading ? styles.buttonLoading : ""
                  }`}
                  onClick={togglePortalModal}
                  disabled={portalLoading}
                >
                  {portalLoading ? "Chargement…" : "Gérer mon abonnement"}
                </button>
                <p className={styles.portalNote}>
                  Modifier ou annuler votre abonnement. L'accès reste actif jusqu'à la fin de la période en cours.
                </p>
              </div>
            </section>

            <section className={styles.creditPacksSection}>
              <div className={styles.creditPacksHeader}>
                <h3>Acheter des crédits supplémentaires</h3>
                <p>
                  20 € pour 50 crédits, disponibles immédiatement et utilisables avant le prochain renouvellement.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <button
                  type="button"
                  onClick={() => setPackQty((q) => Math.max(1, q - 1))}
                  disabled={packQty <= 1}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: "1.5px solid #E6EBF2",
                    background: "#FFFFFF",
                    fontSize: 20,
                    color: "#0B1220",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  −
                </button>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#0B1220",
                    minWidth: 24,
                    textAlign: "center",
                  }}
                >
                  {packQty}
                </span>
                <button
                  type="button"
                  onClick={() => setPackQty((q) => Math.min(10, q + 1))}
                  disabled={packQty >= 10}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: "1.5px solid #E6EBF2",
                    background: "#FFFFFF",
                    fontSize: 20,
                    color: "#0B1220",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  +
                </button>
                <span style={{ color: "#5B667A", fontSize: 13 }}>
                  {packQty * PACK_CREDITS} crédits · {packQty * PACK_PRICE} €
                </span>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={toggleCreditsModal}
              >
                Acheter {packQty} pack{packQty > 1 ? "s" : ""} — {packQty * PACK_PRICE} € = {packQty * PACK_CREDITS} crédits
              </button>
            </section>
          </>
        )}
      </div>

      {isCreditsModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Confirmer l'achat</h3>
            <p className={styles.modalMessage}>
              Vous allez acheter <strong>{packQty} pack{packQty > 1 ? "s" : ""}</strong> soit{" "}
              <strong>{packQty * PACK_CREDITS} crédits</strong> pour <strong>{packQty * PACK_PRICE} €</strong>.
            </p>
            <p
              style={{
                color: "#5B667A",
                fontSize: 13,
                marginTop: 8,
              }}
            >
              ⚠️ Ces crédits s'ajoutent à votre solde mensuel et seront réinitialisés avec vos crédits mensuels
              à la fin de la période en cours. Pensez à les utiliser avant le renouvellement.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalButtonSecondary}
                onClick={toggleCreditsModal}
                disabled={creditsLoading}
              >
                Annuler
              </button>
              <button
                type="button"
                className={`${styles.modalButtonPrimary} ${
                  creditsLoading ? styles.buttonLoading : ""
                }`}
                onClick={handleCreditsPurchase}
                disabled={creditsLoading}
              >
                {creditsLoading ? "Chargement…" : "Procéder au paiement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPortalModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>⚠️ Attention</h3>
            <p className={styles.modalMessage}>
              En cas d'annulation du plan, toutes les conversations seront perdues et l'agent ne se souviendra de rien.
              <br /><br />
              Êtes-vous sûr de vouloir continuer vers la gestion de votre abonnement ?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalButtonSecondary}
                onClick={togglePortalModal}
                disabled={portalLoading}
              >
                Annuler
              </button>
              <button
                type="button"
                className={`${styles.modalButtonPrimary} ${
                  portalLoading ? styles.buttonLoading : ""
                }`}
                onClick={handlePortalConfirmed}
                disabled={portalLoading}
              >
                {portalLoading ? "Chargement…" : "Continuer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingPage;
