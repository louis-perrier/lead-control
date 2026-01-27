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

const CornerBlock: FunctionComponent<{ // Mettre dans fichier à part et autres composants + (CO html) + Overlay aussi !!!
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
  const connectInstagram = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in");
      const res = await fetch("https://wxatvxfirhahjalneorq.supabase.co/functions/v1/smooth-worker", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ return_to: "http://localhost:5173/agentai/configuration" }),
      });
    
      const { auth_url } = await res.json();
      const popup = window.open(auth_url, "ig_oauth", "width=520,height=720");
      if (!popup) alert("Popup bloquée : autorise les popups pour localhost");
    } catch (error) {
      console.error(error);
    }
  };
  return(
    <div className={styles.connexionCard}>
      <img src={imageSrc} alt={title} className={styles.connexionCardImage} />
      <div className={styles.connexionCardBody}>
        <h5>{title}</h5>
        <p>{description}</p>
      </div>
      <button type="button" className={styles.connexionButton} onClick={connectInstagram}>
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
        iconBorder4="unset"
        iconPadding4="unset"
        iconBackgroundColor4="unset"
        iconBorder5="unset"
        iconPadding5="unset"
        iconBackgroundColor5="unset"
        dashboardSelected={false}
        subscriptionSelected={false}
        agentIaSelected
        crmSelected={false}
        dashboardShowIcon
        subscriptionShowIcon
        agentIaShowIcon
        crmShowIcon
        dashboardState="Enabled"
        subscriptionState="Enabled"
        agentIaState="Enabled"
        crmState="Enabled"
        dashboardLabelText="Dashboard"
        subscriptionLabelText="Subscription"
        agentIaLabelText="Agent IA"
        crmLabelText="CRM"
        dashboardIcon1="/Icon1.svg"
        subscriptionIcon1="/Icon.svg"
        agentIaIcon1="/Icon3.svg"
        crmIcon1="/Icon5.svg"
        dashboardShowBadgeLabel
        dashboardIconBorder="unset"
        subscriptionIconBorder="unset"
        agentIaIconBorder="unset"
        crmIconBorder="unset"
        dashboardIconPadding="unset"
        subscriptionIconPadding="unset"
        agentIaIconPadding="unset"
        crmIconPadding="unset"
        dashboardIconBackgroundColor="unset"
        subscriptionIconBackground="unset"
        agentIaIconBackgroundColor="unset"
        crmIconBackgroundColor="unset"
        size="Small"
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
        <OptionSearch1 />
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
