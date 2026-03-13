import {
  FunctionComponent,
  RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./ProfilePopover.module.css";

export type ProfilePopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement>;
};

const policyLinks = [
  {
    label: "Terms & Conditions",
    route: "/policy/terms-et-conditions",
  },
  {
    label: "Politique Utilisateur",
    route: "/policy/privacy-policy",
  }
];

const appLinks = [
  {
    label: "Découvrir l'application",
    route: "/app/demarer",
  },
];

const ProfilePopover: FunctionComponent<ProfilePopoverProps> = ({
  isOpen,
  onClose,
  triggerRef,
}) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position based on trigger element
  useEffect(() => {
    if (isOpen && triggerRef?.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const popoverHeight = 200; // Estimation approximative
      const popoverWidth = 200;

      let top = triggerRect.bottom + 8; // 8px de marge
      let left = triggerRect.left;

      // Vérifier si le popover dépasse en bas
      if (top + popoverHeight > viewportHeight) {
        top = triggerRect.top - popoverHeight - 8;
      }

      // Vérifier si le popover dépasse à droite  
      if (left + popoverWidth > viewportWidth) {
        left = triggerRect.right - popoverWidth;
      }

      // Vérifier si le popover dépasse à gauche
      if (left < 8) {
        left = 8;
      }

      setPosition({ top, left });
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const handleLogoutClick = async () => {
    onClose();
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Erreur lors de la déconnexion", error);
    }
  };

  const handleLinkClick = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.popoverOverlay}>
        <div 
          ref={popoverRef}
          className={styles.popoverContainer}
          role="menu"
          aria-label="Menu profil"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          <div className={styles.popoverContent}>
          <div className={styles.menuSection}>
            {appLinks.map((link) => (
              <Link
                key={link.route}
                to={link.route}
                className={styles.menuLink}
                onClick={handleLinkClick}
                role="menuitem"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className={styles.menuSection}>
            {policyLinks.map((link) => (
              <Link
                key={link.route}
                to={link.route}
                className={styles.menuLink}
                onClick={handleLinkClick}
                role="menuitem"
              >
                {link.label}
              </Link>
            ))}
          </div>
            
            <div className={styles.menuDivider} />
            
            <button
              type="button"
              className={styles.logoutButton}
              onClick={handleLogoutClick}
              role="menuitem"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>

    </>
  );
};

export default ProfilePopover;