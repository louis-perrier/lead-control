import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import supabase from "../lib/supabase";

const fetchConversationMessages = async (conversationId: string) => {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", Number(conversationId))
    .order("sent_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const conversationMessagesQueryKey = (conversationId: string) => [
  "conversation-messages",
  conversationId,
];

const useConversationMessages = (conversationId?: string) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => conversationMessagesQueryKey(conversationId ?? ""),
    [conversationId]
  );

  const query = useQuery({
    queryKey,
    queryFn: () => fetchConversationMessages(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 5000,
  });

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`realtime:conv-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
        },
        (payload: any) => {
          const record = payload.new ?? payload.record ?? null;
          if (String(record?.conversation_id) === conversationId) {
            queryClient.invalidateQueries({ queryKey });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return query;
};

export default useConversationMessages;
