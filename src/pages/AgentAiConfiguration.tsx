import {
  FunctionComponent,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import TabComponent from "../components/TabComponent";
import Button from "../components/Button";
import styles from "./AgentAiConfiguration.module.css";
import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";
import useAgents from "../hooks/useAgents";
import { useConnectors } from "../hooks/useConnexion";
import socialComponents from "../components/Reseaux";
import CornerSections, { CornerSection } from "../components/CornerSections";


type Connexion = {
  imageSrc: string;
  onConnect: () => void;
  onDisconnect: () => void;
};

type ConfigurationLogo = {
  connectors_id: string;
  connectors_name: string;
  connectors_special?: boolean;
  connected?: boolean;
};

type ConnexionCardProps = {
  title: string;
  description: string;
  imageSrc: string;
  actionLabel: string;
  isAvailable?: boolean;
  onAction?: () => void;
};

const ConnexionCard: FunctionComponent<ConnexionCardProps> = ({
  title,
  description,
  imageSrc,
  actionLabel,
  isAvailable = true,
  onAction,
}) => {
  return (
    <div
      className={`${styles.connexionCard} ${
        !isAvailable ? styles.connexionCardDisabled : ""
      }`}
    >
      <img src={imageSrc} alt={title} className={styles.connexionCardImage} />
      <div className={styles.connexionCardBody}>
        <h5>{title}</h5>
        <p>{description}</p>
      </div>
      <Button
        className={`${styles.connexionButton} ${
          !isAvailable ? styles.connexionButtonDisabled : ""
        }`}
        onClick={onAction}
        disabled={!isAvailable}
      >
        {isAvailable ? actionLabel : "Bientôt"}
      </Button>
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
  const [detailsPrompt, setDetailsPrompt] = useState("");
  const [oldDetailsPrompt, setOldDetailsPrompt] = useState("");
  const [activeSocial, setActiveSocial] = useState<string | null>(null);

  const ActiveSocialComponent = activeSocial
    ? socialComponents[activeSocial as keyof typeof socialComponents] ?? null
    : null;

  useEffect(() => {
    if (activeCorner !== "Configurations") {
      setActiveSocial(null);
    }
  }, [activeCorner]);

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
    appel: {imageSrc: "/logoConnectors/appel.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}}, // Special celui-là !!
    instagram: {imageSrc: "/logoConnectors/instagram.webp",  onConnect: connectInstagram, onDisconnect: disconnectInstagram},
    whatsapp: {imageSrc: "/logoConnectors/whatsapp.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    gmail: {imageSrc: "/logoConnectors/gmail.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    tiktok: {imageSrc: "/logoConnectors/tiktok.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    linkedin: {imageSrc: "/logoConnectors/linkedin.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    facebook: {imageSrc: "/logoConnectors/facebook.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    discord: {imageSrc: "/logoConnectors/discord.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}},
    telegram: {imageSrc: "/logoConnectors/telegram.webp",  onConnect: ()=>{}, onDisconnect: ()=>{}}
  };


  // ------------------------------CONFIGURATIONS---------------------------------
  const configurationLogos = useMemo<ConfigurationLogo[]>(() => {

    const availableLogos = availableShow
      .filter((connector) => !connector.connectors_special)
      .map((connector) => ({
        connectors_id: connector.connectors_id,
        connectors_name: connector.connectors_name,
        connectors_special: connector.connectors_special,
        connected: false,
      }));

    const specialLogos = availableShow
      .filter((connector) => connector.connectors_special)
      .map((connector) => ({
        connectors_id: connector.connectors_id,
        connectors_name: connector.connectors_name,
        connectors_special: connector.connectors_special,
        connected: true,
      }));

    const connectedLogos = connectorConnected.map((connector) => ({
      connectors_id: connector.connectors_id,
      connectors_name: connector.connectors_name,
      connected: true,
    }));

    return [...connectedLogos, ...specialLogos, ...availableLogos];
  }, [availableShow, connectorAvailable, connectorConnected]);
  // ------------------------------PROMPT---------------------------------
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
        <CornerSections
          backgroundImage={selectedAgent?.backgroundSrc}
          onSelect={(section) => setActiveCorner(section)}
        />
        {activeCorner && selectedAgent && (
          <div
            className={styles.cornerOverlay}
            onClick={() => {setActiveCorner(null); setDetailsPrompt(oldDetailsPrompt)}}
          >
            <div
              className={styles.cornerOverlayContent}
              onClick={(event) => event.stopPropagation()}
            >
              {activeCorner === "Configurations" && (
                <>
                  <div className={styles.availableLogosWrapper}>
                    {configurationLogos.map((logo) => (
                      <button
                        key={`${logo.connectors_id}-${logo.connected ? "connected" : "available"}`}
                        type="button"
                        className={`${styles.availableLogoContainer} ${
                          logo.connected ? "" : styles.availableLogoButtonDisabled
                        }`}
                        disabled={!logo.connected}
                        onClick={() => {
                          if (logo.connected) {
                            setActiveSocial(logo.connectors_name.toLowerCase());
                          }
                        }}
                      >
                        <div
                          className={`${styles.availableLogoTrapezoid} ${
                            logo.connected ? "" : styles.availableLogoDisabled
                          } ${logo.connectors_special ? styles.availableLogoSpecial : ""}`}
                        >
                          <img
                            src={`/logoConnectors/${logo.connectors_name.toLowerCase()}.webp`}
                            alt={`${logo.connectors_name} logo`}
                            className={styles.availableLogo}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className={styles.socialComponentPanel}>
                    {ActiveSocialComponent ? (
                      <ActiveSocialComponent />
                    ) : (
                      <p className={styles.socialComponentPlaceholder}>
                        Aucune configuration sélectionnée.
                      </p>
                    )}
                  </div>
                  <div className={styles.configurationFooterWrapper}>
                    {ActiveSocialComponent && 
                    <div className={styles.configurationFooter}>
                      <Button
                        className={styles.configurationSaveButton}
                        onClick={() => {}}
                      >
                        Enregistrer
                      </Button>
                    </div>
                    }
                  </div>
                </>
              )}
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
                      {availableShow
                        .filter((connector) => !connector.connectors_special)
                        .map((connector) => (
                          <ConnexionCard
                            key={connector.connectors_id}
                            title={
                              connector.connectors_name.charAt(0).toUpperCase() +
                              connector.connectors_name.slice(1)
                            }
                            description={`Connecter ${connector.connectors_name}`}
                            imageSrc={connexions[connector.connectors_name].imageSrc}
                            actionLabel="Connecter"
                            isAvailable={connector.connectors_available}
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
