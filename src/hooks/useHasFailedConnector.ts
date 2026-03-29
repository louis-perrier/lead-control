import { useQuery } from "@tanstack/react-query";
import supabase from "../lib/supabase";

const useHasFailedConnector = () => {
  return useQuery<boolean>({
    queryKey: ["connectors", "hasFailedConnector"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("all_connectors_users")
        .select("*", { count: "exact", head: true })
        .eq("refresh_status", "failed");

      if (error) {
        console.error(error);
        return false;
      }

      return (count ?? 0) > 0;
    },
    refetchInterval: 60 * 1000,
    staleTime: 60 * 1000,
  });
};

export default useHasFailedConnector;
