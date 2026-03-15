import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RealtimeChannel, type PostgrestError } from "@supabase/supabase-js";
import supabase from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { AppLayout } from "../layouts";
import Header from "../components/Header";
import ConfirmationDialog from "../components/ConfirmationDialog";
import styles from "./Scraping.module.css";

type Platform = "instagram" | "tiktok";
type ScrapeMode = "user" | "filter";
type RunStatus = "pending" | "completed" | "failed";

type Lead = {
  platform: Platform;
  user_id: string;
  username: string;
  profile_url?: string;
  fetched_at: string;
  followers?: number;
  is_private?: boolean;
  is_verified?: boolean;
  already_seen?: boolean;
};

type ScrapeRun = {
  id: string;
  created_at: string;
  status: RunStatus;
  mode: ScrapeMode;
  platform: Platform;
  config: {
    username?: string;
    options?: { posts?: boolean; likes?: boolean; likers?: boolean };
    filters?: Record<string, any>;
  };
  scraped_count: number;
  leads: Lead[];
};

type SupabaseLeadRow = {
  platform: Platform;
  platform_user_id: string;
  username: string;
  profile_url?: string | null;
  followers?: number | null;
  is_private?: boolean | null;
  is_verified?: boolean | null;
};

type SupabaseRunLeadRow = {
  fetched_at: string;
  already_seen: boolean;
  lead_id: string;
  lead: SupabaseLeadRow | null;
};

type SupabaseRunRow = {
  id: string;
  created_at: string;
  status: RunStatus;
  mode: ScrapeMode;
  platform: Platform;
  config:
    | {
        username?: string;
        options?: { posts?: boolean; likes?: boolean; likers?: boolean };
        filters?: Record<string, any>;
      }
    | null;
  scraped_count: number | null;
  scrape_run_leads: SupabaseRunLeadRow[] | null;
};

const SCRAPING_EDGE_BASE =
  import.meta.env.VITE_SCRAPING_EDGE_URL ??
  "https://wxatvxfirhahjalneorq.supabase.co/functions/v1/scraping";

const PLATFORM_META: Record<
  Platform,
  { label: string; icon: string; color: string }
> = {
  instagram: {
    label: "Instagram",
    icon: "/logoConnectors/instagram.svg",
    color: "var(--app-primary)",
  },
  tiktok: {
    label: "TikTok",
    icon: "/logoConnectors/tiktok.webp",
    color: "var(--app-text-primary)",
  },
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatBadgeDate = (value: string) =>
  new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const buildRunsFromRows = (rows: SupabaseRunRow[]): ScrapeRun[] =>
  rows.map((row) => {
    const leads: Lead[] = [];
    (row.scrape_run_leads ?? []).forEach((runLead) => {
      const leadRow = runLead.lead;
      if (!leadRow) {
        return;
      }
      leads.push({
        platform: leadRow.platform,
        user_id: leadRow.platform_user_id,
        username: leadRow.username,
        profile_url: leadRow.profile_url ?? undefined,
        fetched_at: runLead.fetched_at,
        followers: leadRow.followers ?? undefined,
        is_private: leadRow.is_private ?? undefined,
        is_verified: leadRow.is_verified ?? undefined,
        already_seen: runLead.already_seen,
      });
    });
    return {
      id: row.id,
      created_at: row.created_at,
      status: row.status,
      mode: row.mode,
      platform: row.platform,
      config: row.config ?? {},
      scraped_count: row.scraped_count ?? leads.length,
      leads,
    };
  });

const Scraping: FunctionComponent = () => {
  const { user } = useAuth();
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [activeTab, setActiveTab] = useState<"history" | "all">("history");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isFilterConfigOpen, setIsFilterConfigOpen] = useState(false);
  const [userConfig, setUserConfig] = useState({
    platform: "instagram" as Platform,
    username: "",
    options: {
      posts: true,
      likes: true,
      likers: false,
    },
  });
  const [progress, setProgress] = useState(0);
  const [selectedRun, setSelectedRun] = useState<ScrapeRun | null>(null);
  const [isFetchingRuns, setIsFetchingRuns] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [isOptimisticPending, setIsOptimisticPending] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [leadsExpanded, setLeadsExpanded] = useState(false);
  const [isScrapingConfirmationOpen, setIsScrapingConfirmationOpen] =
    useState(false);
  const progressIntervalRef = useRef<number>();
  const finishTimeoutRef = useRef<number>();

  const hasPendingRun = runs.some((run) => run.status === "pending");
  const isRunning = hasPendingRun || isOptimisticPending;

  const allLeads = useMemo(() => {
    const aggregator = new Map<
      string,
      { lead: Lead; occurrences_count: number; last_seen_at: string }
    >();
    runs.forEach((run) => {
      run.leads.forEach((lead) => {
        const key = `${lead.platform}:${lead.user_id}`;
        const candidate = aggregator.get(key);
        const leadDate = new Date(lead.fetched_at);
        const lastSeenDate = candidate ? new Date(candidate.last_seen_at) : null;
        const isNewer = !candidate || leadDate > (lastSeenDate ?? new Date(0));
        aggregator.set(key, {
          lead: isNewer ? lead : candidate?.lead ?? lead,
          occurrences_count: candidate ? candidate.occurrences_count + 1 : 1,
          last_seen_at: isNewer
            ? lead.fetched_at
            : candidate?.last_seen_at ?? lead.fetched_at,
        });
      });
    });
    return Array.from(aggregator.values()).sort(
      (a, b) =>
        new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
    );
  }, [runs]);

  useEffect(() => {
    if (!user?.id) {
      setRuns([]);
      setIsFetchingRuns(false);
      return;
    }

    let channel: RealtimeChannel | null = null;
    let active = true;

    const loadRuns = async () => {
      setIsFetchingRuns(true);
      const { data, error }: { data: SupabaseRunRow[] | null; error: PostgrestError | null } =
        await supabase
          .from("scrape_runs")
          .select(
            `
              *,
              scrape_run_leads(
                fetched_at,
                already_seen,
                lead_id,
                lead:lead_id(
                  platform,
                  platform_user_id,
                  username,
                  profile_url,
                  followers,
                  is_private,
                  is_verified
                )
              )
            `
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

      if (!active) {
        return;
      }

      setIsFetchingRuns(false);
      if (error) {
        console.error("Impossible de charger les runs de scraping", error);
        setRuns([]);
        setRunError(
          "Impossible de récupérer les runs pour le moment. Rafraîchis la page."
        );
        return;
      }

      if (data) {
        setRuns(buildRunsFromRows(data));
        setRunError(null);
      } else {
        setRuns([]);
      }
    };

    loadRuns();

    channel = supabase
      .channel(`scrape_runs:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scrape_runs",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadRuns();
        }
      )
      .subscribe();

    return () => {
      active = false;
      if (channel) {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      }
    };
  }, [user]);

  useEffect(() => {
    if (isRunning) {
      setProgress((prev) => (prev > 0 ? prev : 12));
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
      }
      progressIntervalRef.current = window.setInterval(() => {
        setProgress((prev) => Math.min(prev + Math.random() * 7, 90));
      }, 400);
      return () => {
        if (progressIntervalRef.current) {
          window.clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = undefined;
        }
      };
    }
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning && progress > 0 && progress < 100) {
      const finishTimer = window.setTimeout(() => setProgress(100), 220);
      finishTimeoutRef.current = window.setTimeout(() => setProgress(0), 520);
      return () => {
        window.clearTimeout(finishTimer);
        if (finishTimeoutRef.current) {
          window.clearTimeout(finishTimeoutRef.current);
          finishTimeoutRef.current = undefined;
        }
      };
    }
  }, [isRunning, progress]);

  useEffect(() => {
    if (selectedRun) {
      const updated = runs.find((run) => run.id === selectedRun.id);
      if (!updated) {
        setSelectedRun(null);
      } else if (updated !== selectedRun) {
        setSelectedRun(updated);
      }
    }
  }, [runs, selectedRun]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
      }
      if (finishTimeoutRef.current) {
        window.clearTimeout(finishTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasPendingRun && isOptimisticPending) {
      setIsOptimisticPending(false);
    }
  }, [hasPendingRun, isOptimisticPending]);

  const statusClass: Record<RunStatus, string> = {
    completed: styles.statusBadgeSuccess,
    pending: styles.statusBadgePending,
    failed: styles.statusBadgeError,
  };

  const statusLabel: Record<RunStatus, string> = {
    completed: "Terminé",
    pending: "En attente",
    failed: "Échec",
  };

  const sortedRuns = useMemo(
    () =>
      [...runs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [runs]
  );

  const displayedHistoryRuns = historyExpanded ? sortedRuns : sortedRuns.slice(0, 10);
  const displayedLeads = leadsExpanded ? allLeads : allLeads.slice(0, 10);

  const handleOptionToggle = (option: keyof typeof userConfig.options) => {
    setUserConfig((prev) => ({
      ...prev,
      options: {
        ...prev.options,
        [option]: !prev.options[option],
      },
    }));
  };

  const handlePlatformChange = (platform: Platform) => {
    setUserConfig((prev) => ({ ...prev, platform }));
  };

  const runScraping = useCallback(async () => {
    if (isRunning || !user?.id) {
      return;
    }
    if (!userConfig.username.trim()) {
      setRunError("Un username est nécessaire pour lancer le scraping.");
      return;
    }

    setRunError(null);
    setIsOptimisticPending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Session invalide, reconnecte-toi.");
      }

      const mode: ScrapeMode = "user";
      const suffix = userConfig.platform === "instagram" ? "insta" : "tiktok";
      const isInstagram = userConfig.platform === "instagram";
      const url = new URL(`${SCRAPING_EDGE_BASE}/${suffix}`);
      const payload = {
        username: userConfig.username.trim(),
        platform: userConfig.platform,
        mode,
        options: userConfig.options,
      };
      const response = await fetch(
        isInstagram
          ? url.toString()
          : `${url.toString()}?${new URLSearchParams({
              username: payload.username,
              mode: payload.mode,
              platform: payload.platform,
            }).toString()}`,
        {
          method: isInstagram ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: isInstagram ? JSON.stringify(payload) : undefined,
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.message ?? "Impossible de lancer le scraping pour le moment."
        );
      }
    } catch (error) {
      setIsOptimisticPending(false);
      setRunError(
        error instanceof Error
          ? error.message
          : "Une erreur inconnue est survenue."
      );
    }
  }, [
    isRunning,
    user,
    userConfig.options,
    userConfig.platform,
    userConfig.username,
  ]);

  const openScrapingConfirmation = useCallback(() => {
    if (isRunning) {
      return;
    }
    if (!userConfig.username.trim()) {
      setRunError("Un username est nécessaire pour lancer le scraping.");
      return;
    }
    setRunError(null);
    setIsScrapingConfirmationOpen(true);
  }, [isRunning, userConfig.username]);

  const confirmScraping = useCallback(() => {
    setIsScrapingConfirmationOpen(false);
    runScraping();
  }, [runScraping]);

  return (
    <AppLayout>
      <div className={styles.content}>
        <Header minimal showLogo={false} />
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h1>Scraping</h1>
              <p>
                Pilotez vos collectes et suivez les runs en toute transparence.
              </p>
            </div>
            <span className={styles.sectionTag}>Automatisé</span>
          </div>
          <div className={styles.launchArea}>
            <div className={styles.cardGrid}>
              <div className={styles.launchCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardLabel}>Mode filtre</p>
                    <h2 className={styles.cardTitle}>Scraping par filtre</h2>
                  </div>
                  <span className={styles.badgeSoft}>Bientôt</span>
                </div>
                <button
                  type="button"
                  className={styles.configToggle}
                  onClick={() => setIsFilterConfigOpen((open) => !open)}
                >
                  {isFilterConfigOpen ? "Masquer la configuration" : "Afficher la configuration"}
                </button>
                <div className={styles.cardBody}>
                  {isFilterConfigOpen && (
                    <>
                      <p className={styles.cardDescription}>
                        Filtrer par hashtag et région, puis lancer des runs en masse.
                        Configuration à venir.
                      </p>
                      <div className={styles.comingSoon}>
                        <p>Interface de configuration en cours de développement.</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.launchCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardLabel}>Mode utilisateur</p>
                    <h2 className={styles.cardTitle}>Scraping par utilisateur</h2>
                  </div>
                  <img
                    src={PLATFORM_META[userConfig.platform].icon}
                    alt={PLATFORM_META[userConfig.platform].label}
                    className={styles.platformIcon}
                    width={32}
                    height={32}
                  />
                </div>
                <button
                  type="button"
                  className={styles.configToggle}
                  onClick={() => setIsConfigOpen((open) => !open)}
                  disabled={isRunning}
                >
                  {isConfigOpen ? "Masquer la configuration" : "Afficher la configuration"}
                </button>
                {isConfigOpen && (
                  <div className={styles.configPanel}>
                    <div className={styles.segmentedControl}>
                      {(["instagram", "tiktok"] as Platform[]).map((platform) => (
                        <button
                          type="button"
                          key={platform}
                          className={[
                            styles.segmentButton,
                            userConfig.platform === platform && styles.segmentButtonActive,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => handlePlatformChange(platform)}
                          disabled={isRunning}
                        >
                          <img
                            src={PLATFORM_META[platform].icon}
                            alt={PLATFORM_META[platform].label}
                            className={styles.smallPlatformIcon}
                            width={20}
                            height={20}
                          />
                          <span>{PLATFORM_META[platform].label}</span>
                        </button>
                      ))}
                    </div>
                    <label className={styles.fieldLabel} htmlFor="scraping-username">
                      Username cible
                    </label>
                    <input
                      id="scraping-username"
                      className={styles.textField}
                      type="text"
                      placeholder="ex: collectif.leads"
                      value={userConfig.username}
                      onChange={(event) =>
                        setUserConfig((prev) => ({
                          ...prev,
                          username: event.target.value,
                        }))
                      }
                      disabled={isRunning}
                    />
                    <div className={styles.options}>
                      {(
                        [
                          ["posts", "Récupérer posts"],
                          ["likes", "Récupérer likes"],
                          ["likers", "Récupérer likers"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className={styles.checkboxOption}>
                          <input
                            type="checkbox"
                            checked={userConfig.options[key]}
                            onChange={() => handleOptionToggle(key)}
                            disabled={isRunning}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={openScrapingConfirmation}
                      disabled={!userConfig.username.trim() || isRunning}
                    >
                      {isRunning ? "Scraping en cours…" : "Lancer le scraping"}
                    </button>
                    {runError && <p className={styles.errorText}>{runError}</p>}
                    {isRunning && (
                      <p className={styles.smallText}>Scraping en cours… ETA &lt; 30s</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          {isRunning && (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span>Scraping en cours…</span>
                <span className={styles.smallText}>&lt; 30s estimé</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressMeter}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <div className={styles.tabsContainer}>
            <div className={styles.tabStrip}>
              <button
                type="button"
                className={[
                  styles.tabButton,
                  activeTab === "history" && styles.tabButtonActive,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveTab("history")}
              >
                Historique
              </button>
              <button
                type="button"
                className={[
                  styles.tabButton,
                  activeTab === "all" && styles.tabButtonActive,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveTab("all")}
              >
                Tous les leads
              </button>
            </div>
            <div className={styles.tabPanel}>
              {activeTab === "history" && (
                <div className={styles.historyList}>
                  {isFetchingRuns && (
                    <p className={styles.smallText}>Chargement des runs…</p>
                  )}
                  {!isFetchingRuns && sortedRuns.length === 0 && (
                    <p className={styles.smallText}>Aucun run saisi pour le moment.</p>
                  )}
                  {!isFetchingRuns &&
                    displayedHistoryRuns.map((run) => (
                      <article
                        key={run.id}
                        className={styles.runCard}
                        onClick={() => setSelectedRun(run)}
                      >
                        <div className={styles.runMeta}>
                          <div className={styles.platformRow}>
                            <img
                              src={PLATFORM_META[run.platform].icon}
                              alt={PLATFORM_META[run.platform].label}
                              className={styles.smallPlatformIcon}
                              width={20}
                              height={20}
                            />
                            <div>
                              <p className={styles.runTitle}>
                                {PLATFORM_META[run.platform].label} ·{' '}
                                {run.mode === "user" ? "Par utilisateur" : "Par filtre"}
                              </p>
                              {run.config.username && (
                                <p className={styles.runSubtitle}>
                                  {run.config.username}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={statusClass[run.status]}>
                            {statusLabel[run.status]}
                          </span>
                        </div>
                        <div className={styles.runFooter}>
                          <div>
                            <p className={styles.badgeText}>
                              {formatBadgeDate(run.created_at)}
                            </p>
                            <p className={styles.smallText}>{run.scraped_count} leads</p>
                          </div>
                          <span className={styles.badge}>{formatDate(run.created_at)}</span>
                        </div>
                      </article>
                    ))}
                  {sortedRuns.length > 10 && (
                    <button
                      type="button"
                      className={styles.showMoreButton}
                      onClick={() => setHistoryExpanded((prev) => !prev)}
                    >
                      {historyExpanded ? "Réduire" : "Afficher plus"}
                    </button>
                  )}
                </div>
              )}
              {activeTab === "all" && (
                <div className={styles.allLeadsList}>
                  {allLeads.length === 0 ? (
                    <p className={styles.smallText}>Aucun lead disponible pour le moment.</p>
                  ) : (
                    displayedLeads.map((entry) => (
                      <article
                        key={`${entry.lead.platform}:${entry.lead.user_id}`}
                        className={styles.leadCard}
                      >
                        <div className={styles.leadRow}>
                          <img
                            src={PLATFORM_META[entry.lead.platform].icon}
                            alt={PLATFORM_META[entry.lead.platform].label}
                            className={styles.smallPlatformIcon}
                            width={20}
                            height={20}
                          />
                          <a
                            href={entry.lead.profile_url ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.leadUsername}
                          >
                            {entry.lead.username}
                            {entry.lead.is_verified && (
                              <span className={styles.badgeVerified}>vérifié</span>
                            )}
                          </a>
                          <span className={styles.smallText}>
                            Last seen le {formatBadgeDate(entry.last_seen_at)}
                          </span>
                        </div>
                        <div className={styles.leadDetails}>
                          {entry.lead.followers !== undefined && (
                            <span>
                              {entry.lead.followers.toLocaleString()} followers
                            </span>
                          )}
                          {entry.lead.is_private !== undefined && (
                            <span>
                              {entry.lead.is_private ? "privé" : "public"}
                            </span>
                          )}
                          {entry.occurrences_count > 1 && (
                            <span className={styles.badgeOccurrences}>
                              x{entry.occurrences_count}
                            </span>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                  {allLeads.length > 10 && (
                    <button
                      type="button"
                      className={styles.showMoreButton}
                      onClick={() => setLeadsExpanded((prev) => !prev)}
                    >
                      {leadsExpanded ? "Réduire" : "Afficher plus"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
        {selectedRun && (
          <div className={styles.modalOverlay} onClick={() => setSelectedRun(null)}>
            <div
              className={styles.modalContent}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalTitle}>
                    Détails du scraping · {PLATFORM_META[selectedRun.platform].label}
                  </p>
                  <p className={styles.smallText}>
                    Run initié le {formatDate(selectedRun.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setSelectedRun(null)}
                >
                  Fermer
                </button>
              </div>
              <div className={styles.modalBody}>
                {selectedRun.leads.map((lead) => (
                  <div key={lead.user_id} className={styles.leadRowModal}>
                    <div className={styles.leadRow}>
                      <img
                        src={PLATFORM_META[lead.platform].icon}
                        alt={PLATFORM_META[lead.platform].label}
                        className={styles.smallPlatformIcon}
                        width={20}
                        height={20}
                      />
                      <a
                        href={lead.profile_url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.leadUsername}
                      >
                        {lead.username}
                      </a>
                      {lead.already_seen && (
                        <span className={styles.badgeSoft}>Déjà scrappé</span>
                      )}
                    </div>
                    <div className={styles.leadDetails}>
                      <span className={styles.smallText}>
                        {new Date(lead.fetched_at).toLocaleString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {lead.followers !== undefined && (
                        <span>{lead.followers.toLocaleString()} followers</span>
                      )}
                      {typeof lead.is_verified === 'boolean' && (
                        <span>{lead.is_verified ? 'vérifié' : 'non vérifié'}</span>
                      )}
                      {typeof lead.is_private === 'boolean' && (
                        <span>{lead.is_private ? 'privé' : 'public'}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <ConfirmationDialog
          open={isScrapingConfirmationOpen}
          title="Confirmer le scraping"
          message="Tu es sur le point de lancer un scraping utilisateur. Veux-tu continuer ?"
          onClose={() => setIsScrapingConfirmationOpen(false)}
          onConfirm={confirmScraping}
          confirmLabel="Oui, lancer"
          cancelLabel="Annuler"
        />
      </div>
    </AppLayout>
  );
};

export default Scraping;

/*
Recommandation tables Supabase :

1) public.scrape_runs
   - id uuid pk
   - user_id uuid (owner)
   - created_at timestamptz
   - status text ('pending','completed','failed')
   - mode text ('user','filter')
   - platform text ('instagram','tiktok')
   - config jsonb (username + options + filters)
   - scraped_count int

2) public.scrape_leads
   - id uuid pk
   - platform text
   - platform_user_id text (user_id externe) UNIQUE avec platform
   - username text
   - profile_url text
   - followers int
   - is_private bool
   - is_verified bool
   - first_seen_at timestamptz
   - last_seen_at timestamptz

3) public.scrape_run_leads
   - id uuid pk
   - run_id uuid fk scrape_runs
   - lead_id uuid fk scrape_leads
   - fetched_at timestamptz
   - already_seen bool
   - unique(run_id, lead_id)

*/
