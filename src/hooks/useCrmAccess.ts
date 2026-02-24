import useAgents from "./useAgents";

const useCrmAccess = () => {
  const { displayedAgents, isDisplayedAgentsLoading } = useAgents();

  const hasAccess = displayedAgents.some(
    (agent) => agent.id.toLowerCase() === "greg" && agent.is_active,
  );

  return {
    hasAccess,
    isLoading: isDisplayedAgentsLoading,
  };
};

export default useCrmAccess;
