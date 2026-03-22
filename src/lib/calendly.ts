const CALENDLY_SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";
const CALENDLY_STYLE_HREF = "https://assets.calendly.com/assets/external/widget.css";

let scriptPromise: Promise<void> | null = null;
let styleInjected = false;

export const ensureCalendlyStyles = () => {
  if (styleInjected) {
    return;
  }

  if (typeof document === "undefined") {
    return;
  }

  const existingLink = document.querySelector<HTMLLinkElement>("link[data-calendly-widget-css]");
  if (existingLink) {
    styleInjected = true;
    return;
  }

  const link = document.createElement("link");
  link.dataset.calendlyWidgetCss = "true";
  link.rel = "stylesheet";
  link.href = CALENDLY_STYLE_HREF;
  document.head.appendChild(link);
  styleInjected = true;
};

export const ensureCalendlyScript = () => {
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Document not available"));
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-calendly-widget]");
    if (existingScript) {
      if ((window as Window & { Calendly?: unknown }).Calendly) {
        resolve();
        return;
      }

      const onLoad = () => resolve();
      const onError = () => reject(new Error("Calendly script failed to load"));
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.calendlyWidget = "true";
    script.src = CALENDLY_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Calendly script failed to load")), { once: true });
    document.body.appendChild(script);
  })
    .catch((error) => {
      scriptPromise = null;
      throw error;
    });

  return scriptPromise;
};
