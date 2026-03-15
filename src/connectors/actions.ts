import supabase from "../lib/supabase";

type ConnectorConnectedRef = {
  connectors_name: string;
  id?: string;
};

type ConnectorActionsContext = {
  configsId?: string | null;
  connectorConnected?: ConnectorConnectedRef[];
  setActivePopup?: (popup: Window | null) => void;
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
};

const normalizeContext = (
  context: ConnectorActionsContext
): Required<ConnectorActionsContext> => ({
  configsId: context.configsId ?? null,
  connectorConnected: context.connectorConnected ?? [],
  setActivePopup: context.setActivePopup ?? (() => {}),
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
          return_to: "https://leadcontrol.com/app/agentai",
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
      onConnect: () => {},
      onDisconnect: () => {},
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
