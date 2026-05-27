import { useEffect, useMemo, useRef, useState } from "react";
import { syncProspectContacts } from "../lib/prospects";

type SyncCallback = (() => void) | undefined;

const useAutoSyncProspectContacts = (
  rawConversations: Record<string, unknown>[],
  onSynced?: SyncCallback,
) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const latestConversationsRef = useRef(rawConversations);
  const latestOnSyncedRef = useRef<SyncCallback>(onSynced);

  latestConversationsRef.current = rawConversations;
  latestOnSyncedRef.current = onSynced;

  const syncKey = useMemo(
    () =>
      rawConversations
        .map((record) => {
          const id = String(record.id ?? "");
          const lastMessageAt =
            typeof record.last_message_at === "string"
              ? record.last_message_at
              : typeof record.updated_at === "string"
              ? record.updated_at
              : "";
          const summary = typeof record.summary === "string" ? record.summary : "";
          const inboundCount =
            typeof record.inbound_count === "number" ? record.inbound_count : 0;
          return `${id}:${lastMessageAt}:${inboundCount}:${summary}`;
        })
        .sort()
        .join("|"),
    [rawConversations],
  );

  useEffect(() => {
    let cancelled = false;

    if (!syncKey) {
      setIsSyncing(false);
      return;
    }

    const run = async () => {
      setIsSyncing(true);
      try {
        const result = await syncProspectContacts(latestConversationsRef.current);
        if (
          !cancelled &&
          (result.inserted > 0 || result.updated > 0) &&
          latestOnSyncedRef.current
        ) {
          latestOnSyncedRef.current();
        }
      } catch (error) {
        console.error("Impossible de synchroniser les prospects CRM.", error);
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [syncKey]);

  return { isSyncing };
};

export default useAutoSyncProspectContacts;
