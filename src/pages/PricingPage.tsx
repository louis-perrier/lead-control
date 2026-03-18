import { FunctionComponent, useMemo, useState, useEffect } from "react";
import { AppLayout } from "../layouts";
import Header from "../components/Header";
import supabase from "../lib/supabase";
import useSubscriptionState, { PlanKey } from "../hooks/useSubscriptionState";
import styles from "./PricingPage.module.css";

type BillingCycle = "monthly" | "yearly";
type PlanId = "1_agent" | "2_agents" | "custom";

type BillingHistoryEntry = {
  id: string;
  plan: string;
  amount: string;
  purchaseDate: string;
  endDate: string;
  status: "success" | "warning";
};

const creditTicks = [0, 500, 1000, 1500, 2000];

const planCatalog: {
  id: PlanId;
  title: string;
  description: string;
  basePrice: number;
  badge?: string;
  features: string[];
}[] = [
  {
    id: "1_agent",
    title: "Basic",
    description: "Idéal pour démarrer avec un seul agent.",
    basePrice: 100,
    features: [
      "1 agent au choix",
      "200 crédits",
      "Support",
      "Interface multicanal",
      "1 agent Assistant Chatbot (bientôt)",
      "Commission 50%"
    ],
  },
  {
    id: "2_agents",
    title: "Ultime",
    description: "Offre PRO pour scaler ton équipe.",
    basePrice: 200,
    badge: "Recommandé",
    features: [
      "2 agents au choix + 1 bonus",
      "500 crédits",
      "Support",
      "Interface multicanal",
      "Conversations configurables",
      "Ton personnalisable",
      "Message personnalisés",
      "Commission 70%",
      "1 agent Assistant Chatbot (bientôt)"
    ],
  },
  {
    id: "custom",
    title: "Custom",
    description: "Pack sur-mesure, nous contacter pour un devis.",
    basePrice: 0,
    features: [
      "Support dédié",
      "Intégrations sur-mesure",
      "Formation + onboarding",
      "Service-level agreement",
    ],
  },
];

const billingHistory: BillingHistoryEntry[] = [];

const formatPrice = (value: number) =>
  `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;

// Fonction pour mapper planKey vers PlanId
const mapPlanKeyToPlanId = (planKey: PlanKey): PlanId | null => {
  switch (planKey) {
    case "basic":
      return "1_agent";
    case "ultime":
      return "2_agents";
    case "custom":
      return "custom";
    case "TESTEUR":
      return "1_agent";
    case "none":
      return null; // Pas de plan actuel
    default:
      return null;
  }
};

const calculateMonthlyCreditCost = (credits: number) => {
  const packs = credits / 50;
  let remaining = packs;
  let cost = 0;
  const tiers = [
    { limit: 10, price: 50 },
    { limit: 20, price: 40 },
  ];

  let previousLimit = 0;
  for (const tier of tiers) {
    const tierCapacity = tier.limit - previousLimit;
    const applicablePacks = Math.min(remaining, tierCapacity);
    if (applicablePacks > 0) {
      cost += applicablePacks * tier.price;
      remaining -= applicablePacks;
    }
    previousLimit = tier.limit;
    if (remaining <= 0) {
      break;
    }
  }

  if (remaining > 0) {
    cost += remaining * 35;
  }

  return cost;
};

const calculateYearlyCreditCost = (credits: number) => {
  const packs = credits / 50;
  let remaining = packs;
  let cost = 0;
  const tiers = [
    { limit: 10, price: 40 },
    { limit: 20, price: 32 },
  ];

  let previousLimit = 0;
  for (const tier of tiers) {
    const tierCapacity = tier.limit - previousLimit;
    const applicablePacks = Math.min(remaining, tierCapacity);
    if (applicablePacks > 0) {
      cost += applicablePacks * tier.price;
      remaining -= applicablePacks;
    }
    previousLimit = tier.limit;
    if (remaining <= 0) {
      break;
    }
  }

  if (remaining > 0) {
    cost += remaining * 28;
  }

  return cost;
};

const PricingPage: FunctionComponent = () => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [credits, setCredits] = useState(500);
  const [loadingPlanId, setLoadingPlanId] = useState<PlanId | null>(null);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  
  // Récupération de l'état d'abonnement réel
  const { data: subscriptionState, isLoading: subscriptionLoading, error: subscriptionError } = useSubscriptionState();
  
  // Détermination du plan actuel basé sur l'abonnement
  const userPlanId = subscriptionState ? mapPlanKeyToPlanId(subscriptionState.planKey) : null;
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(userPlanId);

  // Synchroniser l'état local avec les données d'abonnement
  useEffect(() => {
    if (subscriptionState) {
      const planId = mapPlanKeyToPlanId(subscriptionState.planKey);
      setCurrentPlan(planId);
    }
  }, [subscriptionState]);

  // Condition pour afficher le bouton "Gérer l'abonnement"
  const showManageButton = subscriptionState && 
    subscriptionState.planKey !== "none" && 
    subscriptionState.planKey !== "custom";

  const activePlan = currentPlan 
    ? planCatalog.find((plan) => plan.id === currentPlan) ?? planCatalog[0]
    : planCatalog[0]; // Plan par défaut si pas de plan actuel
  
  const monthlyCreditCost = useMemo(() => calculateMonthlyCreditCost(credits), [credits]);
  const yearlyCreditCost = useMemo(() => calculateYearlyCreditCost(credits), [credits]);
  
  const monthlyTotal = useMemo(
    () => activePlan.basePrice + monthlyCreditCost,
    [activePlan.basePrice, monthlyCreditCost],
  );
  const yearlyTotal = useMemo(
    () => (activePlan.basePrice * 12 * 0.8) + (yearlyCreditCost * 12),
    [activePlan.basePrice, yearlyCreditCost],
  );
  
  const currentCreditCost = billingCycle === "monthly" ? monthlyCreditCost : yearlyCreditCost;
  const sliderProgress = (credits / 2000) * 100;

  const onSelectPlan = async (planId: PlanId) => {
    if (planId === "custom") {
      return;
    }

    setLoadingPlanId(planId);

    try {
      // Récupérer la session utilisateur
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error("Erreur session:", sessionError);
        return;
      }

      // Debug: afficher les valeurs envoyées
      console.log("Données envoyées à Stripe:", { plan: planId, credits: credits, cycle: billingCycle });

      // Appel à l'Edge Function pour créer le checkout Stripe
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing/stripe-create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          plan: planId, 
          credits: credits, 
          cycle: billingCycle 
        }),
      });
      console.log(res)

      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }

      const { url } = await res.json();
      
      if (url) {
        // Mettre à jour le plan actuel et rediriger vers Stripe
        setCurrentPlan(planId);
        window.location.href = url;
        // Note: pas besoin de setLoadingPlanId(null) ici car la page va être redirigée
      } else {
        console.error("Aucune URL de checkout retournée");
        setLoadingPlanId(null);
      }
    } catch (error) {
      console.error("Erreur lors de la création du checkout:", error);
      setLoadingPlanId(null);
    }
  };

  const handleCreditsChange = (value: number) => {
    const normalized = Math.min(2000, Math.max(0, value));
    const stepped = Math.round(normalized / 50) * 50;
    setCredits(stepped);
  };

  const handleManageSubscription = async () => {
    setIsManagingSubscription(true);

    try {
      // Récupérer la session utilisateur
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error("Erreur session:", sessionError);
        return;
      }

      // Appel à l'Edge Function pour créer le portail Stripe
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing/stripe-create-portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }

      const { url } = await res.json();
      
      if (url) {
        // Rediriger vers le portail Stripe
        window.location.href = url;
        // Note: pas besoin de setIsManagingSubscription(false) ici car la page va être redirigée
      } else {
        console.error("Aucune URL de portail retournée");
        setIsManagingSubscription(false);
      }
    } catch (error) {
      console.error("Erreur lors de la création du portail:", error);
      setIsManagingSubscription(false);
    }
  };

  // Afficher un état de chargement pendant la récupération des données d'abonnement
  if (subscriptionLoading) {
    return (
      <AppLayout>
        <div className={styles.mainComponent}>
          <Header minimal showLogo={false} />
          <div className={styles.container}>
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <p>Chargement des informations d'abonnement...</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Afficher une erreur si la récupération a échoué (mais permettre l'utilisation normale)
  if (subscriptionError) {
    console.warn("Erreur lors de la récupération de l'abonnement:", subscriptionError);
  }

  return (
    <AppLayout>
      <div className={styles.mainComponent}>
        <Header minimal showLogo={false} />
        <div className={styles.container}>
        <section className={styles.headerSection}>
          <div className={styles.headerTop}>
            <div className={styles.headerLeft}>
              <div className={styles.headerContent}>
                <p className={styles.subtitle}>
                  Facturation & abonnements
                </p>
                <h1>
                  Pilotez vos paiements avec sérénité
                </h1>
                <p className={styles.description}>
                  Suivez les détails de vos abonnements, mettez à jour vos
                  informations de facturation et gardez la maîtrise de votre
                  expérience de paiement depuis un seul espace sécurisé.
                </p>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.headerActions}>
                <div
                  role="group"
                  aria-label="Choix de cycle de facturation"
                  className={styles.cycleToggle}
                >
                  <button
                    type="button"
                    className={`${styles.cycleButton} ${
                      billingCycle === "monthly" ? styles.active : ""
                    }`}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    Mensuel
                  </button>
                  <button
                    type="button"
                    className={`${styles.cycleButton} ${
                      billingCycle === "yearly" ? styles.active : ""
                    }`}
                    onClick={() => setBillingCycle("yearly")}
                  >
                    Annuel (−20 %)
                  </button>
                </div>
                {showManageButton && (
                  <button
                    type="button"
                    className={styles.manageButton}
                    onClick={handleManageSubscription}
                    disabled={isManagingSubscription}
                  >
                    {isManagingSubscription && (
                      <span className={styles.spinner}></span>
                    )}
                    {isManagingSubscription ? "Chargement..." : "Gérer l'abonnement"}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className={styles.creditsSection}>
            <div className={styles.creditsInfo}>
              <h3>
                {credits.toLocaleString("fr-FR")} credits / mois
              </h3>
              <p className={styles.label}>
                Augmentez votre limite de crédits mensuels
              </p>
            </div>
            <div className={styles.creditsExtra}>
              Crédits actuels : {credits} • Packs: {credits / 50}
            </div>
          </div>
          <div className={styles.sliderContainer}>
            <div className={styles.sliderTrack}>
              <div
                className={styles.sliderProgress}
                style={{ width: `${sliderProgress}%` }}
              />
              <input
                id="creditsRange"
                type="range"
                min={0}
                max={2000}
                step={50}
                value={credits}
                onChange={(event) =>
                  handleCreditsChange(Number(event.target.value))
                }
                aria-label="Crédits par mois"
                className={styles.sliderInput}
              />
            </div>
            <div className={styles.sliderTicks}>
              {creditTicks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div className={styles.sliderControls}>
              <label htmlFor="creditsInput">
                Ajuster
              </label>
              <input
                id="creditsInput"
                type="number"
                min={0}
                max={2000}
                step={50}
                value={credits}
                onChange={(event) =>
                  handleCreditsChange(Number(event.target.value))
                }
              />
            </div>
          </div>
        </section>

        <section className={styles.plansSection}>
          <div className={styles.plansHeader}>
            <div>
              <h2>
                Nos offres
              </h2>
              <p className={styles.description}>
                Basculer entre la facturation mensuelle et annuelle pour choisir
                le format le plus adapté.
              </p>
            </div>
            <div className={styles.plansTotal}>
              {billingCycle === "monthly"
                ? `Total mensuel : ${formatPrice(monthlyTotal)}`
                : `Total annuel : ${formatPrice(yearlyTotal)} (20 % de réduction)`}
            </div>
          </div>

          <div className={styles.plansGrid}>
            {planCatalog.map((plan) => {
              const isCustom = plan.id === "custom";
              const isCurrentPlan = currentPlan !== null && currentPlan === plan.id;
              
              let displayPrice = 0;
              if (!isCustom) {
                const planMonthlyCreditCost = calculateMonthlyCreditCost(credits);
                const planYearlyCreditCost = calculateYearlyCreditCost(credits);
                const planMonthly = plan.basePrice + planMonthlyCreditCost;
                const planYearly = (plan.basePrice * 12 * 0.8) + (planYearlyCreditCost * 12);
                displayPrice = billingCycle === "monthly" ? planMonthly : planYearly;
              }
              
              const isLoading = loadingPlanId === plan.id;
              const buttonLabel = isLoading
                ? "Chargement..."
                : isCustom
                ? "Contactez-nous"
                : isCurrentPlan
                ? "Plan actuel"
                : plan.id === "2_agents"
                ? "Passer à ce plan"
                : "Choisir ce plan";
              const buttonDisabled = isCurrentPlan || isLoading;

              return (
                <article
                  key={plan.id}
                  className={`${styles.planCard} ${
                    plan.id === "2_agents" ? styles.featured : ""
                  }`}
                >
                  <header className={styles.planHeader}>
                    <div className={styles.planTitleRow}>
                      <h3 className={styles.planTitle}>
                        {plan.title}
                      </h3>
                      {plan.badge && (
                        <span className={styles.planBadge}>
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    <p className={styles.planDescription}>
                      {plan.description}
                    </p>
                    {isCustom ? (
                      <p className={styles.planPrice}>
                        Tarif sur demande
                      </p>
                    ) : (
                      <>
                        {billingCycle === "yearly" && (
                          <p className={styles.originalPrice}>
                            {formatPrice(displayPrice / 0.8)}
                          </p>
                        )}
                        <p className={styles.planPrice}>
                          {formatPrice(displayPrice)}
                        </p>
                        <p className={styles.planCycle}>
                          {billingCycle === "monthly"
                            ? "Facturation mensuelle"
                            : "Facturation annuelle (−20 %)"}
                        </p>
                      </>
                    )}
                    {isCurrentPlan && (
                      <span className={styles.currentPlanBadge}>
                        Plan actuel
                      </span>
                    )}
                  </header>
                  <ul className={styles.planFeatures}>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div>
                    <button
                      type="button"
                      onClick={() => onSelectPlan(plan.id)}
                      disabled={buttonDisabled}
                      className={`${styles.planButton} ${
                        isCustom
                          ? styles.secondary
                          : buttonDisabled
                          ? styles.disabled
                          : styles.primary
                      }`}
                    >
                      {isLoading && (
                        <span className={styles.spinner}></span>
                      )}
                      {buttonLabel}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.breakdownSection}>
          <div className={styles.breakdownHeader}>
            <div>
              <h3>
                Détail de la facturation
              </h3>
              <p className={styles.description}>
                {billingCycle === "monthly"
                  ? `Base : ${formatPrice(activePlan.basePrice)} + Crédits : ${formatPrice(currentCreditCost)} (${credits / 50} packs)`
                  : `Base : ${formatPrice(activePlan.basePrice * 12 * 0.8)} + Crédits : ${formatPrice(currentCreditCost * 12)} (${credits / 50} packs × 12)`}
              </p>
            </div>
            <div className={styles.breakdownTotal}>
              {billingCycle === "monthly"
                ? `Total mensuel : ${formatPrice(monthlyTotal)}`
                : `Total annuel facturé : ${formatPrice(
                    yearlyTotal,
                  )} (20 % de réduction)`}
            </div>
          </div>
          <div className={styles.breakdownDetails}>
            <div className={styles.breakdownRow}>
              <span>Base {billingCycle === "yearly" ? "(12 mois × 20 % de remise)" : ""}</span>
              <span>{formatPrice(billingCycle === "monthly" ? activePlan.basePrice : activePlan.basePrice * 12 * 0.8)}</span>
            </div>
            <div className={styles.breakdownRow}>
              <span>Crédits ({credits / 50} packs{billingCycle === "yearly" ? " × 12 mois" : ""})</span>
              <span>{formatPrice(billingCycle === "monthly" ? currentCreditCost : currentCreditCost * 12)}</span>
            </div>
            <div className={`${styles.breakdownRow} ${styles.total}`}>
              <span>Total {billingCycle === "yearly" ? "annuel" : "mensuel"}</span>
              <span>
                {formatPrice(
                  billingCycle === "monthly" ? monthlyTotal : yearlyTotal,
                )}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.historySection}>
          <div className={styles.historyHeader}>
            <div>
              <h3>
                Historique des paiements
              </h3>
              <p className={styles.description}>
                Tous les paiements enregistrés et leur statut.
              </p>
            </div>
            <div className={styles.historyActions}>
              <input
                type="search"
                placeholder="Rechercher"
                aria-label="Rechercher un paiement"
              />
              <button
                type="button"
                className={styles.filterButton}
              >
                Filtrer
              </button>
              <button
                type="button"
                className={styles.exportButton}
              >
                Exporter
              </button>
            </div>
          </div>
          <div className={styles.historyTable}>
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Montant</th>
                  <th>Date d'achat</th>
                  <th>Fin</th>
                  <th>Statut</th>
                  <th aria-label="Actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {billingHistory.length > 0 ? (
                  billingHistory.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.planName}>
                        {row.plan}
                      </td>
                      <td className={styles.amount}>
                        {row.amount}
                      </td>
                      <td className={styles.date}>
                        {row.purchaseDate}
                      </td>
                      <td className={styles.date}>
                        {row.endDate}
                      </td>
                      <td>
                        <span
                          className={`${styles.statusChip} ${
                            row.status === "success" ? styles.success : styles.warning
                          }`}
                        >
                          {row.status === "success" ? "Payé" : "En attente"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <button
                            type="button"
                            className={styles.actionButton}
                            aria-label={`Télécharger la facture ${row.amount}`}
                          >
                            <span className="material-icons">download</span>
                          </button>
                          <button
                            type="button"
                            className={styles.actionButton}
                            aria-label={`Voir la facture ${row.amount}`}
                          >
                            <span className="material-icons">visibility</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--app-text-secondary)" }}>
                      Aucun historique de paiement disponible
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        </div>
      </div>
    </AppLayout>
  );
};

export default PricingPage;