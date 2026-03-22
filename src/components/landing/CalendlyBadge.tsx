import { useEffect } from "react";
import { BOOKING_URL } from "../../config/landing";
import { ensureCalendlyScript, ensureCalendlyStyles } from "../../lib/calendly";

const CalendlyBadge = () => {
  useEffect(() => {
    let isMounted = true;

    ensureCalendlyStyles();
    ensureCalendlyScript()
      .then(() => {
        if (!isMounted) {
          return;
        }
        window.Calendly?.initBadgeWidget?.({
          url: BOOKING_URL,
          text: "Activer mon agent",
          color: "#0069ff",
          textColor: "#ffffff",
          branding: true,
        });
      })
      .catch(() => {
        // Fallback: Calendly n'est pas disponible, on ne fait rien
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return null;
};

export default CalendlyBadge;
