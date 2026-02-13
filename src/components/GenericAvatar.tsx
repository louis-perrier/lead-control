import { FunctionComponent, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import ConfirmationDialog from "./ConfirmationDialog";
import styles from "./GenericAvatar.module.css";

export type GenericAvatarVariant = "default" | "wrapper" | "header";

export type GenericAvatarType = {
  className?: string;
  style?: string;
  variant?: GenericAvatarVariant;
  menuItems?: string[];
  onSignOut?: () => void | Promise<void>;
};

const GenericAvatar: FunctionComponent<GenericAvatarType> = ({
  className = "",
  style = "Avatar",
  variant = "default",
  menuItems = ["Paramètres", "Préférences", "Aide", "Se déconnecter"],
  onSignOut,
}) => {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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
  }, [open]);

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
    await signOut();
    if (onSignOut) {
      await onSignOut();
    }
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
          {menuItems.slice(0, -1).map((label) => (
            <button
              key={label}
              type="button"
              className={styles.menuButton}
              disabled
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={[styles.menuButton, styles.logoutButton].join(" ")}
            onClick={handleLogoutClick}
          >
            {menuItems.at(-1)}
          </button>
          <ConfirmationDialog
            open={confirmOpen}
            title="Déconnexion"
            message="Êtes-vous sûr de vouloir vous déconnecter ?"
            onClose={() => setConfirmOpen(false)}
            onConfirm={handleConfirmLogout}
          />
        </div>
      )}
    </div>
  );
};

export default GenericAvatar;
