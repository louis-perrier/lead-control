import useAgents from "./useAgents";

const useScrapingAccess = () => {
  const { displayedAgents, isDisplayedAgentsLoading } = useAgents();

  const hasAccess = displayedAgents.some(
    (agent) => agent.id.toLowerCase() === "rick" && agent.is_active,
  );

  return {
    hasAccess,
    isLoading: isDisplayedAgentsLoading,
  };
};

export default useScrapingAccess;
