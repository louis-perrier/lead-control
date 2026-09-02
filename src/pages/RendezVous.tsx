import {
  FunctionComponent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts";
import supabase from "../lib/supabase";
import styles from "./RendezVous.module.css";

// Types

type DealClosing = {
  id: string;
  amount: number | null;
  is_closed: boolean | null;
  closed_at: string | null;
  created_at: string;
};

type Booking = {
  id: string;
  conversation_id: number | null;
  event_type_name: string | null;
  invitee_email: string | null;
  invitee_name: string | null;
  event_start_at: string;
  event_end_at: string | null;
  created_at: string;
  contactHandle: string | null;
  contactName: string | null;
  platform: string | null;
  agentConfigId: string | null;
  summary: string | null;
  closing: DealClosing | null;
};

type StatusFilter = "all" | "upcoming" | "closed" | "not_closed";
type PeriodFilter = "today" | "week" | "month" | "all";

// Helpers

const isTodayDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

const isThisWeek = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return d >= start && d < end;
};

const isThisMonth = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day.charAt(0).toUpperCase() + day.slice(1)} à ${time}`;
};

// Mapper

const mapBooking = (raw: any): Booking => {
  const conv = raw.conversations ?? null;
  const memoryRaw = conv?.conversation_memory;
  const memoryArr = Array.isArray(memoryRaw) ? memoryRaw : memoryRaw ? [memoryRaw] : [];
  const closingsArr: DealClosing[] = conv?.deal_closings ?? [];
  const latestClosing = closingsArr.length > 0
    ? [...closingsArr].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]
    : null;

  return {
    id: raw.id,
    conversation_id: raw.conversation_id ?? null,
    event_type_name: raw.event_type_name ?? null,
    invitee_email: raw.invitee_email ?? null,
    invitee_name: raw.invitee_name ?? null,
    event_start_at: raw.event_start_at,
    event_end_at: raw.event_end_at ?? null,
    created_at: raw.created_at,
    contactHandle: conv?.contact_handle ?? null,
    contactName: conv?.contact_display_name ?? null,
    platform: conv?.platform ?? null,
    agentConfigId: conv?.agent_config_id ?? null,
    summary: memoryArr[0]?.summary ?? null,
    closing: latestClosing,
  };
};

// Component

const RendezVous: FunctionComponent = () => {
  const navigate = useNavigate();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");

  // Closing modal
  const [closingOpen, setClosingOpen] = useState(false);
  const [closingBooking, setClosingBooking] = useState<Booking | null>(null);
  const [closingAmount, setClosingAmount] = useState("");
  const [closingIsWon, setClosingIsWon] = useState(true);
  const [closingRecordId, setClosingRecordId] = useState<string | null>(null);
  const [canUndoClosing, setCanUndoClosing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingBookingId, setDeletingBookingId] = useState<string | null>(null);
  const backdropRef = useRef(false);

  // Fetch

  const fetchBookings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("calendly_bookings")
      .select(`
        id,
        conversation_id,
        event_type_name,
        invitee_email,
        invitee_name,
        event_start_at,
        event_end_at,
        created_at,
        conversations (
          id,
          contact_handle,
          contact_display_name,
          platform,
          agent_config_id,
          conversation_memory ( summary ),
          deal_closings ( id, amount, is_closed, closed_at, created_at )
        )
      `)
      .eq("user_id", user.id)
      .order("event_start_at", { ascending: true });

    if (!error && data) {
      setBookings(data.map(mapBooking));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Filters

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = search.trim().toLowerCase();

    return bookings.filter((b) => {
      // Search
      if (q) {
        const name = (b.invitee_name ?? b.contactName ?? "").toLowerCase();
        const email = (b.invitee_email ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }

      // Period
      if (periodFilter === "today" && !isTodayDate(b.event_start_at)) return false;
      if (periodFilter === "week" && !isThisWeek(b.event_start_at)) return false;
      if (periodFilter === "month" && !isThisMonth(b.event_start_at)) return false;

      // Status
      if (statusFilter === "upcoming") {
        return new Date(b.event_start_at).getTime() >= now;
      }
      if (statusFilter === "closed") {
        return b.closing?.is_closed === true;
      }
      if (statusFilter === "not_closed") {
        return !b.closing || b.closing.is_closed !== true;
      }

      return true;
    });
  }, [bookings, search, statusFilter, periodFilter]);

  // Closing modal

  const openClosingModal = useCallback(async (booking: Booking) => {
    setClosingBooking(booking);
    setClosingRecordId(booking.closing?.id ?? null);

    const hasClosingResult =
      booking.closing?.is_closed === true || booking.closing?.is_closed === false;

    if (hasClosingResult) {
      setCanUndoClosing(true);
      setClosingIsWon(booking.closing?.is_closed === true);
      setClosingAmount(
        typeof booking.closing?.amount === "number" && booking.closing.amount > 0
          ? String(booking.closing.amount)
          : "",
      );
      setClosingOpen(true);
      return;
    }

    setCanUndoClosing(false);
    setClosingIsWon(true);
    setClosingAmount("");

    if (booking.agentConfigId) {
      const { data } = await supabase
        .from("agent_configs")
        .select("configs")
        .eq("configs_id", booking.agentConfigId)
        .single();
      const avg = (data?.configs as Record<string, any>)?.avg_deal_value;
      if (avg != null) setClosingAmount(String(avg));
    }

    setClosingOpen(true);
  }, []);

  const handleConfirmClosing = useCallback(async () => {
    if (!closingBooking?.conversation_id) return;
    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const parsedAmount = Number.parseFloat(closingAmount);
      const normalizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
      const payload = {
        amount: normalizedAmount,
        is_closed: closingIsWon,
        closed_at: new Date().toISOString(),
      };

      if (closingRecordId) {
        await supabase
          .from("deal_closings")
          .update(payload)
          .eq("id", closingRecordId);
      } else {
        await supabase.from("deal_closings").insert({
          conversation_id: closingBooking.conversation_id,
          user_id: user.id,
          agent_config_id: closingBooking.agentConfigId ?? null,
          ...payload,
        });
      }

      setCanUndoClosing(true);
      setClosingOpen(false);
      setClosingBooking(null);
      fetchBookings();
    } finally {
      setIsSubmitting(false);
    }
  }, [closingBooking, closingAmount, closingIsWon, closingRecordId, fetchBookings]);

  const handleUndoClosing = useCallback(async () => {
    if (!closingBooking?.conversation_id) return;
    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("deal_closings")
        .update({
          amount: 0,
          is_closed: null,
          closed_at: null,
        })
        .eq("conversation_id", closingBooking.conversation_id)
        .eq("user_id", user.id);

      setCanUndoClosing(false);
      setClosingRecordId(null);
      setClosingOpen(false);
      setClosingBooking(null);
      fetchBookings();
    } finally {
      setIsSubmitting(false);
    }
  }, [closingBooking, fetchBookings]);

  const handleDeleteBooking = useCallback(async (booking: Booking) => {
    const displayName = booking.invitee_name || booking.contactName || "ce rendez-vous";
    const shouldDelete = window.confirm(
      `Supprimer ${displayName} ? Cette action est definitive.`,
    );
    if (!shouldDelete) return;

    setDeletingBookingId(booking.id);
    try {
      const { error } = await supabase
        .from("calendly_bookings")
        .delete()
        .eq("id", booking.id);

      if (error) {
        window.alert("Impossible de supprimer ce rendez-vous.");
        return;
      }

      setBookings((prev) => prev.filter((item) => item.id !== booking.id));

      if (closingBooking?.id === booking.id) {
        setClosingOpen(false);
        setClosingBooking(null);
        setClosingRecordId(null);
        setCanUndoClosing(false);
      }
    } finally {
      setDeletingBookingId(null);
    }
  }, [closingBooking?.id]);

  const handleBackdropDown = (e: PointerEvent<HTMLDivElement>) => {
    backdropRef.current = e.target === e.currentTarget;
  };
  const handleBackdropUp = (e: PointerEvent<HTMLDivElement>) => {
    if (backdropRef.current && e.target === e.currentTarget) setClosingOpen(false);
    backdropRef.current = false;
  };

  // Render

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    { value: "upcoming", label: "À venir" },
    { value: "closed", label: "Closés" },
    { value: "not_closed", label: "Non closés" },
  ];

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: "all", label: "Tout" },
    { value: "today", label: "Aujourd'hui" },
    { value: "week", label: "Cette semaine" },
    { value: "month", label: "Ce mois" },
  ];

  return (
    <AppLayout>
      <div className={styles.page}>
        <div className={styles.inner}>

          {/* Header */}
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>
              Rendez-vous{" "}
              {!loading && (
                <span className={styles.pageCount}>· {filtered.length}</span>
              )}
            </h1>
          </div>

          {/* Filters */}
          <div className={styles.filters}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Rechercher un nom, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.filterGroup}>
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.filterBtn} ${statusFilter === opt.value ? styles.filterBtnActive : ""}`}
                  onClick={() => setStatusFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className={styles.filterGroup}>
              {periodOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.filterBtn} ${periodFilter === opt.value ? styles.filterBtnActive : ""}`}
                  onClick={() => setPeriodFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className={styles.loading}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📅</span>
              <span>Aucun rendez-vous trouvé.</span>
            </div>
          ) : (
            <div className={styles.list}>
              {filtered.map((booking) => {
                const displayName = booking.invitee_name || booking.contactName || "Inconnu";
                const isToday = isTodayDate(booking.event_start_at);
                const hasClosed = booking.closing?.is_closed === true;
                const hasLost = booking.closing?.is_closed === false;
                const hasClosingResult = hasClosed || hasLost;
                const closingAmountValue = booking.closing?.amount ?? 0;

                return (
                  <div key={booking.id} className={styles.card}>

                    {/* Top row */}
                    <div className={styles.cardTop}>
                      <div className={styles.cardIdentity}>
                        <span className={styles.cardName}>{displayName}</span>
                        {booking.invitee_email && (
                          <span className={styles.cardEmail}>{booking.invitee_email}</span>
                        )}
                      </div>
                      <div className={styles.cardBadges}>
                        {isToday && <span className={styles.badgeToday}>Aujourd'hui</span>}
                        {hasClosed && (
                          <span className={styles.badgeClosed}>
                            Gagné · {closingAmountValue > 0 ? `${closingAmountValue} €` : "Closé"}
                          </span>
                        )}
                        {hasLost && <span className={styles.badgeLost}>Perdu</span>}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className={styles.cardMeta}>
                      <span className={styles.cardDatetime}>{formatDateTime(booking.event_start_at)}</span>
                      {booking.event_type_name && (
                        <>
                          <span className={styles.cardMetaDot} />
                          <span className={styles.cardEventType}>{booking.event_type_name}</span>
                        </>
                      )}
                    </div>

                    {/* Summary */}
                    {booking.summary && (
                      <div className={styles.cardSummary}>
                        <div className={styles.cardSummaryLabel}>Résumé IA</div>
                        {booking.summary}
                      </div>
                    )}

                    {/* Actions */}
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.btnClose}
                        onClick={() => openClosingModal(booking)}
                      >
                        {hasClosingResult ? "Modifier le closing" : "Marquer comme closé"}
                      </button>
                      {booking.conversation_id && (
                        <button
                          type="button"
                          className={styles.btnConv}
                          onClick={() =>
                            (() => {
  const params = new URLSearchParams();
  params.set("conversation_id", String(booking.conversation_id));
  navigate(`/app/conversations?${params.toString()}`);
})()
                          }
                        >
                          Voir la conversation →
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.btnDelete}
                        disabled={deletingBookingId === booking.id}
                        onClick={() => void handleDeleteBooking(booking)}
                      >
                        {deletingBookingId === booking.id ? "Suppression..." : "Supprimer"}
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Closing Modal */}
      {closingOpen && closingBooking && (
        <div
          className={styles.modalBackdrop}
          onPointerDown={handleBackdropDown}
          onPointerUp={handleBackdropUp}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>Enregistrer un closing</p>
            <p className={styles.modalSubtitle}>
              {closingBooking.invitee_name || closingBooking.contactName || "Ce rendez-vous"}
            </p>

            {/* Gagnée / Perdue */}
            <div className={styles.modalField}>
              <span className={styles.modalLabel}>Résultat</span>
              <div className={styles.modalToggle}>
                <button
                  type="button"
                  className={`${styles.modalToggleBtn} ${closingIsWon ? styles.modalToggleBtnWon : ""}`}
                  onClick={() => setClosingIsWon(true)}
                >
                  Gagnée ✓
                </button>
                <button
                  type="button"
                  className={`${styles.modalToggleBtn} ${!closingIsWon ? styles.modalToggleBtnLost : ""}`}
                  onClick={() => setClosingIsWon(false)}
                >
                  Perdue
                </button>
              </div>
            </div>

            {/* Montant */}
            {closingIsWon && (
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>Montant (€)</span>
                <input
                  type="number"
                  className={styles.modalInput}
                  value={closingAmount}
                  onChange={(e) => setClosingAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
            )}

            <div className={styles.modalFooter}>
              {canUndoClosing && (
                <button
                  type="button"
                  className={styles.modalBtnCancel}
                  disabled={isSubmitting}
                  onClick={handleUndoClosing}
                >
                  Annuler le closing
                </button>
              )}
              <button
                type="button"
                className={styles.modalBtnCancel}
                disabled={isSubmitting}
                onClick={() => setClosingOpen(false)}
              >
                Fermer
              </button>
              <button
                type="button"
                className={styles.modalBtnConfirm}
                disabled={isSubmitting}
                onClick={handleConfirmClosing}
              >
                {isSubmitting ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default RendezVous;
