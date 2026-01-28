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
};

type ConnectionCardProps = {
  icon: string;
  title: string;
  label: string;
  actionLabel: string;
  onClick: () => void;
};

const ConnectionCard: FunctionComponent<ConnectionCardProps> = ({
  icon,
  title,
  label,
  actionLabel,
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
      <button type="button" className={styles.connectionButton} onClick={onClick}>
        {actionLabel}
      </button>
    </div>
  </div>
);

const Connexion: FunctionComponent = () => {

  const [connections, setConnections] = useState<Connection[]>([]);

  const fetchConnections = async () => {
    const { data, error } = await supabase.from('all_connectors_users').select('*');
    if (error) {
      console.error('Error fetching connections:', error);
      return;
    }
    setConnections(data.map(connection=>({
      connector_user_id: connection.id,
      user_id: connection.user_id,
      provider: connection.provider,
      connectors_label: connection.connectors_label,
      created_at: connection.created_at,
      updated_at: connection.updated_at,
    })));
    console.log(connections);
  }

  useEffect(() => {
    fetchConnections();
  }, []);
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
        <OptionSearch1 />
        <section className={styles.tableWrapper}>
          {connections.map(connection=>(
            <ConnectionCard
              key={connection.connector_user_id}
              icon={`/logoConnectors/${connection.provider.toLowerCase()}.webp`}
              title={connection.connectors_label}
              label={connection.provider}
              actionLabel="Se Déconnecter"
              onClick={()=>{}}
            />
          ))}
        </section>
      </main>
    </div>
  );
};

export default Connexion;
