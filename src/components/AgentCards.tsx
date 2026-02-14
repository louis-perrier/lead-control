import { FunctionComponent, useEffect, useMemo, useState } from "react";
import AgentCard from "./AgentCard";
import styles from "./AgentCards.module.css";
import OverlayAddAgent from "./OverlayAddAgent";
import OverlayRenameAgent from "./OverlayRenameAgent";
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
  const [isRenameOverlayOpen, setRenameOverlayOpen] = useState(false);
  const [pendingAgentForRename, setPendingAgentForRename] =
    useState<AgentInfo | null>(null);
  const [pendingAgentName, setPendingAgentName] = useState("");
  const [renameApiError, setRenameApiError] = useState("");
  const [isRenameSubmitting, setRenameSubmitting] = useState(false);
  const availableAgentIds = useMemo(
    () => new Set(availableAgents.map((agent) => agent.agent_id)),
    [availableAgents]
  );

  const agentLimitMap = useMemo(() => {
    const map = new Map<string, number>();
    availableAgents.forEach((agent) => {
      const limitValue = agent.limit_agent_user;
      const parsedLimit =
        typeof limitValue === "number"
          ? limitValue
          : limitValue
          ? Number(limitValue)
          : undefined;
      if (parsedLimit != null && !Number.isNaN(parsedLimit) && parsedLimit > 0) {
        map.set(agent.agent_id, parsedLimit);
      }
    });
    return map;
  }, [availableAgents]);

  const agentCountMap = useMemo(() => {
    const map = new Map<string, number>();
    agents.forEach((agent) => {
      const current = map.get(agent.agent_id) ?? 0;
      map.set(agent.agent_id, current + 1);
    });
    return map;
  }, [agents]);

  const hasReachedLimitForAgent = (agentId: string) => {
    const limit = agentLimitMap.get(agentId);
    if (limit == null) {
      return false;
    }
    const currentCount = agentCountMap.get(agentId) ?? 0;
    return currentCount >= limit;
  };

  const limitReachedMessage =
    "Vous avez ajouté le nombre maximum d'agent autorisé.";

  const trimmedPendingName = pendingAgentName.trim();
  const normalizedPendingName = trimmedPendingName.toLowerCase();
  const hasDuplicatePendingName =
    Boolean(trimmedPendingName) &&
    agents.some(
      (existingAgent) =>
        (existingAgent.name ?? "").trim().toLowerCase() ===
        normalizedPendingName
    );
  const validationError =
    isRenameOverlayOpen && !trimmedPendingName
      ? "Le nom ne peut pas être vide."
      : isRenameOverlayOpen && hasDuplicatePendingName
      ? "Un agent porte déjà ce nom."
      : "";
  const canContinueRename =
    Boolean(trimmedPendingName) && !hasDuplicatePendingName;
  const displayedRenameError = renameApiError || validationError;

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

  const handleSelectAgent = (agent: AgentInfo) => {
    if (hasReachedLimitForAgent(agent.agent_id)) {
      return;
    }
    setPendingAgentForRename(agent);
    setPendingAgentName(agent.name);
    setRenameApiError("");
    setRenameOverlayOpen(true);
  };

  const handleCancelRename = () => {
    setRenameOverlayOpen(false);
    setPendingAgentForRename(null);
    setRenameApiError("");
  };

  const handlePendingNameChange = (nextName: string) => {
    setPendingAgentName(nextName);
    if (renameApiError) {
      setRenameApiError("");
    }
  };

  const handleRenameContinue = async () => {
    if (!pendingAgentForRename) {
      return;
    }
    if (!trimmedPendingName) {
      setRenameApiError("Le nom ne peut pas être vide.");
      return;
    }
    if (hasDuplicatePendingName) {
      setRenameApiError("Un agent porte déjà ce nom.");
      return;
    }

    setRenameSubmitting(true);
    try {
      const { error } = await supabase.from("agent_configs").insert({
        agent_id: pendingAgentForRename.agent_id,
        name_modif: trimmedPendingName,
      });
      if (error) {
        console.error(error);
        setRenameApiError("Impossible d’ajouter l’agent pour le moment.");
        return;
      }
      refreshDisplayedAgents();
      refreshAvailableAgents();
      setRenameOverlayOpen(false);
      setPendingAgentForRename(null);
      setPendingAgentName("");
      setRenameApiError("");
      setOverlayOpen(false);
    } finally {
      setRenameSubmitting(false);
    }
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
        <OverlayAddAgent
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
          limitReached={hasReachedLimitForAgent(
            agentDefaultSupa[selectedAgentIndex].agent_id
          )}
          limitMessage={limitReachedMessage}
        />
      )}
      <OverlayRenameAgent
        isOpen={isRenameOverlayOpen}
        onClose={handleCancelRename}
        agent={pendingAgentForRename}
        value={pendingAgentName}
        onChange={handlePendingNameChange}
        onContinue={handleRenameContinue}
      canContinue={canContinueRename}
      errorMessage={displayedRenameError}
        isSubmitting={isRenameSubmitting}
      />
    </section>
  );
};

export default AgentCards;
