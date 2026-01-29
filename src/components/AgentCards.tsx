import { FunctionComponent, useEffect, useMemo, useState } from "react";
import AgentCard from "./AgentCard";
import styles from "./AgentCards.module.css";
import Overlay from "./OverlayAddAgent";
import { AgentInfo } from "../data/agents";
import supabase from "../lib/supabase";
import useAgents from "../hooks/useAgents";

export type AgentCardsType = {
  className?: string;
  onDisplayedAgentsChange?: (agents: AgentInfo[]) => void;
};

// Optimiser les fetch --> useState et les UseEffect Condition / MEMOIRE pour opti
// Optimiser dans l'HTML + Code dans saous-fichier

const AgentCards: FunctionComponent<AgentCardsType> = ({
  className = "",
  onDisplayedAgentsChange,
}) => {
  const [isOverlayOpen, setOverlayOpen] = useState(false);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const {
    agentDefaultSupa,
    availableAgents,
    displayedAgents,
    refreshDisplayedAgents,
  } = useAgents();


 
  const availableAgentIds = useMemo( // Objet d'agent_id pour l'overlay grisé
    () => new Set(availableAgents.map((agent) => agent?.agent_id).filter(Boolean)),
    [availableAgents]
  );
  useEffect(() => {
    onDisplayedAgentsChange?.(displayedAgents);
  }, [displayedAgents, onDisplayedAgentsChange]);

  // --------------Update Name---------------------------------
  const handleNameChange = async (index: number, nextName: string) => {
    const normalized = nextName.trim();
    if (
      displayedAgents.some(
        (agent, idx) =>
          idx !== index && agent.name.replace(/\s+/g,"").toUpperCase() === normalized.replace(/\s+/g,"").toUpperCase()
      )
    ) {
      return;
    }
    const { data, error } = await supabase.from("agent_configs").update({ name_modif: normalized }).eq("configs_id", displayedAgents[index].display_id);
    if (error) {
      console.error(error);
    } else {
      refreshDisplayedAgents();
    }
  };

  // --------------Add Agent---------------------------------
  useEffect(() => {
    const handleOpenAddAgent = () => setOverlayOpen(true);
    window.addEventListener("openAddAgentOverlay", handleOpenAddAgent);
    return () => {
      window.removeEventListener("openAddAgentOverlay", handleOpenAddAgent);
    };
  }, []);

  const handleSelectAgent = async (agent: AgentInfo) => {
    const { data, error } = await supabase.from("agent_configs").insert({ agent_id: agent.agent_id, name_modif: agent.name });
    if (error) {
      console.error(error);
    } else {
      refreshDisplayedAgents();
    }
    setOverlayOpen(false);
  };

  return (
    <section className={[styles.agentcards, className].join(" ")}>
      {displayedAgents.map((agent, index) => (
        <AgentCard
          key={`${agent.id}-${index}`}
          imageSrc={agent.imageSrc}
          name={agent.name.toUpperCase()}
          description={agent.description}
          onNameChange={(nextName) => handleNameChange(index, nextName)}
        />
      ))}
      <img
        className={styles.addagentIcon}
        alt=""
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
