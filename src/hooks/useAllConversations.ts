import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import supabase from "../lib/supabase";

const fetchAllConversations = async (configIds: string[]) => {
  if (configIds.length === 0) return [];
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .in("agent_config_id", configIds)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
};

const useAllConversations = (configIds: string[]) => {
  const queryClient = useQueryClient();
  const configKey = useMemo(() => [...configIds].sort().join(","), [configIds]);
  const queryKey = useMemo(() => ["all-conversations", configKey], [configKey]);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchAllConversations(configIds),
    enabled: configIds.length > 0,
    staleTime: 5000,
  });

  useEffect(() => {
    if (configIds.length === 0) return;

    const channels = configIds.map((configId) =>
      supabase
        .channel(`realtime:all-conversations:${configId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `agent_config_id=eq.${configId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey });
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [configKey]);

  return query;
};

export default useAllConversations;
