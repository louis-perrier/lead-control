import {
  DragEvent,
  FunctionComponent,
  PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "../layouts";
import useAgents from "../hooks/useAgents";
import useAllConversations from "../hooks/useAllConversations";
import useAutoSyncProspectContacts from "../hooks/useAutoSyncProspectContacts";
import supabase from "../lib/supabase";
import {
  ProspectContactRecord,
  ProspectConversation,
  buildLeadNote,
  findMatchingContact,
  getLastProspectReplyAt,
  getLeadOrigin,
  getLeadOriginLabel,
  hasProspectReply,
  isCrmEligibleConversation,
  mapConversationRecordToProspect,
} from "../lib/prospects";
import styles from "./Crm.module.css";

type QualificationKey = "hot" | "warm" | "cold" | "pending";
type ViewFilter = "all" | "attention" | "unread" | "awaiting_reply" | "replied";
type OriginFilter = "all" | "incoming" | "outreach_reply";
type QualificationFilter = "all" | QualificationKey;
type PlatformFilter = "all" | ProspectConversation["channel"];
type SortOption = "recent" | "unread" | "qualification" | "name";

type CrmContact = ProspectContactRecord & {
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadCard = {
  id: string;
  conversationId: string;
  name: string;
  handle: string;
  phone: string;
  email: string;
  note: string;
  lastMessage: string;
  channel: ProspectConversation["channel"];
  origin: "incoming" | "outreach_reply";
  originLabel: string;
  qualificationKey: QualificationKey;
  lastActivity: string;
  unreadCount: number;
  messageCount: number;
  hasReply: boolean;
  needsAttention: boolean;
};

const QUALIFICATION_META: Record<
  QualificationKey,
  { label: string; className: string }
> = {
  hot: { label: "Chaud", className: styles.badgeHot },
  warm: { label: "Tiède", className: styles.badgeWarm },
  cold: { label: "Froid", className: styles.badgeCold },
  pending: { label: "À qualifier", className: styles.badgePending },
};

const QUALIFICATION_SORT_ORDER: Record<QualificationKey, number> = {
  hot: 0,
  warm: 1,
  pending: 2,
  cold: 3,
};

const VIEW_FILTER_OPTIONS: Array<{ value: ViewFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "attention", label: "À traiter" },
  { value: "unread", label: "Non lus" },
  { value: "awaiting_reply", label: "Sans réponse" },
  { value: "replied", label: "Ont répondu" },
];

const ORIGIN_FILTER_OPTIONS: Array<{ value: OriginFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "incoming", label: "Entrants" },
  { value: "outreach_reply", label: "Prospection" },
];

const SORT_OPTION_LABELS: Record<SortOption, string> = {
  recent: "Activité récente",
  unread: "Non lus",
  qualification: "Qualification",
  name: "Nom",
};

const PLATFORM_META: Record<
  ProspectConversation["channel"],
  { label: string; icon: string }
> = {
  Instagram: {
    label: "Instagram",
    icon: "/logoConnectors/instagram.svg",
  },
  WhatsApp: {
    label: "WhatsApp",
    icon: "/logoConnectors/whatsapp.webp",
  },
  Telegram: {
    label: "Telegram",
    icon: "https://cdn.simpleicons.org/telegram/229ED9",
  },
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

type CsvParsed = { headers: string[]; rows: string[][] };
type CrmColumnMapping = {
  full_name: string;
  phone_e164: string;
  instagram_handle: string;
  email: string;
};

const CRM_MAPPED_FIELDS = [
  { key: "full_name", label: "Nom complet" },
  { key: "phone_e164", label: "Téléphone" },
  { key: "instagram_handle", label: "Handle Instagram" },
  { key: "email", label: "Email" },
] as const;

function parseCsv(text: string): CsvParsed {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const first = lines[0];
  const delimiter =
    first.includes(";") &&
    (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length
      ? ";"
      : ",";
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ""; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  };
  return {
    headers: parseRow(lines[0]),
    rows: lines.slice(1).filter((l) => l.trim().length > 0).map(parseRow),
  };
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// ─── CrmImportModal ───────────────────────────────────────────────────────────

const CrmImportModal: FunctionComponent<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [csv, setCsv] = useState<CsvParsed | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mapping, setMapping] = useState<CrmColumnMapping>({
    full_name: "",
    phone_e164: "",
    instagram_handle: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backdropPointerDownRef = useRef(false);

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    backdropPointerDownRef.current = event.target === event.currentTarget;
  };
  const handleBackdropPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const shouldClose =
      backdropPointerDownRef.current && event.target === event.currentTarget;
    backdropPointerDownRef.current = false;
    if (shouldClose) onClose();
  };
  const resetBackdropPointer = () => { backdropPointerDownRef.current = false; };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Fichier CSV requis (.csv). Pour Excel, exportez en CSV depuis Fichier > Enregistrer sous.");
      return;
    }
    if (!file.name.endsWith(".csv")) {
      setError("Fichier CSV requis. Depuis Excel : Fichier > Enregistrer sous > CSV. Depuis Google Sheets : Fichier > Télécharger > CSV.");
      return;
    }
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      setCsv(parsed);
      const autoMap: Partial<CrmColumnMapping> = {};
      parsed.headers.forEach((h) => {
        const lower = h.toLowerCase();
        if (lower.includes("nom") || lower.includes("name") || lower.includes("full") || lower.includes("prenom") || lower.includes("prénom")) {
          autoMap.full_name = h;
        } else if (lower.includes("phone") || lower.includes("tel") || lower.includes("mobile") || lower.includes("portable")) {
          autoMap.phone_e164 = h;
        } else if (lower.includes("instagram") || lower.includes("handle") || lower.includes("ig") || lower.includes("@")) {
          autoMap.instagram_handle = h;
        } else if (lower.includes("email") || lower.includes("mail") || lower.includes("courriel")) {
          autoMap.email = h;
        }
      });
      setMapping((prev) => ({ ...prev, ...autoMap }));
    };
    reader.readAsText(file, "utf-8");
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validatePhone = (phone: string): string | null => {
    if (!phone) return null;
    if (!/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
      return "Format international requis (ex: +33612345678)";
    }
    return null;
  };

  const validateEmail = (email: string): string | null => {
    if (!email) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Email invalide";
    return null;
  };

  const handleImport = async () => {
    if (!csv) return;
    if (csv.rows.length === 0) { setError("Fichier CSV vide."); return; }

    const colIndex = (col: string) => (col ? csv.headers.indexOf(col) : -1);
    const get = (row: string[], col: string) => {
      const idx = colIndex(col);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    type SkippedRow = { line: number; reason: string };
    const records: Array<{
      full_name: string | null;
      instagram_handle: string | null;
      phone_e164: string | null;
      email: string | null;
      tags: string[];
      notes: null;
      source: "csv_import";
      status: "new";
    }> = [];
    const skipped: SkippedRow[] = [];

    csv.rows.forEach((row, i) => {
      const line = i + 2;
      const fullName = get(row, mapping.full_name);
      const instagram = get(row, mapping.instagram_handle);
      const phone = get(row, mapping.phone_e164);
      const email = get(row, mapping.email);

      if (!fullName) { skipped.push({ line, reason: "nom complet manquant" }); return; }
      if (!instagram && !phone) { skipped.push({ line, reason: "aucun handle ni téléphone" }); return; }

      const phoneErr = validatePhone(phone);
      if (phoneErr) { skipped.push({ line, reason: phoneErr }); return; }
      const emailErr = validateEmail(email);
      if (emailErr) { skipped.push({ line, reason: emailErr }); return; }

      records.push({
        full_name: fullName || null,
        instagram_handle: instagram ? instagram.replace(/^@/, "") : null,
        phone_e164: phone || null,
        email: email || null,
        tags: [],
        notes: null,
        source: "csv_import",
        status: "new",
      });
    });

    if (records.length === 0) {
      setError(
        `Aucune ligne valide. ${skipped.length} ligne(s) ignorée(s) : ` +
        skipped.map((s) => `ligne ${s.line} (${s.reason})`).join(", ") + "."
      );
      return;
    }

    if (skipped.length > 0) {
      const ok = window.confirm(
        `${records.length} contact(s) valide(s).\n${skipped.length} ligne(s) ignorée(s) :\n` +
        skipped.map((s) => `• Ligne ${s.line} : ${s.reason}`).join("\n") +
        "\n\nContinuer l'import ?"
      );
      if (!ok) return;
    }

    setError(null);
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expirée, reconnecte-toi."); setSubmitting(false); return; }
    const recordsWithUser = records.map((r) => ({ ...r, user_id: user.id }));
    const { error: dbError } = await supabase.from("contacts").insert(recordsWithUser);
    setSubmitting(false);
    if (dbError) { setError(dbError.message); return; }
    onSuccess();
    onClose();
  };

  const previewRows = csv?.rows.slice(0, 3) ?? [];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.importBackdrop}
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
      onPointerCancel={resetBackdropPointer}
      onPointerLeave={resetBackdropPointer}
    >
      <div className={styles.importModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.importModalHeader}>
          <div>
            <h2 className={styles.importModalTitle}>Import CSV</h2>
            <p className={styles.importModalLead}>
              Importe des contacts depuis un fichier CSV (Excel ou Google Sheets).
            </p>
          </div>
          <button className={styles.importModalClose} onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className={styles.importModalBody}>
          <div className={styles.importSection}>
            <div
              className={`${styles.importDropzone} ${isDragging ? styles.importDropzoneActive : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.importDropzoneIcon}>📂</div>
              <div className={styles.importDropzoneText}>
                Glisse ton fichier CSV ici ou clique pour sélectionner
              </div>
              <div className={styles.importDropzoneHint}>
                Excel : Fichier {">"} Enregistrer sous {">"} CSV. Google Sheets : Fichier {">"} Télécharger {">"} CSV.
              </div>
              {fileName && (
                <div className={styles.importDropzoneName}>📄 {fileName}</div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }}
              />
            </div>
          </div>

          {csv && (
            <div className={styles.importSection}>
              <p className={styles.importSectionTitle}>Correspondance des colonnes</p>
              <div className={styles.importMappingGrid}>
                <span className={styles.importMappingLabel}>Champ LeadControl</span>
                <span />
                <span className={styles.importMappingLabel}>Colonne CSV</span>
                {CRM_MAPPED_FIELDS.map(({ key, label }) => (
                  <>
                    <span key={`label-${key}`} className={styles.importMappingField}>{label}</span>
                    <span key={`arrow-${key}`} className={styles.importMappingArrow}>→</span>
                    <select
                      key={`select-${key}`}
                      className={styles.importMappingSelect}
                      value={mapping[key]}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
                    >
                      <option value="">— ignorer —</option>
                      {csv.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </>
                ))}
              </div>
            </div>
          )}

          {csv && previewRows.length > 0 && (
            <div className={styles.importSection}>
              <p className={styles.importSectionTitle}>
                Aperçu ({previewRows.length} première{previewRows.length > 1 ? "s" : ""} ligne{previewRows.length > 1 ? "s" : ""})
              </p>
              <div className={styles.importPreviewWrapper}>
                <table className={styles.importPreviewTable}>
                  <thead>
                    <tr>
                      {csv.headers.map((h) => (
                        <th key={h} className={styles.importPreviewTh}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={styles.importPreviewTd}>{cell || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p className={styles.importError}>{error}</p>}
        </div>

        <div className={styles.importModalFooter}>
          <button className={`${styles.secondaryButton} ${styles.importCancelBtn}`} onClick={onClose} type="button">
            Annuler
          </button>
          <button
            className={styles.primaryButton}
            onClick={handleImport}
            disabled={!csv || submitting}
            type="button"
          >
            {submitting
              ? "Import en cours…"
              : csv
              ? `Importer ${csv.rows.length} ligne${csv.rows.length > 1 ? "s" : ""}`
              : "Importer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const normalizeText = (value?: string | null): string => value?.trim() ?? "";

const getTimestamp = (iso: string): number => {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : 0;
};

const formatRelativeTime = (iso: string): string => {
  const timestamp = getTimestamp(iso);
  if (!timestamp) return "récemment";

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;
  if (diffMinutes < 1440) return `il y a ${Math.floor(diffMinutes / 60)} h`;
  return `il y a ${Math.floor(diffMinutes / 1440)} j`;
};

const getQualificationKey = (
  conversation: ProspectConversation,
): QualificationKey => {
  const heatTag = normalizeText(conversation.heatTag).toLowerCase();
  if (heatTag === "hot") return "hot";
  if (heatTag === "warm") return "warm";
  if (heatTag === "cold") return "cold";
  return "pending";
};

const fetchContacts = async (): Promise<CrmContact[]> => {
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, full_name, phone_e164, instagram_handle, email, notes, conversation_id, status, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CrmContact[];
};

const Crm: FunctionComponent = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { displayedAgents, isDisplayedAgentsLoading } = useAgents();
  const [showImportModal, setShowImportModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [qualificationFilter, setQualificationFilter] =
    useState<QualificationFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  const agentConfigIds = useMemo(
    () =>
      displayedAgents
        .map((agent) => agent.display_id ?? agent.agent_id)
        .filter(Boolean),
    [displayedAgents],
  );

  const { data: rawConversations = [], isLoading: conversationsLoading } =
    useAllConversations(agentConfigIds);

  const {
    data: contacts = [],
    isLoading: contactsLoading,
    refetch: refetchContacts,
  } = useQuery({
    queryKey: ["crm", "contacts"],
    queryFn: fetchContacts,
    staleTime: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("realtime:crm-contacts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["crm", "contacts"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { isSyncing } = useAutoSyncProspectContacts(
    rawConversations as Record<string, unknown>[],
    () => {
      void refetchContacts();
    },
  );

  const leads = useMemo<LeadCard[]>(() => {
    const crmConversations = (rawConversations as Record<string, unknown>[])
      .map(mapConversationRecordToProspect)
      .filter(isCrmEligibleConversation);

    return crmConversations
      .map((conversation) => {
        const matchedContact = findMatchingContact(conversation, contacts);
        const origin = getLeadOrigin(conversation);
        const handle =
          normalizeText(conversation.contactHandle) ||
          normalizeText(matchedContact?.instagram_handle);
        const phone =
          normalizeText(conversation.phone) ||
          normalizeText(matchedContact?.phone_e164);
        const email =
          normalizeText(conversation.email) ||
          normalizeText(matchedContact?.email);
        const preferredName =
          normalizeText(matchedContact?.full_name) ||
          normalizeText(conversation.contactName);
        const hasReply = hasProspectReply(conversation);
        const qualificationKey = getQualificationKey(conversation);
        const note = buildLeadNote(conversation, matchedContact?.notes);
        const lastMessage = normalizeText(conversation.lastMessage) || note;
        const name = preferredName || handle || phone || email || "Contact";
        const needsAttention =
          qualificationKey === "pending" || !hasReply || conversation.unreadCount > 0;

        return {
          id: conversation.id,
          conversationId: conversation.id,
          name,
          handle,
          phone,
          email,
          note,
          lastMessage,
          channel: conversation.channel,
          origin,
          originLabel: getLeadOriginLabel(conversation),
          qualificationKey,
          lastActivity: getLastProspectReplyAt(conversation),
          unreadCount: conversation.unreadCount,
          messageCount: conversation.messages.length,
          hasReply,
          needsAttention,
        };
      })
      .sort((a, b) => getTimestamp(b.lastActivity) - getTimestamp(a.lastActivity));
  }, [contacts, rawConversations]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const results = leads.filter((lead) => {
      if (viewFilter === "attention" && !lead.needsAttention) return false;
      if (viewFilter === "unread" && lead.unreadCount === 0) return false;
      if (viewFilter === "awaiting_reply" && lead.hasReply) return false;
      if (viewFilter === "replied" && !lead.hasReply) return false;
      if (originFilter !== "all" && lead.origin !== originFilter) return false;
      if (
        qualificationFilter !== "all" &&
        lead.qualificationKey !== qualificationFilter
      ) {
        return false;
      }
      if (platformFilter !== "all" && lead.channel !== platformFilter) {
        return false;
      }
      if (!q) return true;

      return [
        lead.name,
        lead.handle,
        lead.phone,
        lead.email,
        lead.note,
        lead.lastMessage,
        lead.originLabel,
        PLATFORM_META[lead.channel].label,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    });

    results.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name, "fr-FR", { sensitivity: "base" });
      }

      if (sortBy === "unread") {
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
        return getTimestamp(b.lastActivity) - getTimestamp(a.lastActivity);
      }

      if (sortBy === "qualification") {
        const qualificationDelta =
          QUALIFICATION_SORT_ORDER[a.qualificationKey] -
          QUALIFICATION_SORT_ORDER[b.qualificationKey];

        if (qualificationDelta !== 0) return qualificationDelta;
        return getTimestamp(b.lastActivity) - getTimestamp(a.lastActivity);
      }

      return getTimestamp(b.lastActivity) - getTimestamp(a.lastActivity);
    });

    return results;
  }, [
    leads,
    originFilter,
    platformFilter,
    qualificationFilter,
    searchQuery,
    sortBy,
    viewFilter,
  ]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      attention: leads.filter((lead) => lead.needsAttention).length,
      unread: leads.filter((lead) => lead.unreadCount > 0).length,
      hot: leads.filter((lead) => lead.qualificationKey === "hot").length,
    }),
    [leads],
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (searchQuery.trim()) labels.push(`Recherche : ${searchQuery.trim()}`);
    if (viewFilter !== "all") {
      labels.push(
        VIEW_FILTER_OPTIONS.find((option) => option.value === viewFilter)?.label ??
          viewFilter,
      );
    }
    if (qualificationFilter !== "all") {
      labels.push(QUALIFICATION_META[qualificationFilter].label);
    }
    if (originFilter !== "all") {
      labels.push(
        ORIGIN_FILTER_OPTIONS.find((option) => option.value === originFilter)?.label ??
          originFilter,
      );
    }
    if (platformFilter !== "all") {
      labels.push(PLATFORM_META[platformFilter].label);
    }
    if (sortBy !== "recent") {
      labels.push(`Tri : ${SORT_OPTION_LABELS[sortBy]}`);
    }

    return labels;
  }, [
    originFilter,
    platformFilter,
    qualificationFilter,
    searchQuery,
    sortBy,
    viewFilter,
  ]);

  const isLoading =
    isDisplayedAgentsLoading || conversationsLoading || contactsLoading;

  const resetFilters = () => {
    setSearchQuery("");
    setViewFilter("all");
    setOriginFilter("all");
    setQualificationFilter("all");
    setPlatformFilter("all");
    setSortBy("recent");
  };

  const handleExportCsv = () => {
    const headers = [
      "Nom",
      "Handle Instagram",
      "Téléphone",
      "Email",
      "Qualification",
      "Plateforme",
      "Provenance",
      "Dernière activité",
      "Non lus",
      "Nb messages",
      "Note CRM",
      "Dernier message",
    ];
    const rows = filteredLeads.map((lead) => [
      lead.name,
      lead.handle ? `@${lead.handle}` : "",
      lead.phone,
      lead.email,
      QUALIFICATION_META[lead.qualificationKey].label,
      PLATFORM_META[lead.channel].label,
      lead.originLabel,
      new Date(lead.lastActivity).toLocaleDateString("fr-FR"),
      String(lead.unreadCount),
      String(lead.messageCount),
      lead.note.replace(/[\r\n]+/g, " "),
      lead.lastMessage.replace(/[\r\n]+/g, " "),
    ]);
    const csv =
      "﻿" +
      [headers, ...rows]
        .map((row) => row.map(escapeCsvCell).join(";"))
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openConversation = (conversationId: string) => {
    const params = new URLSearchParams();
    params.set("conversation_id", conversationId);
    navigate(`/app/conversations?${params.toString()}`);
  };

  return (
    <AppLayout>
      <div className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.title}>CRM</h1>
            <p className={styles.subtitle}>
              Toutes les conversations remontent ici avec leur qualification, leur
              contexte et les points à traiter en priorité. L&apos;objectif est de
              pouvoir retrouver un lead, comprendre sa situation et agir vite.
            </p>
          </div>
          <div className={styles.heroRight}>
            <div className={styles.heroBadge}>
              {isSyncing
                ? "Synchronisation automatique…"
                : `${stats.total} conversation${stats.total > 1 ? "s" : ""} suivie${
                    stats.total > 1 ? "s" : ""
                  }`}
            </div>
            <div className={styles.heroActionRow}>
              <button
                type="button"
                className={styles.heroActionBtn}
                onClick={() => setShowImportModal(true)}
              >
                Importer
              </button>
              <button
                type="button"
                className={`${styles.heroActionBtn} ${styles.heroActionBtnPrimary}`}
                disabled={filteredLeads.length === 0}
                onClick={handleExportCsv}
              >
                Exporter ({filteredLeads.length})
              </button>
            </div>
          </div>
        </div>

        <div className={styles.statsGrid}>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>Conversations CRM</span>
            <strong className={styles.statValue}>{stats.total}</strong>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>À traiter</span>
            <strong className={styles.statValue}>{stats.attention}</strong>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>Non lus</span>
            <strong className={styles.statValue}>{stats.unread}</strong>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>Chauds</span>
            <strong className={styles.statValue}>{stats.hot}</strong>
          </article>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarTop}>
            <label className={styles.searchField}>
              <span className={styles.toolbarLabel}>Recherche</span>
              <input
                className={styles.searchInput}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Nom, handle, téléphone, email, note, dernier message..."
              />
            </label>

            <div className={styles.toolbarSide}>
              <div className={styles.resultsPanel}>
                <span className={styles.resultsLabel}>
                  {isSyncing ? "Résultats · sync auto" : "Résultats"}
                </span>
                <strong className={styles.resultsValue}>
                  {filteredLeads.length}
                  <span className={styles.resultsDivider}>/</span>
                  {leads.length}
                </strong>
              </div>

              <label className={styles.sortField}>
                <span className={styles.toolbarLabel}>Tri</span>
                <select
                  className={styles.filterSelect}
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                >
                  {(
                    Object.entries(SORT_OPTION_LABELS) as Array<
                      [SortOption, string]
                    >
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={styles.filterSection}>
            <span className={styles.toolbarLabel}>Vues rapides</span>
            <div className={styles.filterChipRow}>
              {VIEW_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.filterChip} ${
                    viewFilter === option.value ? styles.filterChipActive : ""
                  }`}
                  onClick={() => setViewFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterMatrix}>
            <div className={styles.filterSection}>
              <span className={styles.toolbarLabel}>Qualification</span>
              <div className={styles.filterChipRow}>
                <button
                  type="button"
                  className={`${styles.filterChip} ${
                    qualificationFilter === "all" ? styles.filterChipActive : ""
                  }`}
                  onClick={() => setQualificationFilter("all")}
                >
                  Toutes
                </button>
                {(Object.entries(QUALIFICATION_META) as Array<
                  [QualificationKey, { label: string }]
                >).map(([value, meta]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.filterChip} ${
                      qualificationFilter === value ? styles.filterChipActive : ""
                    }`}
                    onClick={() => setQualificationFilter(value)}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.filterSection}>
              <span className={styles.toolbarLabel}>Provenance</span>
              <div className={styles.filterChipRow}>
                {ORIGIN_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.filterChip} ${
                      originFilter === option.value ? styles.filterChipActive : ""
                    }`}
                    onClick={() => setOriginFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.filterSection}>
              <span className={styles.toolbarLabel}>Plateforme</span>
              <div className={styles.filterChipRow}>
                <button
                  type="button"
                  className={`${styles.filterChip} ${
                    platformFilter === "all" ? styles.filterChipActive : ""
                  }`}
                  onClick={() => setPlatformFilter("all")}
                >
                  Toutes
                </button>
                {(Object.entries(PLATFORM_META) as Array<
                  [ProspectConversation["channel"], { label: string }]
                >).map(([value, meta]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.filterChip} ${
                      platformFilter === value ? styles.filterChipActive : ""
                    }`}
                    onClick={() => setPlatformFilter(value)}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeFilterLabels.length > 0 && (
            <div className={styles.activeFiltersRow}>
              <div className={styles.activeFiltersList}>
                {activeFilterLabels.map((label) => (
                  <span key={label} className={styles.activeFilterPill}>
                    {label}
                  </span>
                ))}
              </div>

              <button
                type="button"
                className={styles.resetButton}
                onClick={resetFilters}
              >
                Réinitialiser
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className={styles.emptyState}>
            <div className={styles.spinner} />
            <p className={styles.emptyStateTitle}>Chargement du CRM…</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>CRM</div>
            <p className={styles.emptyStateTitle}>
              {leads.length === 0
                ? "Aucune conversation CRM pour le moment"
                : "Aucun résultat pour ces filtres"}
            </p>
            <p className={styles.emptyStateText}>
              {leads.length === 0
                ? "Dès qu’une conversation existe sur un de vos agents, elle remonte automatiquement ici."
                : "Essayez d’élargir la recherche ou de réinitialiser les filtres pour retrouver vos leads."}
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                if (leads.length === 0) {
                  navigate("/app/conversations");
                  return;
                }
                resetFilters();
              }}
            >
              {leads.length === 0
                ? "Ouvrir les conversations"
                : "Réinitialiser les filtres"}
            </button>
          </div>
        ) : (
          <div className={styles.leadGrid}>
            {filteredLeads.map((lead) => {
              const qualificationMeta = QUALIFICATION_META[lead.qualificationKey];
              const platform = PLATFORM_META[lead.channel];

              return (
                <article key={lead.id} className={styles.leadCard}>
                  <div className={styles.leadHeader}>
                    <div className={styles.leadIdentity}>
                      <div className={styles.identityTop}>
                        <h2 className={styles.leadName}>{lead.name}</h2>
                        <span className={styles.platformBadge}>
                          <img
                            src={platform.icon}
                            alt={platform.label}
                            className={styles.platformIcon}
                          />
                          {platform.label}
                        </span>
                      </div>

                      <div className={styles.identityMeta}>
                        {lead.handle && <span>@{lead.handle}</span>}
                        {lead.phone && <span>{lead.phone}</span>}
                        {lead.email && <span>{lead.email}</span>}
                      </div>
                    </div>

                    <span
                      className={`${styles.badge} ${qualificationMeta.className}`}
                    >
                      {qualificationMeta.label}
                    </span>
                  </div>

                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Provenance</span>
                      <strong>{lead.originLabel}</strong>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Réponse</span>
                      <strong>
                        {lead.hasReply
                          ? "Le prospect a répondu"
                          : "En attente de réponse"}
                      </strong>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Activité</span>
                      <strong>{formatRelativeTime(lead.lastActivity)}</strong>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Suivi</span>
                      <strong>
                        {lead.unreadCount > 0
                          ? `${lead.unreadCount} non lu${
                              lead.unreadCount > 1 ? "s" : ""
                            }`
                          : `${lead.messageCount} message${
                              lead.messageCount > 1 ? "s" : ""
                            }`}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.contentGrid}>
                    <div className={styles.noteBlock}>
                      <span className={styles.noteLabel}>Résumé CRM</span>
                      <p className={styles.noteText}>
                        {lead.note || "Aucune note disponible pour le moment."}
                      </p>
                    </div>

                    <div className={styles.messageBlock}>
                      <span className={styles.noteLabel}>Dernier message</span>
                      <p className={styles.messageText}>
                        {lead.lastMessage ||
                          "Aucun message visible pour l’instant."}
                      </p>
                    </div>
                  </div>

                  <div className={styles.leadFooter}>
                    <div className={styles.footerMeta}>
                      <span
                        className={
                          lead.needsAttention
                            ? styles.attentionPill
                            : styles.okPill
                        }
                      >
                        {lead.needsAttention ? "À traiter" : "Suivi OK"}
                      </span>
                      {lead.unreadCount > 0 && (
                        <span className={styles.unreadPill}>
                          {lead.unreadCount} non lu
                          {lead.unreadCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => openConversation(lead.conversationId)}
                    >
                      Voir la conversation
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showImportModal && (
        <CrmImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            void refetchContacts();
            queryClient.invalidateQueries({ queryKey: ["crm", "contacts"] });
          }}
        />
      )}
    </AppLayout>
  );
};

export default Crm;
