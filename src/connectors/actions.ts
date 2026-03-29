import supabase from "../lib/supabase";

type ConnectorConnectedRef = {
  connectors_name: string;
  id?: string;
};

type ConnectorActionsContext = {
  configsId?: string | null;
  connectorConnected?: ConnectorConnectedRef[];
  setActivePopup?: (popup: Window | null) => void;
  onSuccess?: () => void;
};

export type ConnectorAction = {
  imageSrc: string;
  color: string;
  onConnect: () => void;
  onDisconnect: () => void;
};

const DEFAULT_CONTEXT: Required<ConnectorActionsContext> = {
  configsId: null,
  connectorConnected: [],
  setActivePopup: () => {},
  onSuccess: () => {},
};

const normalizeContext = (
  context: ConnectorActionsContext
): Required<ConnectorActionsContext> => ({
  configsId: context.configsId ?? null,
  connectorConnected: context.connectorConnected ?? [],
  setActivePopup: context.setActivePopup ?? (() => {}),
  onSuccess: context.onSuccess ?? (() => {}),
});

const createConnectInstagram = (
  context: Required<ConnectorActionsContext>
) => async () => {
  if (!context.configsId) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/smooth-worker/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          return_to: window.location.href,
          configs_id: context.configsId,
        }),
      }
    );
    const { auth_url } = await res.json();
    const popup = window.open(auth_url, "ig_oauth", "width=520,height=720");
    if (!popup) alert("Popup bloquée : autorise les popups pour Lead Control");
    context.setActivePopup(popup);
  } catch (error) {
    console.error(error);
  }
};

const createDisconnectInstagram = (
  context: Required<ConnectorActionsContext>
) => async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");
    const connectorId = context.connectorConnected.find(
      (item) => item.connectors_name.toLowerCase() === "instagram"
    )?.id;
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/dynamic-responder/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ connector_id: connectorId }),
      }
    );
    const data = await res.text();
    if (data !== "OK") throw new Error("Failed to disconnect connector");
  } catch (error) {
    console.error(error);
  }
};

export const buildConnectorActions = (
  context: ConnectorActionsContext = DEFAULT_CONTEXT
): Record<string, ConnectorAction> => {
  const ctx = normalizeContext(context);
  return {
    appel: {
      imageSrc: "/logoConnectors/appel.svg",
      color:"",
      onConnect: () => {},
      onDisconnect: () => {},
    },
    instagram: {
      imageSrc: "/logoConnectors/instagram.svg",
      color: "",
      onConnect: createConnectInstagram(ctx),
      onDisconnect: createDisconnectInstagram(ctx),
    },
    whatsapp: {
      imageSrc: "/logoConnectors/whatsapp.webp",
      color: "",
      onConnect: createConnectWhatsApp(ctx),
      onDisconnect: createDisconnectWhatsApp(ctx),
    },
    gmail: {
      imageSrc: "/logoConnectors/gmail.webp",
      color: "",
      onConnect: () => {},
      onDisconnect: () => {},
    },
    tiktok: {
      imageSrc: "/logoConnectors/tiktok.webp",
      color: "",
      onConnect: () => {},
      onDisconnect: () => {},
    },
    linkedin: {
      imageSrc: "/logoConnectors/linkedin.webp",
      color: "",
      onConnect: () => {},
      onDisconnect: () => {},
    },
    facebook: {
      imageSrc: "/logoConnectors/facebook.webp",
      color: "",
      onConnect: () => {},
      onDisconnect: () => {},
    },
    discord: {
      imageSrc: "/logoConnectors/discord.webp",
      color: "",
      onConnect: () => {},
      onDisconnect: () => {},
    },
    telegram: {
      imageSrc: "/logoConnectors/telegram.webp",
      color: "",
      onConnect: () => {},
      onDisconnect: () => {},
    },
  };
};

const createConnectWhatsApp = (
  context: Required<ConnectorActionsContext>
) => async () => {
  if (!context.configsId) {
    console.error("❌ No configsId provided");
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");

    const WA_CONFIG_ID = import.meta.env.VITE_WA_CONFIG_ID;
    if (!WA_CONFIG_ID) throw new Error("VITE_WA_CONFIG_ID manquant");

    let capturedWabaId: string | null = null;
    let capturedPhoneNumberId: string | null = null;

    const sessionInfoListener = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP") {
          capturedWabaId = data.data?.waba_id ?? null;
          capturedPhoneNumberId = data.data?.phone_number_id ?? null;
          console.log("✅ WA session info capturée:", { capturedWabaId, capturedPhoneNumberId });
        }
      } catch {}
    };

    window.addEventListener("message", sessionInfoListener);

    window.FB.login(async (response: any) => {
      window.removeEventListener("message", sessionInfoListener);

      if (!response.authResponse?.code) {
        console.warn("⚠️ FB.login annulé ou refusé", response);
        return;
      }

      try {
        const res = await fetch(
          "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/wa-oauth/connect",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              code: response.authResponse.code,
              waba_id: capturedWabaId,
              phone_number_id: capturedPhoneNumberId,
              configs_id: context.configsId,
            }),
          }
        );

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Erreur serveur: ${res.status} ${txt}`);
        }

        context.onSuccess?.();
      } catch (err) {
        console.error("❌ WhatsApp connect error:", err);
        alert(`Erreur connexion WhatsApp: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, {
      config_id: WA_CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        sessionInfoVersion: 2,
      },
    });

  } catch (error) {
    console.error("❌ WhatsApp connection error:", error);
    alert(`Erreur WhatsApp: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const createDisconnectWhatsApp = (
  context: Required<ConnectorActionsContext>
) => async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");
    
    const connectorId = context.connectorConnected.find(
      (item) => item.connectors_name.toLowerCase() === "whatsapp"
    )?.id;
    
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/dynamic-responder/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ connector_id: connectorId }),
      }
    );
    
    const data = await res.text();
    if (data !== "OK") throw new Error("Failed to disconnect WhatsApp connector");
  } catch (error) {
    console.error("WhatsApp disconnection error:", error);
  }
};
