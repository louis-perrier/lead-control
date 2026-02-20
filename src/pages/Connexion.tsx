import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import OptionSearch from "../components/OptionSearch";
import optionSearchStyles from "../components/OptionSearch.module.css";
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

const CONNECTION_SORT_OPTIONS: Array<{ key: keyof Connection; label: string }> = [
  { key: "connectors_label", label: "Titre" },
  { key: "provider", label: "Plateforme" },
  { key: "connector_nb_liaison", label: "Liaisons" },
  { key: "updated_at", label: "Dernière connexion" },
];

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
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof Connection>(
    "connectors_label"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [providerFilters, setProviderFilters] = useState<string[]>([]);
  const providerFiltersActive = providerFilters.length > 0;

  const fetchConnections = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchConnections();
  }, []);

  const uniqueProviders = useMemo(
    () =>
      Array.from(
        new Set(
          connections
            .map((connection) => connection.provider)
            .filter(Boolean)
        )
      ).sort(),
    [connections]
  );

  const displayedConnections = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = connections.filter((connection) => {
      const matchesQuery =
        !normalizedQuery ||
        connection.connectors_label.toLowerCase().includes(normalizedQuery) ||
        connection.provider.toLowerCase().includes(normalizedQuery);
      const matchesProvider =
        providerFilters.length === 0 ||
        providerFilters.includes(connection.provider);
      return matchesQuery && matchesProvider;
    });
    const sorted = [...filtered].sort((a, b) => {
      const resolveValue = (item: Connection) => {
        if (sortColumn === "connector_nb_liaison") {
          return item.connector_nb_liaison;
        }
        if (sortColumn === "updated_at") {
          return item.updated_at
            ? new Date(item.updated_at).getTime()
            : Number.NEGATIVE_INFINITY;
        }
        const value = item[sortColumn];
        return typeof value === "string"
          ? value.toLowerCase()
          : String(value).toLowerCase();
      };
      const valueA = resolveValue(a);
      const valueB = resolveValue(b);
      if (typeof valueA === "number" && typeof valueB === "number") {
        return sortOrder === "desc" ? valueB - valueA : valueA - valueB;
      }
      const comparison = String(valueA).localeCompare(String(valueB));
      return sortOrder === "desc" ? -comparison : comparison;
    });
    return sorted;
  }, [connections, searchQuery, providerFilters, sortColumn, sortOrder]);

  const handleSortChange = (payload: {
    key: keyof Connection | string;
    order: "asc" | "desc";
  }) => {
    setSortColumn(payload.key as keyof Connection);
    setSortOrder(payload.order);
  };

  const toggleProviderFilter = (provider: string) => {
    setProviderFilters((prev) =>
      prev.includes(provider)
        ? prev.filter((current) => current !== provider)
        : [...prev, provider]
    );
  };

  const resetProviderFilters = () => {
    setProviderFilters([]);
  };

  const connectionFilterPopover = (
    <div className={optionSearchStyles.filterPopover}>
      <p className={optionSearchStyles.filterPopoverHeader}>
        Filtrer par plateforme
      </p>
      <div className={optionSearchStyles.filterPopoverList}>
        {uniqueProviders.map((provider) => (
          <label key={provider} className={optionSearchStyles.filterPopoverItem}>
            <input
              type="checkbox"
              checked={providerFilters.includes(provider)}
              onChange={() => toggleProviderFilter(provider)}
            />
            <span>{provider}</span>
          </label>
        ))}
        {uniqueProviders.length === 0 && (
          <span className={optionSearchStyles.filterPopoverEmpty}>
            Aucune donnée
          </span>
        )}
      </div>
      {providerFiltersActive && (
        <button
          type="button"
          className={optionSearchStyles.filterPopoverReset}
          onClick={resetProviderFilters}
        >
          Réinitialiser
        </button>
      )}
    </div>
  );

  const handleShowConfiguration = (connection: Connection) => {
    setActiveConfigs(connection.configurations);
    setSelectedAccount(connection.connectors_label);
  };

  const handleDisconnectClick = useCallback((connectorUserId: string) => {
    console.log("Déconnexion", connectorUserId);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchConnections();
  }, [fetchConnections]);

  type ConnectionAction = {
    onConnect: (connection: Connection) => void;
    onDisconnect: (connection: Connection) => void;
  };

  const connectionActions = useMemo<Record<string, ConnectionAction>>(
    () => ({
      instagram: {
        onConnect: () => handleRefresh(),
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      whatsapp: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      gmail: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      tiktok: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      linkedin: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      facebook: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      discord: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      telegram: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
      appel: {
        onConnect: handleRefresh,
        onDisconnect: (connection) =>
          handleDisconnectClick(connection.connector_user_id),
      },
    }),
    [handleDisconnectClick, handleRefresh]
  );

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
        <div className={styles.optionSearchWrapper}>
          <OptionSearch
            wrap={true}
            addButton={false}
            detailsButton={false}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={() => undefined}
            filterActive={providerFiltersActive}
            sortOptions={CONNECTION_SORT_OPTIONS}
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            filterPopover={connectionFilterPopover}
          />
        </div>
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
              {displayedConnections.map((connection) => (
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
                  {(() => {
                    const providerKey = (connection.provider ?? "").toLowerCase();
                    const actions = connectionActions[providerKey];
                    const handleDisconnect =
                      actions?.onDisconnect ??
                      ((conn: Connection) =>
                        handleDisconnectClick(conn.connector_user_id));
                    const handleConnect =
                      actions?.onConnect ??
                      ((conn: Connection) => {
                        handleRefresh();
                      });
                    return (
                      <>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => handleDisconnect(connection)}
                        >
                          Déconnexion
                        </button>
                        <button
                          type="button"
                          className={styles.actionButtonSecondary}
                          onClick={() => handleConnect(connection)}
                        >
                          Rafraîchir
                        </button>
                      </>
                    );
                  })()}
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
