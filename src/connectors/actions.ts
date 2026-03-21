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
          return_to: `https://leadcontrol.com${window.location.pathname}`,
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
  console.log("🔵 WhatsApp connection - START");
  console.log("🔍 Context configsId:", context.configsId);
  
  if (!context.configsId) {
    console.error("❌ No configsId provided");
    return;
  }
  
  try {
    console.log("🔍 Getting Supabase session...");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not logged in");
    console.log("✅ Session OK");
    
    console.log("🔍 Checking environment variables...");
    console.log("VITE_META_APP_ID:", import.meta.env.VITE_META_APP_ID);
    console.log("VITE_SUPABASE_ANON_KEY:", import.meta.env.VITE_SUPABASE_ANON_KEY ? "✅ Present" : "❌ Missing");
    
    // Appel à l'API WhatsApp OAuth start (même pattern qu'Instagram)
    console.log("🔍 Calling wa-oauth/start...");
    const res = await fetch(
      "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/wa-oauth/start",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          return_to: `https://leadcontrol.com${window.location.pathname}`,
          configs_id: context.configsId,
        }),
      }
    );
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const responseData = await res.json();
    console.log("✅ wa-oauth/start response:", responseData);
    const { auth_url } = responseData;
    
    if (!auth_url) {
      throw new Error("No auth_url in response");
    }
    
    // Extraire le state depuis l'URL d'auth
    const state = new URL(auth_url).searchParams.get('state');
    console.log("🔍 Extracted state:", state);
    
    // Vérifier le SDK Facebook
    console.log("🔍 Checking Facebook SDK...");
    console.log("window.FB:", typeof window.FB);
    
    // Utiliser le SDK Facebook pour WhatsApp Embedded Signup
    if (typeof window.FB !== 'undefined' && import.meta.env.VITE_META_APP_ID) {
      // TOUJOURS forcer l'initialisation avant utilisation
      console.log("🔧 Force initializing Facebook SDK...");
      try {
        window.FB.init({
          appId: import.meta.env.VITE_META_APP_ID,
          autoLogAppEvents: true,
          xfbml: true,
          version: 'v21.0'
        });
        console.log("✅ Facebook SDK force-initialized");
      } catch (initError) {
        console.error("❌ FB.init failed:", initError);
        return;
      }
      
      console.log("✅ Facebook SDK ready, calling FB.login...");
      window.FB.login(function(response: any) {
        console.log("🔍 FB.login response:", response);
        if (response.authResponse?.code) {
          console.log("✅ WhatsApp code received:", response.authResponse.code);
          console.log("🔄 Redirecting to callback with code...");
          
          // Appeler manuellement le callback avec le code
          window.location.href = `https://wxatvxfirhahjalneorq.supabase.co/functions/v1/wa-oauth/callback?code=${response.authResponse.code}&state=${state}`;
        } else {
          console.error("❌ WhatsApp connection cancelled or failed", response);
        }
      }, {
        config_id: '2000398807181284', // Config ID WhatsApp Business depuis Meta Dashboard
        response_type: 'code',
        override_default_response_type: true,
        extras: { state, setup: {} }
      });
    } else {
      console.error("❌ Facebook SDK not loaded");
      alert("Erreur : SDK Facebook non chargé. Veuillez rafraîchir la page.");
    }
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
