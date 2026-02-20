import { useEffect, useRef } from "react";
import styles from "../../styles/landing/BookCallModal.module.css";
import { BOOKING_URL } from "../../config/landing";

type BookCallModalProps = {
  open: boolean;
  onClose: () => void;
};

const BookCallModal = ({ open, onClose }: BookCallModalProps) => {
  const widgetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || !widgetRef.current) {
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-calendly-widget]",
    );
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.setAttribute("src", "https://assets.calendly.com/assets/external/widget.js");
    script.async = true;
    script.setAttribute("data-calendly-widget", "true");
    document.body.appendChild(script);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Réserver un call">
      <div className={styles.modal}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Fermer la fenêtre"
        >
          ×
        </button>
        <h2>Réserve ton call LeadControl</h2>
        <p>
          Échange rapide, onboarding express et envoi automatique de ton lien Calendly. Le call confirme le
          lancement de ton essai.
        </p>
        <ul className={styles.bulletList}>
          <li>7 minutes pour configurer ton point d’arrêt.</li>
          <li>Support humain pendant l’essai gratuit.</li>
          <li>Tu restes maître des relances et de l’agent.</li>
        </ul>
        <div className={styles.frame}>
          <div
            ref={widgetRef}
            className="calendly-inline-widget"
            data-url="https://calendly.com/louis-lautopreneur/15min?hide_event_type_details=1&hide_gdpr_banner=1"
            style={{ minWidth: "320px", height: "700px" }}
          />
        </div>
        <div className={styles.actions}>
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.primaryLink}
          >
            Ouvrir dans un nouvel onglet
          </a>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookCallModal;
