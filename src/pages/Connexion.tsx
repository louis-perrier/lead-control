import { FunctionComponent, useState, useEffect } from "react";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import OptionSearch from "../components/OptionSearch";
import styles from "./Connexion.module.css";
import tableStyles from "../styles/TableStyles.module.css";
import supabase from "../lib/supabase";

type ConfigurationDetail = {
  configId: string;
  configName: string;
  agentId?: string;
  statusLabel?: string;
};

type Connection = {
  connector_user_id: string;
  provider: string;
  connectors_label: string;
  updated_at: string;
  connector_nb_liaison: number;
  configurations: ConfigurationDetail[];
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date
    .toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\u202F/g, "");
};

const Connexion: FunctionComponent = () => {

  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConfigs, setActiveConfigs] = useState<ConfigurationDetail[] | null>(
    null
  );
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const fetchConnections = async () => {
    const { data, error } = await supabase
      .from("all_connectors_users")
      .select(
        "*, connectors_config_agent(*, agent_configs(*) )"
      );
    if (error) {
      console.error("Error fetching connections:", error);
      return;
    }
    setConnections(
      (data ?? []).map((connection: any) => {
        const configs = connection.connectors_config_agent ?? [];
        const configurationDetails: ConfigurationDetail[] = configs.map(
          (config: any) => ({
            configId:
              config.agent_configs?.configs_id ??
              config.agent_configs?.id ??
              "",
            configName: config.agent_configs?.name_modif ?? "Configuration",
            agentId: config.agent_configs?.agent_id,
            statusLabel:
              typeof config.agent_configs?.is_active === "boolean"
                ? config.agent_configs.is_active
                  ? "Actif"
                  : "Inactif"
                : undefined,
          })
        );
        return {
          connector_user_id: connection.id,
          provider: connection.provider,
          connectors_label: connection.connectors_label,
          updated_at: connection.updated_at,
          connector_nb_liaison: configurationDetails.length,
          configurations: configurationDetails,
        };
      })
    );
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleShowConfiguration = (connection: Connection) => {
    setActiveConfigs(connection.configurations);
    setSelectedAccount(connection.connectors_label);
  };

  const handleDisconnectClick = (connectorUserId: string) => {
    console.log("Déconnexion", connectorUserId);
  };

  const handleRefresh = () => {
    fetchConnections();
  };

  const closeConfigurationOverlay = () => {
    setActiveConfigs(null);
    setSelectedAccount(null);
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
        <OptionSearch wrap={true} addButton={false} />
        <section
          className={`${styles.tableWrapper} ${tableStyles.tableWrapper}`}
        >
          <table className={tableStyles.validationTable}>
            <thead>
              <tr>
                <th>Icone</th>
                <th>Titre</th>
                <th>Label</th>
                <th>Dernière connexion</th>
                <th>Liaisons</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => (
                <tr key={connection.connector_user_id}>
                  <td>
                    <img
                      src={`/logoConnectors/${connection.provider.toLowerCase()}.webp`}
                      alt={`${connection.provider} logo`}
                      className={styles.tableIcon}
                    />
                  </td>
                  <td>{connection.connectors_label}</td>
                  <td>{connection.provider}</td>
                  <td>{formatDate(connection.updated_at)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => handleShowConfiguration(connection)}
                    >
                      {connection.connector_nb_liaison}
                    </button>
                  </td>
                  <td className={styles.actionsCell}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() =>
                        handleDisconnectClick(connection.connector_user_id)
                      }
                    >
                      Déconnexion
                    </button>
                    <button
                      type="button"
                      className={styles.actionButtonSecondary}
                      onClick={handleRefresh}
                    >
                      Rafraîchir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {activeConfigs && (
          <div
            className={styles.configurationOverlay}
            onClick={closeConfigurationOverlay}
          >
            <div
              className={styles.configurationOverlayContent}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.overlayHeader}>
                <h3>{selectedAccount ?? "Configurations associées"}</h3>
                <button
                  type="button"
                  className={styles.overlayClose}
                  onClick={closeConfigurationOverlay}
                >
                  ×
                </button>
              </div>
              <ul className={styles.configurationList}>
                {activeConfigs.map((config) => (
                    <li key={config.configId || config.configName}>
                      <div>
                        <strong>{config.configName}</strong>
                      </div>
                      {config.statusLabel && (
                        <span className={styles.configurationStatus}>
                          {config.statusLabel}
                        </span>
                      )}
                    </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Connexion;
