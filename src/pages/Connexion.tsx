import {
  FunctionComponent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { AppLayout } from "../layouts";
import Header from "../components/Header";
import OptionSearch from "../components/OptionSearch";
import optionSearchStyles from "../components/OptionSearch.module.css";
import styles from "./Connexion.module.css";
import supabase from "../lib/supabase";
import { buildConnectorActions } from "../connectors/actions";
import ConfirmationDialog from "../components/ConfirmationDialog";
import Button from "../components/Button";

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
  refresh_status: "ok" | "failed";
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
  const location = useLocation();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConfigs, setActiveConfigs] = useState<ConfigurationDetail[] | null>(
    null
  );
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [connectorUserId, setConnectorUserId] = useState<string | null>(null);
  const [activePopup, setActivePopup] = useState<Window | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof Connection>(
    "connectors_label"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [providerFilters, setProviderFilters] = useState<string[]>([]);
  const providerFiltersActive = providerFilters.length > 0;
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [oauthMessageType, setOauthMessageType] = useState<'success' | 'error' | null>(null);
  const configurationBackdropPointerDownRef = useRef(false);

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
    if (!Array.isArray(data)) {
      console.warn("fetchConnections: unexpected payload, resetting connections", data);
      setConnections([]);
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
          refresh_status: connection.refresh_status ?? "ok",
        };
      })
    );
  }, []);

  useEffect(() => {
    fetchConnections();
  }, []);

  // Gérer les query params OAuth Instagram au retour
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const igConnected = urlParams.get('ig_connected');
    const igError = urlParams.get('ig_error');
    
    if (igConnected === '1') {
      // Succès - comportement existant + message optionnel
      setOauthMessage("Compte Instagram connecté avec succès !");
      setOauthMessageType('success');
      
      // Rafraîchir les données des connexions
      fetchConnections();
    } else if (igError === 'already_connected') {
      // Erreur - afficher le message d'erreur
      setOauthMessage("Ce compte Instagram est déjà connecté à un autre agent");
      setOauthMessageType('error');
    }
    
    // Nettoyer les query params de l'URL
    if (igConnected || igError) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('ig_connected');
      newUrl.searchParams.delete('ig_error');
      
      // Remplacer l'URL sans recharger la page
      window.history.replaceState({}, '', newUrl.toString());
      
      // Auto-effacer le message après quelques secondes
      const timer = setTimeout(() => {
        setOauthMessage(null);
        setOauthMessageType(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [location.search, fetchConnections]);

  // Gérer les query params OAuth WhatsApp au retour
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const waConnected = urlParams.get('wa_connected');
    const waError = urlParams.get('wa_error');
    
    if (waConnected === '1') {
      // Succès - comportement existant + message optionnel
      setOauthMessage("Compte WhatsApp connecté avec succès !");
      setOauthMessageType('success');
      
      // Rafraîchir les données des connexions
      fetchConnections();
    } else if (waError === 'already_connected') {
      // Erreur - afficher le message d'erreur
      setOauthMessage("Ce numéro WhatsApp est déjà connecté à un autre agent");
      setOauthMessageType('error');
    }
    
    // Nettoyer les query params de l'URL
    if (waConnected || waError) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('wa_connected');
      newUrl.searchParams.delete('wa_error');
      
      // Remplacer l'URL sans recharger la page
      window.history.replaceState({}, '', newUrl.toString());
      
      // Auto-effacer le message après quelques secondes
      const timer = setTimeout(() => {
        setOauthMessage(null);
        setOauthMessageType(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [location.search, fetchConnections]);

  useEffect(() => {
    const channel = supabase
      .channel("connectors_config_agent_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connectors_config_agent" },
        () => {
          if (activePopup) activePopup.close();
          fetchConnections();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConnections, activePopup]);

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
    setConnectorUserId(connection.connector_user_id);
  };

  const handleDisconnectClick = useCallback((connectorUserId: string) => {
    console.log("Déconnexion", connectorUserId);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchConnections();
  }, [fetchConnections]);

const connectorActions = useMemo(() => {
  const connectorConnected = connections.map((connection) => ({
    connectors_name: (connection.provider ?? "").toLowerCase(),
    id: connection.connector_user_id,
  }));
  const selectedConnection = connectorUserId
    ? connections.find((connection) => connection.connector_user_id === connectorUserId)
    : undefined;
  const configsId =
    selectedConnection?.configurations.find((config) => config.configId)?.configId ?? null;
  return buildConnectorActions({
    connectorConnected,
    configsId,
    setActivePopup,
  });
}, [connections, connectorUserId, setActivePopup]);
const [confirmationOpen, setConfirmationOpen] = useState(false);
const [pendingDisconnect, setPendingDisconnect] = useState<{
  action: () => Promise<void> | void;
  label: string;
  providerKey: string;
} | null>(null);
const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(
  null
);

const requestDisconnect = (
  action: () => Promise<void> | void,
  label: string,
  providerKey: string
) => {
  setPendingDisconnect({ action, label, providerKey });
  setConfirmationOpen(true);
};

const handleConfirmDisconnect = async () => {
  if (!pendingDisconnect) {
    return;
  }
  setDisconnectingProvider(pendingDisconnect.providerKey);
  setConfirmationOpen(false);
  try {
    await Promise.resolve(pendingDisconnect.action());
  } finally {
    setDisconnectingProvider(null);
    setPendingDisconnect(null);
  }
};

const handleCancelDisconnect = () => {
  setPendingDisconnect(null);
  setConfirmationOpen(false);
};

  const closeConfigurationOverlay = useCallback(() => {
    setActiveConfigs(null);
    setSelectedAccount(null);
  }, []);
  const handleConfigurationBackdropPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    configurationBackdropPointerDownRef.current =
      event.target === event.currentTarget;
  };
  const handleConfigurationBackdropPointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const shouldClose =
      configurationBackdropPointerDownRef.current &&
      event.target === event.currentTarget;
    configurationBackdropPointerDownRef.current = false;
    if (shouldClose) {
      closeConfigurationOverlay();
    }
  };
  const resetConfigurationBackdropPointer = () => {
    configurationBackdropPointerDownRef.current = false;
  };

  useEffect(() => {
    if (!activeConfigs) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeConfigurationOverlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeConfigs, closeConfigurationOverlay]);

  useEffect(() => {
    if (connections.length === 0) {
      if (connectorUserId !== null) {
        setConnectorUserId(null);
      }
      return;
    }

    const hasCurrentId = connections.some(
      (connection) => connection.connector_user_id === connectorUserId
    );
    if (!hasCurrentId) {
      setConnectorUserId(connections[0].connector_user_id);
    }
  }, [connections, connectorUserId]);

  return (
    <AppLayout>
      <div className={styles.rightcomponent}>
        <Header minimal showLogo={false} />
        
        {/* Message OAuth Instagram */}
        {oauthMessage && (
          <div className={`${styles.oauthNotification} ${
            oauthMessageType === 'error' ? styles.error : styles.success
          }`}>
            {oauthMessage}
            <button 
              onClick={() => {
                setOauthMessage(null);
                setOauthMessageType(null);
              }}
              className={styles.closeButton}
            >
              ×
            </button>
          </div>
        )}
        
        <div className={styles.optionSearchWrapper}>
          <OptionSearch
            wrap={true}
            centeredLayout={true}
            enlargedSearch={true}
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
        <section className={styles.tableWrapper}>
          <table className={styles.connectionTable}>
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
                  <td className={styles.iconCell}>
                    <span className={styles.providerLogoShell}>
                      <img
                        src={
                          ["appel", "instagram", "calendly"].includes(connection.provider.toLowerCase())
                            ? `/logoConnectors/${connection.provider.toLowerCase()}.svg`
                            : `/logoConnectors/${connection.provider.toLowerCase()}.webp`
                        }
                        alt={`${connection.provider} logo`}
                        className={styles.tableIcon}
                      />
                    </span>
                  </td>
                  <td>
                    <span className={styles.connectionTitle}>
                      {connection.connectors_label}
                    </span>
                  </td>
                  <td>
                    <span className={styles.providerBadge}>{connection.provider}</span>
                  </td>
                  <td className={styles.dateCell}>
                    {formatDate(connection.updated_at)}
                    {connection.refresh_status === "failed" && (
                      <span title="Votre agent ne peut plus envoyer ni recevoir de messages. Cliquez sur Reconnecter." className={styles.expiredBadge}>Connexion expirée</span>
                    )}
                  </td>
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
                    const actions = connectorActions[providerKey];
                    const disconnectAction =
                      actions?.onDisconnect ??
                      (() => handleDisconnectClick(connection.connector_user_id));
                    const handleConnect =
                      actions?.onConnect ?? (() => handleRefresh());
                    const providerLabel =
                      connection.connectors_label ??
                      connection.provider ??
                      "cette connexion";
                    const request = () =>
                      requestDisconnect(
                        disconnectAction,
                        providerLabel,
                        providerKey
                      );
                    return (
                      <div className={styles.actionGroup}>
                        <Button
                          type="button"
                          variant="primary"
                          align="none"
                          onClick={request}
                          disabled={disconnectingProvider === providerKey}
                        >
                          <span className={styles.actionButtonInner}>
                            {disconnectingProvider === providerKey && (
                              <span
                                className={styles.loadingSpinner}
                                aria-hidden="true"
                              />
                            )}
                            Déconnexion
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          align="none"
                          onClick={handleConnect}
                          className={connection.refresh_status === "failed" ? styles.reconnectButton : undefined}
                        >
                          {connection.refresh_status === "failed" ? "Reconnecter" : "Rafraîchir"}
                        </Button>
                      </div>
                    );
                  })()}
                </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <ConfirmationDialog
          open={confirmationOpen}
          title="Confirmer la déconnexion"
          message={`Voulez-vous vraiment déconnecter ${pendingDisconnect?.label ?? "cette connexion"} ?`}
          onClose={handleCancelDisconnect}
          onConfirm={handleConfirmDisconnect}
        />
        {activeConfigs && (
          <div
            className={styles.configurationOverlay}
            onPointerDown={handleConfigurationBackdropPointerDown}
            onPointerUp={handleConfigurationBackdropPointerUp}
            onPointerCancel={resetConfigurationBackdropPointer}
            onPointerLeave={resetConfigurationBackdropPointer}
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
      </div>
    </AppLayout>
  );
};

export default Connexion;
