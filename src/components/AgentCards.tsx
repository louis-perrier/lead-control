import { FunctionComponent, useEffect, useMemo, useState } from "react";
import AgentCard from "./AgentCard";
import styles from "./AgentCards.module.css";
import Overlay from "./OverlayAddAgent";
import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";

export type AgentCardsType = {
  className?: string;
  agents: AgentInfo[];
  agentDefaultSupa: AgentInfo[];
  availableAgents: AgentInfo[];
  refreshDisplayedAgents: () => void;
  refreshAvailableAgents: () => void;
  onAgentClick?: (agent: AgentInfo) => void;
  onToggleFav?: (agent: AgentInfo) => void;
};

const AgentCards: FunctionComponent<AgentCardsType> = ({
  className = "",
  agents = [],
  agentDefaultSupa = [],
  availableAgents = [],
  refreshDisplayedAgents,
  refreshAvailableAgents,
  onAgentClick,
  onToggleFav,
}) => {
  const [isOverlayOpen, setOverlayOpen] = useState(false);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const availableAgentIds = useMemo(
    () => new Set(availableAgents.map((agent) => agent.agent_id)),
    [availableAgents]
  );

  const handleNameChange = async (targetAgent: AgentInfo, nextName: string) => {
    const normalized = nextName.trim();
    if (!targetAgent.display_id) {
      return;
    }
    const isDuplicate = agents.some(
      (agent) =>
        agent.display_id !== targetAgent.display_id &&
        agent.name.replace(/\s+/g, "").toUpperCase() ===
          normalized.replace(/\s+/g, "").toUpperCase()
    );
    if (isDuplicate) {
      return;
    }

    const { error } = await supabase
      .from("agent_configs")
      .update({ name_modif: normalized })
      .eq("configs_id", targetAgent.display_id);
    if (error) {
      console.error(error);
    } else {
      refreshDisplayedAgents();
      refreshAvailableAgents();
    }
  };

  useEffect(() => {
    const handleOpenAddAgent = () => setOverlayOpen(true);
    window.addEventListener("openAddAgentOverlay", handleOpenAddAgent);
    return () => {
      window.removeEventListener("openAddAgentOverlay", handleOpenAddAgent);
    };
  }, []);

  const handleSelectAgent = async (agent: AgentInfo) => {
    const { error } = await supabase.from("agent_configs").insert({
      agent_id: agent.agent_id,
      name_modif: agent.name,
    });
    if (error) {
      console.error(error);
    } else {
      refreshDisplayedAgents();
      refreshAvailableAgents();
    }
    setOverlayOpen(false);
  };

  return (
    <section className={[styles.agentcards, className].join(" ")}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.display_id ?? agent.id}
          imageSrc={agent.imageSrc}
          name={agent.name.toUpperCase()}
          description={agent.description}
          isFav={Boolean(agent.is_fav)}
          isActive={Boolean(agent.is_active)}
          onClick={() => onAgentClick?.(agent)}
          onFavClick={() => onToggleFav?.(agent)}
          onNameChange={(nextName) => handleNameChange(agent, nextName)}
        />
      ))}
      <img
        className={styles.addagentIcon}
        alt="Ajouter un agent"
        src="/addAgent.svg"
        onClick={() => setOverlayOpen(true)}
      />
      {agentDefaultSupa.length > 0 && (
        <Overlay
          isOpen={isOverlayOpen}
          onClose={() => setOverlayOpen(false)}
          agent={agentDefaultSupa[selectedAgentIndex]}
          availableAgentIds={availableAgentIds}
          onPrevious={() =>
            setSelectedAgentIndex((prev) =>
              (prev - 1 + agentDefaultSupa.length) % agentDefaultSupa.length
            )
          }
          onNext={() =>
            setSelectedAgentIndex((prev) => (prev + 1) % agentDefaultSupa.length)
          }
          onSelect={handleSelectAgent}
        />
      )}
    </section>
  );
};

export default AgentCards;
