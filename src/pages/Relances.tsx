import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts";
import supabase from "../lib/supabase";
import styles from "./Relances.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type FollowupStatus = "pending" | "sent" | "skipped";
type FilterOption = "Toutes" | "Aujourd'hui" | "En retard" | "Envoyées";

type Followup = {
  id: string;
  conversationId: number;
  platform: string;
  scheduledAt: string;
  sentAt: string | null;
  status: FollowupStatus;
  messageBody: string | null;
  templateId: string | null;
  templateName: string | null;
  contactName: string | null;
  contactHandle: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTERS: FilterOption[] = ["Toutes", "Aujourd'hui", "En retard", "Envoyées"];

const platformIcon: Record<string, string> = {
  instagram: "/logoConnectors/instagram.svg",
  whatsapp: "/logoConnectors/whatsapp.webp",
};

const platformLabel: Record<string, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

const statusLabel: Record<FollowupStatus, string> = {
  pending: "En attente",
  sent: "Envoyée",
  skipped: "Ignorée",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatScheduledAt = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const hhmm = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (msgDate.getTime() === today.getTime()) return `Aujourd'hui à ${hhmm}`;
  if (msgDate.getTime() === tomorrow.getTime()) return `Demain à ${hhmm}`;
  return (
    date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + ` à ${hhmm}`
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const Relances: FunctionComponent = () => {
  const navigate = useNavigate();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("Toutes");

  const fetchFollowups = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("human_followups")
      .select(
        "id, conversation_id, platform, scheduled_at, sent_at, status, message_body, template_id, created_at, whatsapp_templates(name), conversations(contact_display_name, contact_handle)"
      )
      .order("scheduled_at", { ascending: true });

    setFollowups(
      (data ?? []).map((row: any) => ({
        id: row.id,
        conversationId: row.conversation_id,
        platform: (row.platform ?? "instagram").toLowerCase(),
        scheduledAt: row.scheduled_at,
        sentAt: row.sent_at ?? null,
        status: row.status as FollowupStatus,
        messageBody: row.message_body ?? null,
        templateId: row.template_id ?? null,
        templateName: row.whatsapp_templates?.name ?? null,
        contactName:
          row.conversations?.contact_display_name ??
          row.conversations?.contact_handle ??
          null,
        contactHandle: row.conversations?.contact_handle ?? null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  const handleSkip = useCallback(async (id: string) => {
    await supabase.from("human_followups").update({ status: "skipped" }).eq("id", id);
    setFollowups((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "skipped" } : f))
    );
  }, []);

  const handleSendInstagram = useCallback(
    (followup: Followup) => {
      const params = new URLSearchParams();
      params.set("conversation_id", String(followup.conversationId));
      if (followup.messageBody) params.set("prefill", followup.messageBody);
      navigate(`/app/conversations?${params.toString()}`);
    },
    [navigate]
  );

  const now = useMemo(() => new Date(), []);

  const todayStart = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now]
  );
  const tomorrowStart = useMemo(
    () => new Date(todayStart.getTime() + 86400000),
    [todayStart]
  );

  const filteredFollowups = useMemo(() => {
    switch (activeFilter) {
      case "Aujourd'hui":
        return followups.filter((f) => {
          const d = new Date(f.scheduledAt);
          const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          return day.getTime() === todayStart.getTime();
        });
      case "En retard":
        return followups.filter(
          (f) => f.status === "pending" && new Date(f.scheduledAt) < now
        );
      case "Envoyées":
        return followups.filter((f) => f.status === "sent");
      default:
        return followups;
    }
  }, [followups, activeFilter, now, todayStart]);

  const pendingOverdueCount = useMemo(
    () =>
      followups.filter((f) => f.status === "pending" && new Date(f.scheduledAt) <= now)
        .length,
    [followups, now]
  );

  return (
    <AppLayout>
      <div className={styles.relancesRoot}>
        <div className={styles.relancesContainer}>
          <div className={styles.relancesHeader}>
            <div className={styles.relancesTitle}>
              <h1 className={styles.relancesTitleText}>Relances</h1>
              {pendingOverdueCount > 0 && (
                <span className={styles.relancesOverdueBadge}>
                  {pendingOverdueCount} en retard
                </span>
              )}
            </div>
          </div>

          <div className={styles.relancesFilters}>
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`${styles.relancesFilterBtn} ${
                  activeFilter === filter ? styles.relancesFilterBtnActive : ""
                }`}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.relancesLoading}>Chargement…</div>
          ) : filteredFollowups.length === 0 ? (
            <div className={styles.relancesEmpty}>
              Aucune relance{activeFilter !== "Toutes" ? " pour ce filtre" : ""}
            </div>
          ) : (
            <div className={styles.relancesList}>
              {filteredFollowups.map((followup) => {
                const isOverdue =
                  followup.status === "pending" &&
                  new Date(followup.scheduledAt) < now;
                const messagePreview = followup.messageBody
                  ? followup.messageBody.length > 60
                    ? followup.messageBody.slice(0, 60) + "…"
                    : followup.messageBody
                  : followup.templateName
                  ? `Template : ${followup.templateName}`
                  : "—";
                const canAct = followup.status === "pending";
                const isInstagram = followup.platform === "instagram";
                const isWhatsApp = followup.platform === "whatsapp";
                const scheduledDate = new Date(followup.scheduledAt);
                const isUpcoming =
                  scheduledDate >= todayStart && scheduledDate < tomorrowStart;

                return (
                  <div
                    key={followup.id}
                    className={`${styles.relanceRow} ${
                      isOverdue ? styles.relanceRowOverdue : ""
                    } ${isUpcoming && !isOverdue ? styles.relanceRowToday : ""}`}
                  >
                    <div className={styles.relanceRowLeft}>
                      <div className={styles.relancePlatformIcon}>
                        {platformIcon[followup.platform] ? (
                          <img
                            src={platformIcon[followup.platform]}
                            alt={platformLabel[followup.platform] ?? followup.platform}
                            width={22}
                            height={22}
                          />
                        ) : (
                          <span className={styles.relancePlatformFallback}>
                            {followup.platform.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className={styles.relanceRowBody}>
                        <span className={styles.relanceContact}>
                          {followup.contactName ?? `Conv. #${followup.conversationId}`}
                          {followup.contactHandle && (
                            <span className={styles.relanceHandle}>
                              {" "}
                              @{followup.contactHandle}
                            </span>
                          )}
                        </span>
                        <span className={styles.relancePreview}>{messagePreview}</span>
                        <span
                          className={`${styles.relanceDate} ${
                            isOverdue ? styles.relanceDateOverdue : ""
                          }`}
                        >
                          {isOverdue && "⚠ En retard · "}
                          {formatScheduledAt(followup.scheduledAt)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.relanceRowRight}>
                      <span
                        className={`${styles.relanceStatusBadge} ${
                          styles[`relanceStatus_${followup.status}`]
                        }`}
                      >
                        {statusLabel[followup.status]}
                      </span>
                      {canAct && isInstagram && (
                        <button
                          type="button"
                          className={styles.relanceSendBtn}
                          onClick={() => handleSendInstagram(followup)}
                        >
                          Envoyer
                        </button>
                      )}
                      {canAct && isWhatsApp && (
                        <button
                          type="button"
                          className={styles.relanceSendBtnDisabled}
                          title="L'envoi WhatsApp est automatique"
                          disabled
                        >
                          Envoi auto
                        </button>
                      )}
                      {canAct && (
                        <button
                          type="button"
                          className={styles.relanceSkipBtn}
                          onClick={() => handleSkip(followup.id)}
                        >
                          Ignorer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Relances;
