import { FunctionComponent, RefObject } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { SubscriptionState } from "../../hooks/useSubscriptionState";
import CreditsProgressBar from "./CreditsProgressBar";
import styles from "./SidebarAccountCard.module.css";

export type SidebarAccountCardProps = {
  user: User | null;
  subscriptionState: SubscriptionState | undefined;
  isCollapsed: boolean;
  onProfileClick: () => void;
  triggerRef?: RefObject<HTMLButtonElement>;
};

const getPlanDisplayName = (planKey: string, status: string): string => {
  if (status === "trialing") return "Essai gratuit";
  
  switch (planKey) {
    case "basic":
      return "Plan Basic";
    case "ultime":
      return "Plan Ultime";
    case "custom":
      return "Plan Custom";
    case "none":
      return "Plan Gratuit";
    case "TESTEUR":
      return "TESTEUR";
    default:
      return "Plan Gratuit";
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
  isCollapsed,
  onProfileClick,
  triggerRef,
}) => {
  const navigate = useNavigate();

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

  const planDisplayName = subscriptionState 
    ? getPlanDisplayName(subscriptionState.planKey, subscriptionState.status)
    : "Plan Gratuit";
  
  const statusMessage = subscriptionState 
    ? getStatusMessage(subscriptionState.status)
    : null;

  const isTesteur = subscriptionState?.planKey === "TESTEUR";
  const creditsMonthly = !subscriptionState
    ? 100
    : isTesteur
    ? 1_000_000
    : subscriptionState.planKey === "none"
    ? 100
    : subscriptionState.creditsMonthly;
  
  const creditsBalance = !subscriptionState
    ? 100
    : isTesteur
    ? 1_000_000
    : subscriptionState.planKey === "none"
    ? 100
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
              <span className={styles.planName}>{planDisplayName}</span>
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
            {creditsBalance} / {creditsMonthly} crédits restants
          </span>
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