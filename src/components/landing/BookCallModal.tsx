import { useEffect, useRef, useState } from "react";
import styles from "../../styles/landing/BookCallModal.module.css";
import { BOOKING_URL } from "../../config/landing";

type BookCallModalProps = {
  open: boolean;
  onClose: () => void;
};

type CalendlyMessage = {
  event?: string;
  payload?: {
    height?: number;
  };
};

const CALENDLY_EMBED_URL =
  "https://calendly.com/louis-lautopreneur/lead-control-diagnostic-coach?hide_event_type_details=1&hide_gdpr_banner=1";

const BookCallModal = ({ open, onClose }: BookCallModalProps) => {
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [widgetHeight, setWidgetHeight] = useState(760);
  const [availableEmbedHeight, setAvailableEmbedHeight] = useState(620);
  const safeEmbedHeight = Math.max(400, availableEmbedHeight);
  const widgetScale = widgetHeight > 0 ? Math.min(1, safeEmbedHeight / widgetHeight) : 1;
  const scaledWidgetWidth = widgetScale < 1 ? `${(100 / widgetScale).toFixed(3)}%` : "100%";

  const computeAvailableHeight = () => {
    if (!modalRef.current || !headerRef.current || !footerRef.current) {
      return;
    }

    const modalHeight = modalRef.current.clientHeight;
    const headerHeight = headerRef.current.offsetHeight;
    const footerHeight = footerRef.current.offsetHeight;
    const verticalGaps = 22;
    const nextHeight = modalHeight - headerHeight - footerHeight - verticalGaps;
    setAvailableEmbedHeight(Math.max(400, nextHeight));
  };

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
    if (!open) {
      return undefined;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    computeAvailableHeight();
    window.addEventListener("resize", computeAvailableHeight);
    return () => {
      window.removeEventListener("resize", computeAvailableHeight);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMessage = (event: MessageEvent<CalendlyMessage>) => {
      const data = event.data;
      if (!data || typeof data !== "object" || data.event !== "calendly.page_height") {
        return;
      }

      const height = Number(data.payload?.height);
      if (!Number.isFinite(height) || height <= 0) {
        return;
      }

      setWidgetHeight(Math.round(height) + 2);
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    computeAvailableHeight();
  }, [open, scriptLoaded]);

  useEffect(() => {
    if (!open || !widgetRef.current) {
      return;
    }

    setScriptLoaded(false);
    setScriptError(false);

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-calendly-widget]");
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.setAttribute("src", "https://assets.calendly.com/assets/external/widget.js");
    script.async = true;
    script.setAttribute("data-calendly-widget", "true");
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setScriptError(true);
    document.body.appendChild(script);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Reserver un call de decouverte"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.modal} ref={modalRef}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Fermer la fenetre"
        >
          x
        </button>

        <header className={styles.header} ref={headerRef}>
          <p className={styles.kicker}>Call de decouverte</p>
          <h2>Reservez votre call de decouverte et validez votre strategie DM</h2>
          <p>
            En 15 minutes, on clarifie votre cas d'usage et votre logique de qualification pour
            lancer rapidement.
          </p>
          <div className={styles.metaRow}>
            <span>15 min</span>
            <span>Sans engagement</span>
            <span>Visio Calendly</span>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.embedWrap}>
            {!scriptLoaded && !scriptError && (
              <div className={styles.embedPlaceholder}>
                <div className={styles.loader} aria-hidden="true" />
                <p>Chargement du calendrier...</p>
              </div>
            )}

            {scriptError && (
              <div className={styles.embedPlaceholder}>
                <p>Impossible de charger Calendly ici.</p>
                <a href={BOOKING_URL} target="_blank" rel="noreferrer" className={styles.primaryLink}>
                  Ouvrir la reservation
                </a>
              </div>
            )}

            <div className={styles.frame} style={{ height: `${safeEmbedHeight}px` }}>
              <div
                ref={widgetRef}
                className="calendly-inline-widget"
                data-url={CALENDLY_EMBED_URL}
                data-resize="true"
                style={{
                  minWidth: "320px",
                  width: scaledWidgetWidth,
                  height: `${widgetHeight}px`,
                  transform: `scale(${widgetScale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </section>
        </div>

        <footer className={styles.actions} ref={footerRef}>
          <p className={styles.actionNote}>Aucun paiement requis pour reserver ce call de decouverte.</p>
          <div className={styles.buttons}>
            <a href={BOOKING_URL} target="_blank" rel="noreferrer" className={styles.primaryLink}>
              Ouvrir dans un nouvel onglet
            </a>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Fermer
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default BookCallModal;
