import { FunctionComponent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useSubscriptionState from "../hooks/useSubscriptionState";
import styles from "./GenericAvatar.module.css";

export type GenericAvatarVariant = "default" | "wrapper" | "header";

export type GenericAvatarType = {
  className?: string;
  style?: string;
  variant?: GenericAvatarVariant;
  onSignOut?: () => void | Promise<void>;
  showInitials?: boolean;
};

const policyLinks = [
  {
    label: "Termes & Services",
    route: "/policy/terms-et-conditions",
  },
  {
    label: "Politique Utilisateur",
    route: "/policy/privacy-policy",
  },
  {
    label: "Politique de suppression",
    route: "/policy/data-deletion",
  },
];

const appLinks = [
  {
    label: "Guide de demarrage",
    description: "Comprendre l'application et activer ton setup",
    route: "/app/demarer",
  },
  {
    label: "Facturation",
    description: "Consulter ton abonnement et l’historique des paiements",
    route: "/app/paiement",
  },
  {
    label: "Découvrir l'application",
    description: "Présentation complète de LeadControl",
    route: "/app/demarer",
  },
];

const logoutLabel = "Se déconnecter";

// Fonction pour mapper les planKey vers des noms d'affichage
const getPlanDisplayName = (planKey: string): string => {
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
      return "Plan inconnu";
  }
};

// Fonction pour générer les initiales depuis l'email
const getInitials = (email: string): string => {
  if (!email) return "??";
  const parts = email.split("@")[0];
  return parts.substring(0, 2).toUpperCase();
};

const GenericAvatar: FunctionComponent<GenericAvatarType> = ({
  className = "",
  style = "Avatar",
  variant = "default",
  showInitials = false,
  onSignOut,
}) => {
  const { signOut, user } = useAuth();
  const { data: subscriptionState, isLoading: subscriptionLoading } =
    useSubscriptionState();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        open &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const variantClass =
    variant === "header"
      ? styles.header
      : variant === "wrapper"
      ? styles.wrapper
      : "";

  const handleAvatarClick = () => {
    setOpen((prev) => !prev);
  };

  const handleLogoutClick = async () => {
    setOpen(false);
    try {
      await signOut();
      if (onSignOut) {
        await onSignOut();
      }
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Erreur lors de la déconnexion", error);
    }
  };

  const closeMenu = () => {
    setOpen(false);
  };

  const containerClass = [
    styles.container,
    variant === "header" ? styles.headerContainer : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass} ref={containerRef}>
      <button
        className={[styles.genericAvatar, variantClass, className]
          .filter(Boolean)
          .join(" ")}
        data-style={style}
        type="button"
        onClick={handleAvatarClick}
      >
        {showInitials && user?.email ? (
          <div className={styles.avatarInitials}>
            {getInitials(user.email)}
          </div>
        ) : (
          <img
            className={styles.avatarPlaceholderIcon}
            alt=""
            src="/Avatar-Placeholder.svg"
          />
        )}
      </button>
      {open && (
        <div className={styles.overlayMenu} role="menu" aria-label="Avatar menu">
          <div className={styles.menuHeader}>
            <span className={styles.menuTitle}>Mon compte</span>
            {user?.email && <span className={styles.menuMeta}>{user.email}</span>}
            <div className={styles.subscriptionInfo}>
              {subscriptionState ? (
                <>
                  <span className={
                    subscriptionState.planKey === "none" 
                      ? styles.freePlanName 
                      : styles.planName
                  }>
                    {getPlanDisplayName(subscriptionState.planKey)}
                  </span>
                  <span className={styles.creditsInfo}>
                    {subscriptionState.planKey === "none" 
                      ? "50 crédits disponibles"
                      : `${subscriptionState.creditsBalance} crédits restants`
                    }
                  </span>
                </>
              ) : subscriptionLoading ? (
                <>
                  <span className={styles.planSkeleton}>Chargement du plan...</span>
                  <span className={styles.creditsSkeleton}>Chargement des crédits...</span>
                </>
              ) : (
                <span className={styles.subscriptionError}>Plan non disponible</span>
              )}
            </div>
          </div>
          <div className={styles.menuSection}>
            <span className={styles.menuSectionTitle}>Commencer ici</span>
            {appLinks.map((link) => (
              <Link
                key={link.route}
                to={link.route}
                role="menuitem"
                className={[
                  styles.menuButton,
                  styles.linkButton,
                  styles.onboardingLinkButton,
                ].join(" ")}
                onClick={closeMenu}
              >
                <span className={styles.menuButtonLabel}>{link.label}</span>
                <span className={styles.menuButtonDescription}>
                  {link.description}
                </span>
              </Link>
            ))}
          </div>
          <div className={styles.menuSection}>
            <span className={styles.menuSectionTitle}>Informations</span>
            {policyLinks.map((link) => (
              <Link
                key={link.route}
                to={link.route}
                role="menuitem"
                className={[styles.menuButton, styles.linkButton].join(" ")}
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <button
            type="button"
            className={[styles.menuButton, styles.logoutButton].join(" ")}
            onClick={handleLogoutClick}
          >
            {logoutLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export default GenericAvatar;
