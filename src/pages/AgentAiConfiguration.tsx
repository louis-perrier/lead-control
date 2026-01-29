import {
  FunctionComponent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useState,
  useMemo
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import styles from "./AgentAiConfiguration.module.css";
import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";
import useAgents from "../hooks/useAgents";
import { useConnectors } from "../hooks/useConnexion";


type Connexion = {
  imageSrc: string;
  onConnect: () => void;
  onDisconnect: () => void;
};

type CornerStatus = "available" | "lock" | "unlock";

type CornerSection = "Details" | "Connexions" | "Test" | "Configurations";

const CornerBlock: FunctionComponent<{ // Autres composants Décal + HTML (CO & Overlay) + fichier Connexion aussi 
  className: string;
  status: CornerStatus;
  title: string;
  onClick?: () => void;
}> = ({ className, status, title, onClick }) => {
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`${styles.cornerBlock} ${styles[`block${statusLabel}`]} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.cornerTitle}>{title}</span>
    </div>
  );
};

type ConnexionCardProps = {
  title: string;
  description: string;
  imageSrc: string;
  actionLabel: string;
  onAction?: () => void;
};

const ConnexionCard: FunctionComponent<ConnexionCardProps> = ({
  title,
  description,
  imageSrc,
  actionLabel,
  onAction,
}) => {
  return(
    <div className={styles.connexionCard}>
      <img src={imageSrc} alt={title} className={styles.connexionCardImage} />
      <div className={styles.connexionCardBody}>
        <h5>{title}</h5>
        <p>{description}</p>
      </div>
      <button type="button" className={styles.connexionButton} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
};


const AgentAi: FunctionComponent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { agent?: AgentInfo } | undefined;
  const { displayedAgents, refreshDisplayedAgents } = useAgents();
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>(
    state?.agent?.display_id
  );

  const selectedAgent = state?.agent ?? displayedAgents[0];
  console.log(selectedAgent);

  const [activeCorner, setActiveCorner] = useState<CornerSection | null>(null);

  // ------------------------------Navigation---------------------------------
  const goToAgentAi = useCallback(() => {
    navigate("/agentai");
  }, [navigate]);

  const goToAgentAiConfiguration = useCallback(
    (agent?: AgentInfo) => {
      navigate("/agentai/configuration", { state: { agent } });
    },
    [navigate]
  );

  useEffect(() => {// Set up ActiveAgentId
    if (state?.agent?.display_id) {
      setActiveAgentId(state.agent.display_id);
    }
  }, [state?.agent?.display_id]);

  useEffect(() => {// Set up ActiveAgentId
    if (!activeAgentId && displayedAgents.length > 0) {
      setActiveAgentId(displayedAgents[0].agent_id);
    } else if (
      activeAgentId &&
      !displayedAgents.some((agent) => agent.agent_id === activeAgentId)
    ) {
      setActiveAgentId(displayedAgents[0]?.agent_id);
    }
  }, [activeAgentId, displayedAgents]);


  useEffect(() => { //Initialisation New Agent
    if (selectedAgent) {
      const prompt = selectedAgent.configs.Details?.prompt ?? "";
      setDetailsPrompt(prompt);
      setOldDetailsPrompt(prompt);
    }
  }, [selectedAgent]);


  // ------------------------------CONNEXIONS---------------------------------
  const [activePopup, setActivePopup] = useState<Window | null>(null);
  const {
    connectorAvailable,
    connectorConnected,
    availableShow,
    countAvailableConnector,
    countConnectedConnector,
    refresh: refreshConnectors,
  } = useConnectors({
    agentId: selectedAgent?.agent_id,
    configsId: selectedAgent?.display_id,
  });
  
  useEffect(() => {
    const ch = supabase
      .channel("connectors_config_agent_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connectors_config_agent" },
        () => {
          if (activePopup) activePopup.close();
          refreshConnectors();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [activePopup, refreshConnectors]);


  const connectInstagram = async () => {// 1 connexion
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");
      const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/smooth-worker/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          "authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ return_to: "http://localhost:5173/agentai/configuration", configs_id: selectedAgent?.display_id }),
      });

      const { auth_url } = await res.json();
      const popup = window.open(auth_url, "ig_oauth", "width=520,height=720");
      if (!popup) alert("Popup bloquée : autorise les popups pour Lead Control");
      setActivePopup(popup);
    } catch (error) {
      console.error(error);
    }
  };

  const disconnectInstagram = async () => {// 1 déconnexion
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");
      const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/dynamic-responder/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          "authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({connector_id: connectorConnected.find((item) => item.connectors_name === "instagram")?.id})// A améliorer
      });

      const data = await res.text();
      if (data !== "OK") throw new Error("Failed to disconnect connector");
    } catch (error) {
      console.error(error);
    }
  };
  const connexions: Record<string, Connexion> = {
    instagram: {imageSrc: "/logoConnectors/instagram.webp",  onConnect: connectInstagram, onDisconnect: disconnectInstagram},
    whatsapp: {imageSrc: "/logoConnectors/whatsapp.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    gmail: {imageSrc: "/logoConnectors/gmail.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    tiktok: {imageSrc: "/logoConnectors/tiktok.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    linkedin: {imageSrc: "/logoConnectors/linkedin.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    facebook: {imageSrc: "/logoConnectors/facebook.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    discord: {imageSrc: "/logoConnectors/discord.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    telegram: {imageSrc: "/logoConnectors/telegram.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}}
  };

  // ------------------------------PROMPT---------------------------------
  const [detailsPrompt, setDetailsPrompt] = useState("");
  const [oldDetailsPrompt, setOldDetailsPrompt] = useState("");

  const handleSaveDetails = async () => { /* Un seul mais bien formaté*/
    if (!selectedAgent) return;
    setActiveCorner(null);
    setOldDetailsPrompt(detailsPrompt);
    const { error } = await supabase
      .from("agent_configs")
      .update({
        configs: {
          ...selectedAgent.configs,
          Details: {
            ...selectedAgent.configs.Details,
            prompt: detailsPrompt,
          },
        },
      })
      .eq("configs_id", selectedAgent.display_id);
    if (error) {
      console.error(error);
      return;
    }
    await refreshDisplayedAgents();
  };

  return (
    <div className={styles.agentai}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="agentia"
      />
      <main className={styles.rightcomponent}>
        <Header logoMarque="/logoMarque@2x.png" />
        <div className={styles.tabcomponent}>
          <TabComponent onClick={goToAgentAi} iconSrc="/tabComponentNotSelect.svg" />
          {displayedAgents.map((agent) => (
            <TabComponent
              key={agent.id}
              label={agent.name.toUpperCase()}
              iconSrc={
                selectedAgent?.name.toUpperCase() === agent.name.toUpperCase()
                  ? "/tabComponentSelect.svg"
                  : "/tabComponentNotSelect.svg"
              }
              closable
              onClick={() => {
                setActiveAgentId(agent.display_id);
                goToAgentAiConfiguration(agent);
              }}
              onClose={() => {
                setActiveAgentId(agent.display_id);
                goToAgentAiConfiguration(agent);
              }}
            />
          ))}
        </div>
        {selectedAgent && (
          <div className={styles.agentTitleWrapper}>
            <div className={styles.agentTitleText}>
              <h2>{selectedAgent.name.toUpperCase()}</h2>
              <img
                src="/switchOff.svg"
                alt="Switch off icon"
                className={styles.agentTitleIcon}
              />
            </div>
          </div>
        )}
        <div className={styles.claraContainer}>
          <div
            className={styles.claraBackground}
            style={{
              backgroundImage: `url(${selectedAgent?.backgroundSrc ?? "/CLARA-Background.png"})`,
            }}
          >
            <CornerBlock
              className={styles.cornerTopLeft}
              status="available"
              title="Details"
              onClick={() => setActiveCorner("Details")}
            />
            <CornerBlock
              className={styles.cornerTopRight}
              status="unlock"
              title="Connexions"
              onClick={() => setActiveCorner("Connexions")}
            />
            <CornerBlock
              className={styles.cornerBottomLeft}
              status="lock"
              title="Test"
              onClick={() => setActiveCorner("Test")}
            />
            <CornerBlock
              className={styles.cornerBottomRight}
              status="lock"
              title="Configurations"
              onClick={() => setActiveCorner("Configurations")}
            />
          </div>
        </div>
        {activeCorner && selectedAgent && (
          <div
            className={styles.cornerOverlay}
            onClick={() => {setActiveCorner(null); setDetailsPrompt(oldDetailsPrompt)}}
          >
            <div
              className={styles.cornerOverlayContent}
              onClick={(event) => event.stopPropagation()}
            >
              {activeCorner === "Details" && (
                <>
                  <label
                    className={styles.cornerOverlayLabel}
                    htmlFor="detailsPrompt"
                  >
                    Prompt
                  </label>
                  <textarea
                    id="detailsPrompt"
                    className={styles.cornerOverlayTextarea}
                    value={detailsPrompt}
                    placeholder="Rédige ton prompt..."
                    onChange={(event) => setDetailsPrompt(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.cornerOverlaySave}
                    onClick={handleSaveDetails}
                  >
                    Enregistrer
                  </button>
                </>
              )}
              {activeCorner === "Connexions" && (
                <div className={styles.connexionSections}>
                  <div className={styles.connexionSection}>
                    <h4>Connecté ({countConnectedConnector})</h4>
                    <div className={styles.connexionSectionCards}>
                      {connectorConnected.map((connector) => (
                        <ConnexionCard
                          key={connector.connectors_id}
                          title={connector.connectors_name.charAt(0).toUpperCase() + connector.connectors_name.slice(1)}
                          description={connector.connector_label ?? ""}
                          imageSrc={connexions[connector.connectors_name].imageSrc}
                          actionLabel="Déconnecter"
                          onAction={connexions[connector.connectors_name].onDisconnect}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={styles.connexionSection}>
                    <h4>Déconnecté ({countAvailableConnector-countConnectedConnector})</h4>
                    <div className={styles.connexionSectionCards}>
                      {availableShow.map((connector) => (
                        <ConnexionCard
                          key={connector.connectors_id}
                          title={connector.connectors_name.charAt(0).toUpperCase() + connector.connectors_name.slice(1)}
                          description={`Connecter ${connector.connectors_name}`}
                          imageSrc={connexions[connector.connectors_name].imageSrc}
                          actionLabel="Connecter"
                          onAction={connexions[connector.connectors_name].onConnect}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AgentAi;
