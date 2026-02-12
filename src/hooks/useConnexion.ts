import { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../lib/supabase";

type AgentConfigRow = {
  agent_id: string;
  name_modif: string;
  config: Record<string, any>;
  configs_id: string;
};

type AvailableConnector = {
  connectors_id: string;
  limit_agent_connector?: number;
  connectors_name: string;
  connectors_available: boolean;
  connectors_special: boolean;
  config_agent_connector?: any[];
  current_connector_config?: any[];
};

type ConnectedConnector = {
  id?: string;
  connectors_id: string;
  connectors_name: string;
  expires_in?: string;
  connector_label?: string;
};

export type UseConnectorsOptions = {
  agentId?: string;
  configsId?: string;
};

export const useConnectors = ({
  agentId,
  configsId,
}: UseConnectorsOptions) => {
  const [connectorAvailable, setConnectorAvailable] = useState<AvailableConnector[]>([]);
  const [connectorConnected, setConnectorConnected] = useState<ConnectedConnector[]>([]);
  const [countAvailableConnector, setCountAvailableConnector] = useState(0);
  const [countConnectedConnector, setCountConnectedConnector] = useState(0);

  const refreshAvailable = useCallback(async () => {
    if (!agentId) {
      setConnectorAvailable([]);
      setCountAvailableConnector(0);
      return;
    }
    const { data, error } = await supabase
      .from("connectors_agent")
      .select("*, connectors(*)", { count: "exact" })
      .eq("agent_id", agentId);
    if (error) {
      console.error(error);
      return;
    }
    const mapped = (data ?? []).map((item: any) => ({
      connectors_id: item.connectors_id,
      limit_agent_connector: item.limit,
      connectors_name: item.connectors.connectors_name,
      connectors_available: item.connectors.available,
      connectors_special: item.connectors.special,
      config_agent_connector: item.config
    }));
    setCountAvailableConnector(mapped.length);
    setConnectorAvailable(mapped);
  }, [agentId]);

  const refreshConnected = useCallback(async () => {
    if (!configsId) {
      setConnectorConnected([]);
      setCountConnectedConnector(0);
      return;
    }
    const { data, error } = await supabase
      .from("connectors_config_agent")
      .select("*, all_connectors_users(*)", { count: "exact" })
      .eq("configs_id", configsId);
    if (error) {
      console.error(error);
      return;
    }
    const mapped = (data ?? []).map((item: any) => ({
      id: item.user_connexion_id,
      connectors_id: item.all_connectors_users.connector_id,
      connectors_name: item.all_connectors_users.provider,
      expires_in: item.all_connectors_users.expires_in,
      connector_label: item.all_connectors_users.connectors_label,
      current_connector_config: item.current_config_connexion,
    }));
    setCountConnectedConnector(mapped.length);
    setConnectorConnected(mapped);
  }, [configsId]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshAvailable(), refreshConnected()]);
  }, [refreshAvailable, refreshConnected]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const availableShow = useMemo(() => {
    const connectedIds = new Set(connectorConnected.map((item) => item.connectors_id));
    return connectorAvailable.filter((item) => !connectedIds.has(item.connectors_id));
  }, [connectorAvailable, connectorConnected]);

  return {
    connectorAvailable,
    connectorConnected,
    availableShow,
    countAvailableConnector,
    countConnectedConnector,
    refresh,
  };
};
 // référencer image, fonction de connexion et de déconnexion, par le nom de connectors_name
