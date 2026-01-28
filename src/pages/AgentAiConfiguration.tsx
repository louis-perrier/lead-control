import {
  FunctionComponent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import OptionSearch1 from "../components/OptionSearch1";
import styles from "./AgentAiConfiguration.module.css";
import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";
import useAgents from "../hooks/useAgents";


type CornerStatus = "available" | "lock" | "unlock";

type CornerSection = "Details" | "Connexions" | "Test" | "Configurations";

const CornerBlock: FunctionComponent<{ // Mettre fichier à part et autres composants + (CO html) + Overlay 
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

const ConnexionCard: FunctionComponent<ConnexionCardProps> = ({// Componsant Connexion Card
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


  // ------------------------------CONFIGS---------------------------------
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
        body: JSON.stringify({ return_to: "http://localhost:5173/agentai/configuration" }),
      });

      const { auth_url } = await res.json();
      const popup = window.open(auth_url, "ig_oauth", "width=520,height=720");
      if (!popup) alert("Popup bloquée : autorise les popups pour Lead Control");
      setTimeout(() => {
        popup?.close();// --> NICE
      }, 4000);
    } catch (error) {
      console.error(error);
    }
  };
  
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
                    <h4>Connecté</h4>
                    <ConnexionCard
                      title="Instagram"
                      description="Connecter Instagram"
                      imageSrc="/logoConnectors/instagram.webp"
                      actionLabel="Connecter"
                      onAction={connectInstagram}
                    />
                  </div>
                  <div className={styles.connexionSection}>
                    <h4>Déconnecté</h4>
                    <ConnexionCard
                      title="Déconnecté"
                      description="L’agent est déconnecté pour maintenance ou réglages."
                      imageSrc="/logoConnectors/instagram.webp"
                      actionLabel="Déconnecter"
                    />
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
