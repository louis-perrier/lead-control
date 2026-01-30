import { FunctionComponent, useState, useEffect } from "react";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import OptionSearch1 from "../components/OptionSearch1";
import styles from "./Connexion.module.css";
import supabase from "../lib/supabase";

type Connection = {
  connector_user_id: string;
  user_id: string;
  provider: string;
  connectors_label: string;
  created_at: string;
  updated_at: string;
  connector_nb_liaison: number;
  config_connected: string[];
};

type ConnectionCardProps = {
  icon: string;
  title: string;
  label: string;
  actionLabel: string;
  connector_nb_liaison: number;
  onClick: () => void;
};

const ConnectionCardForConnexion: FunctionComponent<ConnectionCardProps> = ({
  icon,
  title,
  label,
  actionLabel,
  connector_nb_liaison,
  onClick,
}) => (
  <div className={styles.connectionCard}>
    <div className={styles.connectionLogo}>
      <img src={icon} alt={`${title} logo`} />
    </div>
    <div className={styles.connectionContent}>
      <h3>{title}</h3>
      <p>{label}</p>
    </div>
    <div className={styles.connectionAction}>
      <p>{connector_nb_liaison}</p>
      <img src="/linkOn.svg" alt="link icon" className={styles.connectionLinkIcon}/>
      <button type="button" className={styles.connectionButton} onClick={onClick}>
        {actionLabel}
      </button>
    </div>
  </div>
);

type DisconnectConfirmationOverlayProps = {
  account?: string;
  onClose: () => void;
  cancelButtonLabel?: string;
  continueButtonLabel?: string;
};

const DisconnectConfirmationOverlay: FunctionComponent<DisconnectConfirmationOverlayProps> = ({
  account = "",
  onClose,
  cancelButtonLabel = "Annuler",
  continueButtonLabel = "Continuer",
}) => (
  <div className={styles.confirmationOverlay} onClick={onClose}>
    <div
      className={styles.confirmationBox}
      onClick={(event) => event.stopPropagation()}
    >
      <p className={styles.confirmationText}>Voulez-vous vraiment déconnecter ce compte {account} ?</p>
      <div className={styles.confirmationButtons}>
        <button type="button" className={styles.confirmationButton} disabled>
          {cancelButtonLabel}
        </button>
        <button type="button" className={styles.confirmationButton} disabled>
          {continueButtonLabel}
        </button>
      </div>
    </div>
  </div>
);

const Connexion: FunctionComponent = () => {

  const [connections, setConnections] = useState<Connection[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const fetchConnections = async () => {
    const { data, error } = await supabase.from("all_connectors_users").select("*, connectors_config_agent(*, agent_configs(*))");
    console.log(data)
    if (error) {
      console.error("Error fetching connections:", error);
      return;
    }
    setConnections(
      data.map((connection) => ({
        connector_user_id: connection.id,
        user_id: connection.user_id,
        provider: connection.provider,
        connectors_label: connection.connectors_label,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
        connector_nb_liaison: connection.connectors_config_agent.length,
        config_connected: connection.connectors_config_agent.map((config: any) => config.agent_configs.name_modif)
      }))
    );
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleDisconnectClick = () => {
    setShowConfirmation(true);
  };

  const closeConfirmation = () => {
    setShowConfirmation(false);
  };

  return (
    <div className={styles.connexion}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="connexion"
      />
      <main className={styles.rightcomponent}>
        <Header logoMarque="/logoMarque@2x.png" />
        <OptionSearch1 addButton={false} />
        <section className={styles.tableWrapper}>
          {connections.map((connection) => (
            <ConnectionCardForConnexion
              key={connection.connector_user_id}
              icon={`/logoConnectors/${connection.provider.toLowerCase()}.webp`}
              title={connection.connectors_label}
              label={connection.provider}
              actionLabel="Se Déconnecter"
              connector_nb_liaison={connection.connector_nb_liaison}
              onClick={handleDisconnectClick}
            />
          ))}
        </section>
        {showConfirmation && (
          <DisconnectConfirmationOverlay onClose={closeConfirmation} />
        )}
      </main>
    </div>
  );
};

export default Connexion;
