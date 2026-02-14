import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import supabase from "../lib/supabase";
import { AgentInfo, fetchDefaultAgentsSupa } from "../data/agents";

type AgentConfigRow = {
  agent_id: string;
  name_modif: string;
  configs: AgentInfo["configs"];
  configs_id: string;
  is_active?: boolean;
  is_fav?: boolean;
};

type AgentDisplayed = AgentInfo & {
  display_id: string;
  is_active: boolean;
  is_fav: boolean;
};

type UserAgentRow = {
  agent_id: string;
  user_id?: string;
};

const mapDisplayedAgents = (
  data: AgentConfigRow[] | undefined,
  defaults: AgentInfo[]
): AgentDisplayed[] =>
  (data ?? [])
    .map((agent) => {
      const defaultAgent = defaults.find(
        (availableAgent) => availableAgent.agent_id === agent.agent_id
      );
      if (!defaultAgent) {
        return null;
      }
      return {
        ...defaultAgent,
        name: agent.name_modif,
        configs: agent.configs,
        display_id: agent.configs_id,
        is_active: agent.is_active ?? defaultAgent.is_active ?? false,
        is_fav: agent.is_fav ?? defaultAgent.is_fav ?? false,
      };
    })
    .filter((agent): agent is AgentDisplayed => Boolean(agent));

const mapAvailableAgents = (
  data: UserAgentRow[],
  defaults: AgentInfo[]
): AgentInfo[] =>
  data
    .map((agent) =>
      defaults.find((availableAgent) => availableAgent.agent_id === agent.agent_id)
    )
    .filter((agent): agent is AgentInfo => Boolean(agent));

type UseAgentsResult = {
  agentDefaultSupa: AgentInfo[];
  availableAgents: AgentInfo[];
  displayedAgents: AgentDisplayed[];
  refreshDisplayedAgents: () => void;
  refreshAvailableAgents: () => void;
};

const useAgents = (): UseAgentsResult => {
  const queryClient = useQueryClient();

  const defaultAgentsQuery = useQuery<AgentInfo[]>({
    queryKey: ["agents", "defaults"],
    queryFn: async () => {
      const agents = await fetchDefaultAgentsSupa();
      return agents ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const displayedAgentsQuery = useQuery<AgentDisplayed[]>({
    queryKey: ["agents", "displayed"],
    queryFn: async () => {
      const defaults = defaultAgentsQuery.data ?? [];
      const { data, error } = await supabase.from("agent_configs").select("*");
      if (error) {
        throw error;
      }
      return mapDisplayedAgents(data, defaults);
    },
    enabled: (defaultAgentsQuery.data?.length ?? 0) > 0,
  });

  const availableAgentsQuery = useQuery<AgentInfo[]>({
    queryKey: ["agents", "available"],
    queryFn: async () => {
      const defaults = defaultAgentsQuery.data ?? [];
      const { data, error } = await supabase
        .from("user_agent")
        .select("agent_id,user_id");
      if (error) {
        throw error;
      }
      return mapAvailableAgents(data ?? [], defaults);
    },
    enabled: (defaultAgentsQuery.data?.length ?? 0) > 0,
  });

  const refreshDisplayedAgents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["agents", "displayed"] });
  }, [queryClient]);

  const refreshAvailableAgents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["agents", "available"] });
  }, [queryClient]);

  return {
    agentDefaultSupa: defaultAgentsQuery.data ?? [],
    availableAgents: availableAgentsQuery.data ?? [],
    displayedAgents: displayedAgentsQuery.data ?? [],
    refreshDisplayedAgents,
    refreshAvailableAgents,
  };
};

export default useAgents;
