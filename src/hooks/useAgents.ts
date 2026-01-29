import { useCallback, useEffect, useState } from "react";
import supabase from "../lib/supabase";
import { AgentInfo, fetchDefaultAgentsSupa } from "../data/agents";

type AgentConfigRow = {
  agent_id: string;
  name_modif: string;
  configs: Record<string, string>;
  configs_id: string;
};

type AgentDisplayed = AgentInfo & {
  name: string;
  configs: Record<string, string>;
  display_id: string;
};

type UserAgentRow = {
  agent_id: string;
  user_id?: string;
};

const mapDisplayedAgents = (
  data: AgentConfigRow[] | undefined,
  defaults: AgentInfo[]
) =>
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
      };
    })
    .filter((agent): agent is AgentDisplayed => Boolean(agent));

const mapAvailableAgents = (data: UserAgentRow[], defaults: AgentInfo[]) =>
  data
    .map((agent) =>
      defaults.find((availableAgent) => availableAgent.agent_id === agent.agent_id)
    )
    .filter((agent): agent is AgentInfo => Boolean(agent));

const useAgents = () => {
  const [agentDefaultSupa, setAgentDefaultSupa] = useState<AgentInfo[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const [displayedAgents, setDisplayedAgents] = useState<AgentInfo[]>([]);

  const loadDefaultAgents = useCallback(async () => {
    const agents = await fetchDefaultAgentsSupa();
    if (agents) {
      setAgentDefaultSupa(agents as AgentInfo[]);
    }
  }, []);

  const refreshDisplayedAgents = useCallback(async () => {
    if (agentDefaultSupa.length === 0) {
      return;
    }
    const { data, error } = await supabase.from("agent_configs").select("*");
    if (error) {
      console.error(error);
      return;
    }
    setDisplayedAgents(mapDisplayedAgents(data, agentDefaultSupa));
  }, [agentDefaultSupa]);

  const refreshAvailableAgents = useCallback(async () => {
    if (agentDefaultSupa.length === 0) {
      return;
    }
    const { data, error } = await supabase
      .from("user_agent")
      .select("agent_id,user_id");
    if (error) {
      console.error(error);
      return;
    }
    setAvailableAgents(mapAvailableAgents(data ?? [], agentDefaultSupa));
  }, [agentDefaultSupa]);

  useEffect(() => {
    if (agentDefaultSupa.length === 0) {
      loadDefaultAgents();
    }
  }, [agentDefaultSupa, loadDefaultAgents]);

  useEffect(() => {
    if (agentDefaultSupa.length > 0) {
      refreshDisplayedAgents();
      refreshAvailableAgents();
    }
  }, [agentDefaultSupa, refreshDisplayedAgents, refreshAvailableAgents]);

  return {
    agentDefaultSupa,
    availableAgents,
    displayedAgents,
    refreshDisplayedAgents,
  };
};

export default useAgents;
