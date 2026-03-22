import { useCallback, useEffect, useState } from "react";
import { ensureCalendlyScript, ensureCalendlyStyles } from "../lib/calendly";
import { BOOKING_URL } from "../config/landing";

export const useCalendly = () => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    ensureCalendlyStyles();
    ensureCalendlyScript()
      .then(() => {
        if (isMounted) {
          setIsReady(true);
          setError(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const openCalendly = useCallback(() => {
    if (window.Calendly && isReady) {
      window.Calendly.initPopupWidget({ url: BOOKING_URL });
    } else {
      // Fallback: ouvrir dans un nouvel onglet
      window.open(BOOKING_URL, "_blank");
    }
  }, [isReady]);

  return { openCalendly, isReady, error };
};