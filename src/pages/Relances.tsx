import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts";
import supabase from "../lib/supabase";
import styles from "./Relances.module.css";

type FollowupStatus = "pending" | "sent" | "skipped";
type PeriodFilter = "all" | "today" | "overdue";
type PlatformFilter = "all" | "instagram" | "whatsapp" | "telegram";

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

const formatScheduledAt = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const hhmm = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (msgDate.getTime() === today.getTime()) return `Aujourd'hui à ${hhmm}`;
  if (msgDate.getTime() === tomorrow.getTime()) return `Demain à ${hhmm}`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + ` à ${hhmm}`;
};

const Relances: FunctionComponent = () => {
  const navigate = useNavigate();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FollowupStatus>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

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

  const handleOpenConversation = useCallback(
    (followup: Followup) => {
      const params = new URLSearchParams();
      params.set("conversation_id", String(followup.conversationId));
      navigate(`/app/conversations?${params.toString()}`);
    },
    [navigate]
  );

  const pendingOverdueCount = useMemo(() => {
    const now = new Date();
    return followups.filter((f) => f.status === "pending" && new Date(f.scheduledAt) <= now)
      .length;
  }, [followups]);

  const filteredFollowups = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const query = searchQuery.trim().toLowerCase();

    return followups.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) {
        return false;
      }

      if (platformFilter !== "all" && f.platform !== platformFilter) {
        return false;
      }

      if (periodFilter === "today") {
        const d = new Date(f.scheduledAt);
        if (d < todayStart || d >= tomorrowStart) return false;
      } else if (periodFilter === "overdue") {
        if (!(f.status === "pending" && new Date(f.scheduledAt) < now)) return false;
      }

      if (query) {
        const match =
          (f.contactName ?? "").toLowerCase().includes(query) ||
          (f.contactHandle ?? "").toLowerCase().includes(query) ||
          (f.messageBody ?? "").toLowerCase().includes(query) ||
          (f.templateName ?? "").toLowerCase().includes(query) ||
          String(f.conversationId).includes(query);
        if (!match) return false;
      }

      return true;
    });
  }, [followups, periodFilter, platformFilter, searchQuery, statusFilter]);

  return (
    <AppLayout>
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Relances</h1>
            <p className={styles.subtitle}>Gérez vos relances Instagram et WhatsApp</p>
          </div>
          {pendingOverdueCount > 0 && (
            <span className={styles.overdueBadge}>{pendingOverdueCount} en retard</span>
          )}
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarSearchBlock}>
            <span className={styles.toolbarLabel}>Recherche</span>
            <div className={styles.searchWrapper}>
              <svg
                className={styles.searchIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className={styles.searchInput}
                placeholder="Rechercher une relance..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.toolbarFilterGrid}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Statut</span>
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | FollowupStatus)}
              >
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="sent">Envoyée</option>
                <option value="skipped">Ignorée</option>
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Période</span>
              <select
                className={styles.filterSelect}
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
              >
                <option value="all">Toutes les périodes</option>
                <option value="today">Aujourd'hui</option>
                <option value="overdue">En retard</option>
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Plateforme</span>
              <select
                className={styles.filterSelect}
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
              >
                <option value="all">Toutes les plateformes</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
              </select>
            </label>
          </div>

          <div className={styles.resultCount}>
            <span className={styles.resultCountLabel}>Résultats</span>
            <span className={styles.resultCountValue}>
              {filteredFollowups.length} relance{filteredFollowups.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.emptyState}>Chargement…</div>
          ) : filteredFollowups.length === 0 ? (
            <div className={styles.emptyState}>Aucune relance pour ces filtres.</div>
          ) : (
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Contact</th>
                  <th className={styles.th}>Plateforme</th>
                  <th className={styles.th}>Statut</th>
                  <th className={styles.th}>Planifiée</th>
                  <th className={styles.th}>Message</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFollowups.map((followup) => {
                  const now = new Date();
                  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const tomorrow = new Date(today.getTime() + 86400000);
                  const scheduledDate = new Date(followup.scheduledAt);
                  const isOverdue =
                    followup.status === "pending" && scheduledDate < now;
                  const isToday = scheduledDate >= today && scheduledDate < tomorrow;
                  const canAct = followup.status === "pending";
                  const isInstagram = followup.platform === "instagram";
                  const isWhatsApp = followup.platform === "whatsapp";
                  const preview = followup.messageBody
                    ? followup.messageBody.length > 72
                      ? `${followup.messageBody.slice(0, 72)}…`
                      : followup.messageBody
                    : followup.templateName
                    ? `Template: ${followup.templateName}`
                    : "—";

                  return (
                    <tr
                      key={followup.id}
                      className={`${styles.tr} ${isOverdue ? styles.trOverdue : ""} ${
                        isToday && !isOverdue ? styles.trToday : ""
                      }`}
                    >
                      <td className={styles.td}>
                        <div className={styles.contactName}>
                          {followup.contactName ?? `Conv. #${followup.conversationId}`}
                        </div>
                        {followup.contactHandle && (
                          <div className={styles.contactHandle}>@{followup.contactHandle}</div>
                        )}
                      </td>

                      <td className={styles.td}>
                        <div className={styles.platformBadge}>
                          {platformIcon[followup.platform] ? (
                            <img
                              src={platformIcon[followup.platform]}
                              alt={platformLabel[followup.platform] ?? followup.platform}
                              className={styles.platformIcon}
                            />
                          ) : (
                            <span className={styles.platformFallback}>
                              {followup.platform.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span>{platformLabel[followup.platform] ?? followup.platform}</span>
                        </div>
                      </td>

                      <td className={styles.td}>
                        <span
                          className={`${styles.statusBadge} ${styles[`status_${followup.status}`]}`}
                        >
                          {statusLabel[followup.status]}
                        </span>
                      </td>

                      <td className={styles.td}>
                        <span className={`${styles.dateText} ${isOverdue ? styles.dateOverdue : ""}`}>
                          {isOverdue ? "En retard - " : ""}
                          {formatScheduledAt(followup.scheduledAt)}
                        </span>
                      </td>

                      <td className={styles.td}>
                        <span className={styles.previewText}>{preview}</span>
                      </td>

                      <td className={styles.tdActions}>
                        <div className={styles.actionGroup}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => handleOpenConversation(followup)}
                          >
                            Voir
                          </button>
                          {canAct && isInstagram && (
                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                              onClick={() => handleSendInstagram(followup)}
                            >
                              Envoyer
                            </button>
                          )}
                          {canAct && isWhatsApp && (
                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.actionBtnMuted}`}
                              title="L'envoi WhatsApp est automatique"
                              disabled
                            >
                              Envoi auto
                            </button>
                          )}
                          {canAct && (
                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                              onClick={() => void handleSkip(followup.id)}
                            >
                              Ignorer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Relances;
