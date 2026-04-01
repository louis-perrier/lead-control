import { FunctionComponent, RefObject, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { SubscriptionState } from "../../hooks/useSubscriptionState";
import CreditsProgressBar from "./CreditsProgressBar";
import styles from "./SidebarAccountCard.module.css";

export type SidebarAccountCardProps = {
  user: User | null;
  subscriptionState: SubscriptionState | undefined;
  isLoading?: boolean;
  isCollapsed: boolean;
  onProfileClick: () => void;
  triggerRef?: RefObject<HTMLButtonElement>;
};

const getPlanDisplayName = (planKey: string, status: string): string => {
  if (status === "trialing") return "Essai gratuit";

  switch (planKey) {
    case "coach_basic":
      return "PLAN BASIC";
    case "coach_premium":
      return "PLAN PREMIUM";
    case "TESTEUR":
      return "TESTEUR";
    case "none":
    case "inactive":
      return "Plan gratuit";
    default:
      return "Plan LeadControl";
  }
};

const getStatusMessage = (status: string): string | null => {
  switch (status) {
    case "canceled":
      return "Abonnement annulé";
    case "past_due":
      return "Paiement à régulariser";
    case "incomplete":
      return "Configuration incomplète";
    default:
      return null;
  }
};

const getInitials = (email: string): string => {
  if (!email) return "??";
  const parts = email.split("@")[0];
  return parts.substring(0, 2).toUpperCase();
};

const SidebarAccountCard: FunctionComponent<SidebarAccountCardProps> = ({
  user,
  subscriptionState,
  isLoading = false,
  isCollapsed,
  onProfileClick,
  triggerRef,
}) => {
  const navigate = useNavigate();
  const hintRef = useRef<HTMLSpanElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const handleHintEnter = () => {
    if (!hintRef.current) return;
    const rect = hintRef.current.getBoundingClientRect();
    setTooltipPos({ top: rect.top - 34, left: rect.right });
  };

  const handleHintLeave = () => setTooltipPos(null);

  if (isCollapsed) {
    return (
      <div className={styles.accountCardCollapsed}>
        <button
          type="button"
          className={styles.avatarButtonCollapsed}
          onClick={onProfileClick}
          aria-label="Menu profil"
          ref={triggerRef}
        >
          <div className={styles.avatarCollapsed}>
            {user?.email ? getInitials(user.email) : "??"}
          </div>
        </button>
      </div>
    );
  }

  // Affichage du loader pendant le chargement de l'abonnement
  if (isLoading) {
    return (
      <div className={styles.accountCard}>
        <div className={styles.loadingSubscription}>
          <div className={styles.logoSpinner}>
            <img 
              src="/logo@2x.png" 
              alt="LeadControl" 
              className={styles.spinningLogo}
            />
          </div>
          <div className={styles.loadingText}>
            <div className={styles.loadingLine}></div>
            <div className={styles.loadingLine}></div>
          </div>
        </div>
      </div>
    );
  }

  const planDisplayName = subscriptionState
    ? getPlanDisplayName(subscriptionState.planKey, subscriptionState.status)
    : "Plan gratuit";
  const isFreePlan =
    !subscriptionState ||
    subscriptionState.planKey === "none" ||
    subscriptionState.status === "inactive";
  
  const statusMessage = subscriptionState 
    ? getStatusMessage(subscriptionState.status)
    : null;

  const creditsMonthly = !subscriptionState
    ? 0
    : subscriptionState.planKey === "none"
    ? 0
    : subscriptionState.creditsMonthly;
  
  const creditsBalance = !subscriptionState
    ? 0
    : subscriptionState.planKey === "none"
    ? 0
    : subscriptionState.creditsBalance;

  const showUpgradeButton = !subscriptionState || subscriptionState.planKey === "none";

  const handleUpgradeClick = () => {
    navigate("/app/paiement");
  };

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountInfo}>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={onProfileClick}
          ref={triggerRef}
        >
          <div className={styles.avatar}>
            {user?.email ? getInitials(user.email) : "??"}
          </div>
        </button>

        <div className={styles.accountDetails}>
          <span className={styles.userEmail}>
            {user?.email || "Non connecté"}
          </span>
          <div className={styles.planInfo}>
            {planDisplayName === "Essai gratuit" ? (
              <span className={styles.trialBadge}>{planDisplayName}</span>
            ) : (
              <span className={isFreePlan ? styles.freePlanName : styles.planName}>
                {planDisplayName}
              </span>
            )}
            {statusMessage && (
              <span className={styles.statusMessage}>{statusMessage}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.creditsSection}>
        <div className={styles.creditsInfo}>
          <span className={styles.creditsText}>
            {creditsBalance.toLocaleString("fr-FR")} / {creditsMonthly.toLocaleString("fr-FR")} crédits
          </span>
          <span
            ref={hintRef}
            className={styles.creditsHint}
            onMouseEnter={handleHintEnter}
            onMouseLeave={handleHintLeave}
          >!</span>
          {tooltipPos && createPortal(
            <div
              className={styles.creditsTooltip}
              style={{ top: tooltipPos.top, left: tooltipPos.left }}
            >
              1 message = 1 crédit
            </div>,
            document.body
          )}
        </div>
        <CreditsProgressBar
          current={creditsBalance}
          total={creditsMonthly}
        />
      </div>

      {showUpgradeButton && (
        <button
          type="button"
          className={styles.upgradeButton}
          onClick={handleUpgradeClick}
        >
          Upgrade plan →
        </button>
      )}
    </div>
  );
};

export default SidebarAccountCard;
