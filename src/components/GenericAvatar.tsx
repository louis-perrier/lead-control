import {
  FunctionComponent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ConfirmationDialog from "./ConfirmationDialog";
import styles from "./GenericAvatar.module.css";

export type GenericAvatarVariant = "default" | "wrapper" | "header";

export type GenericAvatarType = {
  className?: string;
  style?: string;
  variant?: GenericAvatarVariant;
  onSignOut?: () => void | Promise<void>;
};

const policyLinks = [
  {
    label: "Terms & Conditions",
    route: "/policy/terms-et-conditions",
  },
  {
    label: "Politique Utilisateur",
    route: "/policy/privacy-policy",
  },
];

const appLinks = [
  {
    label: "Guide de demarrage",
    description: "Comprendre l'application et activer ton setup",
    route: "/app/demarer",
  },
];

const logoutLabel = "Se déconnecter";

const GenericAvatar: FunctionComponent<GenericAvatarType> = ({
  className = "",
  style = "Avatar",
  variant = "default",
  onSignOut,
}) => {
  const { signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (confirmOpen) {
        return;
      }
      if (
        open &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setConfirmOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, confirmOpen]);

  const variantClass =
    variant === "header"
      ? styles.header
      : variant === "wrapper"
      ? styles.wrapper
      : "";

  const handleAvatarClick = () => {
    setOpen((prev) => !prev);
    if (open) {
      setConfirmOpen(false);
    }
  };

  const handleLogoutClick = () => {
    setConfirmOpen(true);
  };

  const handleConfirmLogout = async () => {
    setConfirmOpen(false);
    try {
      await signOut();
      setOpen(false);
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
        <img
          className={styles.avatarPlaceholderIcon}
          alt=""
          src="/Avatar-Placeholder.svg"
        />
      </button>
      {open && (
        <div className={styles.overlayMenu} role="menu" aria-label="Avatar menu">
          <div className={styles.menuHeader}>
            <span className={styles.menuTitle}>Mon compte</span>
            {user?.email && <span className={styles.menuMeta}>{user.email}</span>}
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
      <ConfirmationDialog
        open={confirmOpen}
        title="Déconnexion"
        message="Êtes-vous sûr de vouloir vous déconnecter ?"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
};

export default GenericAvatar;
