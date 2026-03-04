import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import supabase from "../lib/supabase";

const fetchConversations = async (agentConfigId: string) => {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `
      *,
      conversation_messages (
        id,
        conversation_id,
        platform,
        external_message_id,
        direction,
        author_type,
        author_ref,
        body_text,
        attachments,
        send_state,
        error_code,
        error_message,
        sent_at,
        created_at,
        message_type,
        media_path,
        media_mime,
        media_duration_ms,
        transcript,
        transcript_status,
        transcript_error
      )
    `,
    )
    .eq("agent_config_id", agentConfigId)
    .order("last_message_at", { ascending: false })
    .order("sent_at", {
      foreignTable: "conversation_messages",
      ascending: true,
    });
  if (error) {
    throw error;
  }
  return data ?? [];
};

const useClaraConversations = (agentConfigId?: string) => {
  const queryClient = useQueryClient();
  const queryKey = ["clara-conversations", agentConfigId];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchConversations(agentConfigId!),
    enabled: Boolean(agentConfigId),
    staleTime: 5000,
  });

  useEffect(() => {
    if (!agentConfigId) {
      return;
    }

    const handleConversationChange = () => {
      queryClient.invalidateQueries({ queryKey });
    };

    const handleMessageChange = (payload: any) => {
      const record =
        payload.record ?? payload.new ?? payload.next ?? payload.data ?? null;
      const conversationId = record?.conversation_id ?? record?.conversationId;
      const data: any[] | undefined = queryClient.getQueryData(queryKey);
      if (!conversationId || !data) {
        return;
      }
      if (data.some((conversation) => conversation.id === conversationId)) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    const conversationsChannel = supabase
      .channel(`realtime:conversations:${agentConfigId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `agent_config_id=eq.${agentConfigId}`,
        },
        handleConversationChange,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `agent_config_id=eq.${agentConfigId}`,
        },
        handleConversationChange,
      )
      .subscribe();

    const messagesChannel = supabase
      .channel(`realtime:conversation_messages:${agentConfigId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
        },
        handleMessageChange,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [agentConfigId, queryClient, queryKey]);

  return query;
};

export default useClaraConversations;
