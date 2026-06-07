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

const createConnectCalendly = (
  context: Required<ConnectorActionsContext>,
  accessToken: string
) => async () => {
  if (!context.configsId) return;
  try {
    if (!accessToken) throw new Error("Not logged in");
    const return_to = `https://leadcontrol.fr/app/agentai/configuration?configs_id=${context.configsId}`;
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/calendly-oauth/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          return_to,
          configs_id: context.configsId,
        }),
      }
    );
    const { auth_url } = await res.json();
    window.location.href = auth_url;
  } catch (error) {
    console.error(error);
  }
};

const createDisconnectCalendly = (
  context: Required<ConnectorActionsContext>,
  accessToken: string
) => async () => {
  try {
    if (!accessToken) throw new Error("Not logged in");
    const connectorId = context.connectorConnected.find(
      (item) => item.connectors_name.toLowerCase() === "calendly"
    )?.id;
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/dynamic-responder/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ connector_id: connectorId }),
      }
    );
    const data = await res.text();
    if (data !== "OK") throw new Error("Failed to disconnect Calendly connector");
  } catch (error) {
    console.error(error);
  }
};

const createConnectInstagram = (
  context: Required<ConnectorActionsContext>,
  accessToken: string
) => async () => {
  if (!context.configsId) return;
  try {
    if (!accessToken) throw new Error("Not logged in");
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/smooth-worker/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${accessToken}`,
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
  context: Required<ConnectorActionsContext>,
  accessToken: string
) => async () => {
  try {
    if (!accessToken) throw new Error("Not logged in");
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
          authorization: `Bearer ${accessToken}`,
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
  context: ConnectorActionsContext = DEFAULT_CONTEXT,
  accessToken: string = ""
): Record<string, ConnectorAction> => {
  const ctx = normalizeContext(context);
  return {
    appel: {
      imageSrc: "/logoConnectors/appel.svg",
      color:"",
      onConnect: () => {},
      onDisconnect: () => {},
    },
    calendly: {
      imageSrc: "/logoConnectors/calendly.svg",
      color: "#006BFF",
      onConnect: createConnectCalendly(ctx, accessToken),
      onDisconnect: createDisconnectCalendly(ctx, accessToken),
    },
    instagram: {
      imageSrc: "/logoConnectors/instagram.svg",
      color: "",
      onConnect: createConnectInstagram(ctx, accessToken),
      onDisconnect: createDisconnectInstagram(ctx, accessToken),
    },
    whatsapp: {
      imageSrc: "/logoConnectors/whatsapp.webp",
      color: "",
      onConnect: createConnectWhatsApp(ctx, accessToken),
      onDisconnect: createDisconnectWhatsApp(ctx, accessToken),
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
  context: Required<ConnectorActionsContext>,
  accessToken: string
) => async () => {
  if (!context.configsId) {
    console.error("❌ No configsId provided");
    return;
  }
  try {
    if (!accessToken) throw new Error("Not logged in");

    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/wa-oauth/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          return_to: `https://leadcontrol.fr${window.location.pathname}`,
          configs_id: context.configsId,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const { auth_url } = await res.json();
    if (!auth_url) throw new Error("No auth_url in response");

    const popup = window.open(
      auth_url,
      "wa_oauth",
      "width=600,height=700,left=400,top=100"
    );
    if (!popup) {
      alert("Popup bloquée : autorise les popups pour Lead Control");
      return;
    }
    context.setActivePopup(popup);
  } catch (error) {
    console.error("❌ WhatsApp connection error:", error);
    alert(`Erreur WhatsApp: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const createDisconnectWhatsApp = (
  context: Required<ConnectorActionsContext>,
  accessToken: string
) => async () => {
  try {
    if (!accessToken) throw new Error("Not logged in");
    
    const connectorId = context.connectorConnected.find(
      (item) => item.connectors_name.toLowerCase() === "whatsapp"
    )?.id;
    
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/dynamic-responder/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
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
