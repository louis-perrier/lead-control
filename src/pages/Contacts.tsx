import {
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
  DragEvent,
  KeyboardEvent,
  PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../layouts";
import supabase from "../lib/supabase";
import styles from "./Contacts.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContactStatus = "new" | "contacted" | "replied" | "booked" | "closed";
type ContactSource =
  | "manual"
  | "csv_import"
  | "scraping"
  | "instagram_likes"
  | "conversation";

type Contact = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone_e164: string | null;
  instagram_handle: string | null;
  instagram_user_id: string | null;
  email: string | null;
  source: ContactSource;
  tags: string[];
  notes: string | null;
  conversation_id: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
};

type CsvParsed = {
  headers: string[];
  rows: string[][];
};

type ColumnMapping = {
  full_name: string;
  phone_e164: string;
  instagram_handle: string;
  email: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ContactStatus,
  { label: string; className: string }
> = {
  new: { label: "Nouveau", className: styles.statusNew },
  contacted: { label: "Contacté", className: styles.statusContacted },
  replied: { label: "A répondu", className: styles.statusReplied },
  booked: { label: "Réservé", className: styles.statusBooked },
  closed: { label: "Clos", className: styles.statusClosed },
};

const SOURCE_LABELS: Record<ContactSource, string> = {
  manual: "Ajout manuel",
  csv_import: "Import CSV",
  scraping: "Scraping",
  instagram_likes: "Likes Instagram",
  conversation: "Conversation",
};

const MAPPED_FIELDS = [
  { key: "full_name", label: "Nom complet" },
  { key: "phone_e164", label: "Téléphone" },
  { key: "instagram_handle", label: "Handle Instagram" },
  { key: "email", label: "Email" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCsv(text: string): CsvParsed {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const first = lines[0];
  const delimiter =
    first.includes(";") && (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length
      ? ";"
      : ",";

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines
    .slice(1)
    .filter((l) => l.trim().length > 0)
    .map(parseRow);
  return { headers, rows };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validatePhone(phone: string): string | null {
  if (!phone) return null;
  if (!/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
    return "Téléphone invalide — format international requis (ex: +33612345678)";
  }
  return null;
}

function validateEmail(email: string): string | null {
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Email invalide";
  }
  return null;
}

async function checkDuplicate(
  instagram_handle?: string,
  phone_e164?: string
): Promise<string | null> {
  const conditions: string[] = [];
  if (instagram_handle) conditions.push(`instagram_handle.eq.${instagram_handle.replace(/^@/, "")}`);
  if (phone_e164) conditions.push(`phone_e164.eq.${phone_e164}`);
  if (conditions.length === 0) return null;

  const { data } = await supabase
    .from("contacts")
    .select("id, instagram_handle, phone_e164")
    .or(conditions.join(","))
    .limit(1);

  if (data && data.length > 0) {
    const existing = data[0];
    if (instagram_handle && existing.instagram_handle === instagram_handle.replace(/^@/, "")) {
      return `Le handle @${instagram_handle.replace(/^@/, "")} existe déjà.`;
    }
    if (phone_e164 && existing.phone_e164 === phone_e164) {
      return `Le numéro ${phone_e164} existe déjà.`;
    }
  }
  return null;
}

function getPlatform(contact: Contact): "instagram" | "whatsapp" | "none" {
  if (contact.instagram_handle || contact.instagram_user_id) return "instagram";
  if (contact.phone_e164) return "whatsapp";
  return "none";
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const StatusBadge: FunctionComponent<{ status: ContactStatus }> = ({
  status,
}) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`${styles.statusBadge} ${cfg.className}`}>
      {cfg.label}
    </span>
  );
};

// ─── PlatformCell ─────────────────────────────────────────────────────────────

const PlatformCell: FunctionComponent<{ contact: Contact }> = ({ contact }) => {
  const platform = getPlatform(contact);
  if (platform === "instagram") {
    return (
      <div className={styles.platformBadge}>
        <img
          src="/logoConnectors/instagram.svg"
          alt="Instagram"
          className={styles.platformIcon}
        />
        <span>{contact.instagram_handle ?? "Instagram"}</span>
      </div>
    );
  }
  if (platform === "whatsapp") {
    return (
      <div className={styles.platformBadge}>
        <img
          src="/logoConnectors/whatsapp.webp"
          alt="WhatsApp"
          className={styles.platformIcon}
        />
        <span>{contact.phone_e164}</span>
      </div>
    );
  }
  return <span className={styles.dateText}>—</span>;
};

// ─── TagsInput ────────────────────────────────────────────────────────────────

const TagsInput: FunctionComponent<{
  tags: string[];
  onChange: (tags: string[]) => void;
}> = ({ tags, onChange }) => {
  const [inputValue, setInputValue] = useState("");

  const addTag = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className={styles.tagsField}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tagChip}>
          {tag}
          <button
            type="button"
            className={styles.tagChipRemove}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Supprimer ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className={styles.tagInput}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputValue.trim()) addTag(inputValue); }}
        placeholder={tags.length === 0 ? "Ajouter un tag…" : ""}
      />
    </div>
  );
};

// ─── AddManualModal ───────────────────────────────────────────────────────────

type ManualForm = {
  full_name: string;
  instagram_handle: string;
  phone_e164: string;
  email: string;
  tags: string[];
  notes: string;
};

const AddManualModal: FunctionComponent<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState<ManualForm>({
    full_name: "",
    instagram_handle: "",
    phone_e164: "",
    email: "",
    tags: [],
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const manualBackdropPointerDownRef = useRef(false);

  const set = (field: keyof ManualForm) => (
    val: string | string[]
  ) => setForm((prev) => ({ ...prev, [field]: val }));
  const handleManualBackdropPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    manualBackdropPointerDownRef.current = event.target === event.currentTarget;
  };
  const handleManualBackdropPointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const shouldClose =
      manualBackdropPointerDownRef.current &&
      event.target === event.currentTarget;
    manualBackdropPointerDownRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };
  const resetManualBackdropPointer = () => {
    manualBackdropPointerDownRef.current = false;
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim()) {
      setError("Le nom complet est requis.");
      return;
    }
    const phoneErr = validatePhone(form.phone_e164);
    if (phoneErr) { setError(phoneErr); return; }
    const emailErr = validateEmail(form.email);
    if (emailErr) { setError(emailErr); return; }
    const dupErr = await checkDuplicate(form.instagram_handle, form.phone_e164);
    if (dupErr) { setError(dupErr); return; }

    setError(null);
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expirée, reconnecte-toi."); setSubmitting(false); return; }
    const { error: dbError } = await supabase.from("contacts").insert({
      user_id: user.id,
      full_name: form.full_name || null,
      instagram_handle: form.instagram_handle
        ? form.instagram_handle.replace(/^@/, "")
        : null,
      phone_e164: form.phone_e164 || null,
      email: form.email || null,
      tags: form.tags,
      notes: form.notes || null,
      source: "manual",
      status: "new",
    });
    setSubmitting(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    onSuccess();
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onPointerDown={handleManualBackdropPointerDown}
      onPointerUp={handleManualBackdropPointerUp}
      onPointerCancel={resetManualBackdropPointer}
      onPointerLeave={resetManualBackdropPointer}
    >
      <div className={`${styles.modal} ${styles.manualModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.manualModalTitleBlock}>
            <h2 className={styles.modalTitle}>Ajouter un prospect</h2>
            <p className={styles.manualModalLead}>
              Crée une fiche propre avec les informations utiles pour le suivi commercial.
            </p>
          </div>
          <button className={styles.modalClose} onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className={`${styles.modalBody} ${styles.manualModalBody}`}>
          <div className={styles.manualFieldsGrid}>
          <div className={`${styles.fieldGroup} ${styles.manualFieldSpanFull}`}>
            <label className={styles.fieldLabel}>Nom complet<span className={styles.fieldRequired}>*</span></label>
            <input
              className={styles.fieldInput}
              value={form.full_name}
              onChange={(e) => set("full_name")(e.target.value)}
              placeholder="Jean Dupont"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Handle Instagram</label>
            <input
              className={styles.fieldInput}
              value={form.instagram_handle}
              onChange={(e) => set("instagram_handle")(e.target.value)}
              placeholder="@username"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Téléphone</label>
            <input
              className={styles.fieldInput}
              value={form.phone_e164}
              onChange={(e) => set("phone_e164")(e.target.value)}
              placeholder="+33612345678"
            />
          </div>

          <div className={`${styles.fieldGroup} ${styles.manualFieldSpanFull}`}>
            <label className={styles.fieldLabel}>Email</label>
            <input
              className={styles.fieldInput}
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              placeholder="jean@exemple.com"
            />
          </div>

          <div className={`${styles.fieldGroup} ${styles.manualFieldSpanFull}`}>
            <label className={styles.fieldLabel}>Tags</label>
            <TagsInput
              tags={form.tags}
              onChange={(tags) => setForm((p) => ({ ...p, tags }))}
            />
          </div>

          <div className={`${styles.fieldGroup} ${styles.manualFieldSpanFull}`}>
            <label className={styles.fieldLabel}>Notes</label>
            <textarea
              className={styles.fieldTextarea}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              placeholder="Notes libres…"
            />
          </div>
          </div>

          {error && <p className={styles.fieldError}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} type="button">
            Annuler
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={submitting}
            type="button"
          >
            {submitting ? "Enregistrement…" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── CsvImportModal ───────────────────────────────────────────────────────────

const CsvImportModal: FunctionComponent<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [csv, setCsv] = useState<CsvParsed | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({
    full_name: "",
    phone_e164: "",
    instagram_handle: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvBackdropPointerDownRef = useRef(false);
  const handleCsvBackdropPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    csvBackdropPointerDownRef.current = event.target === event.currentTarget;
  };
  const handleCsvBackdropPointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const shouldClose =
      csvBackdropPointerDownRef.current &&
      event.target === event.currentTarget;
    csvBackdropPointerDownRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };
  const resetCsvBackdropPointer = () => {
    csvBackdropPointerDownRef.current = false;
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("Seuls les fichiers .csv sont acceptés.");
      return;
    }
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      setCsv(parsed);
      // Auto-detect mapping by header name
      const autoMap: Partial<ColumnMapping> = {};
      parsed.headers.forEach((h) => {
        const lower = h.toLowerCase();
        if (lower.includes("nom") || lower.includes("name") || lower.includes("full")) {
          autoMap.full_name = h;
        } else if (lower.includes("phone") || lower.includes("tel") || lower.includes("mobile")) {
          autoMap.phone_e164 = h;
        } else if (lower.includes("instagram") || lower.includes("handle") || lower.includes("ig")) {
          autoMap.instagram_handle = h;
        } else if (lower.includes("email") || lower.includes("mail")) {
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

  const handleImport = async () => {
    if (!csv) return;
    const rows = csv.rows;
    if (rows.length === 0) {
      setError("Le fichier CSV est vide.");
      return;
    }

    const colIndex = (col: string) => (col ? csv.headers.indexOf(col) : -1);
    const get = (row: string[], col: string) => {
      const idx = colIndex(col);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    type SkippedRow = { line: number; reason: string };
    const records: {
      full_name: string | null;
      instagram_handle: string | null;
      phone_e164: string | null;
      email: string | null;
      tags: string[];
      notes: null;
      source: "csv_import";
      status: "new";
    }[] = [];
    const skipped: SkippedRow[] = [];

    rows.forEach((row, i) => {
      const line = i + 2; // +2 : ligne 1 = headers
      const instagram = get(row, mapping.instagram_handle);
      const phone = get(row, mapping.phone_e164);
      const email = get(row, mapping.email);

      const full_name = get(row, mapping.full_name);
      if (!full_name) {
        skipped.push({ line, reason: "nom complet manquant" });
        return;
      }
      if (!instagram && !phone) {
        skipped.push({ line, reason: "aucun handle ni téléphone" });
        return;
      }
      const phoneErr = validatePhone(phone);
      if (phoneErr) {
        skipped.push({ line, reason: phoneErr });
        return;
      }
      const emailErr = validateEmail(email);
      if (emailErr) {
        skipped.push({ line, reason: emailErr });
        return;
      }
      records.push({
        full_name: full_name || null,
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
        `Aucune ligne valide. ${skipped.length} ligne(s) ignorée(s) : ${skipped.map((s) => `ligne ${s.line} (${s.reason})`).join(", ")}.`
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
    if (dbError) {
      setError(dbError.message);
      return;
    }
    onSuccess();
    onClose();
  };

  const previewRows = csv?.rows.slice(0, 3) ?? [];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onPointerDown={handleCsvBackdropPointerDown}
      onPointerUp={handleCsvBackdropPointerUp}
      onPointerCancel={resetCsvBackdropPointer}
      onPointerLeave={resetCsvBackdropPointer}
    >
        <div
          className={`${styles.modal} ${styles.csvModal}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.modalHeader}>
            <div className={styles.csvModalTitleBlock}>
              <h2 className={styles.modalTitle}>Import CSV</h2>
              <p className={styles.csvModalLead}>
                Charge un fichier propre, mappe les colonnes et valide l’import des prospects.
              </p>
            </div>
            <button className={styles.modalClose} onClick={onClose} type="button">
              ×
            </button>
          </div>

          <div className={`${styles.modalBody} ${styles.csvModalBody}`}>
            {/* Dropzone */}
            <div className={styles.csvSectionCard}>
              <div
                className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={styles.dropzoneIcon}>📂</div>
                <div>Glisse ton fichier CSV ici ou clique pour le sélectionner</div>
                {fileName && <div className={styles.dropzoneName}>📄 {fileName}</div>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>
            </div>

            {/* Column mapping */}
            {csv && (
              <div className={styles.csvSectionCard}>
                <p className={styles.csvSectionTitle}>
                  Correspondance des colonnes
                </p>
                <div className={styles.mappingGrid}>
                <span className={styles.mappingLabel}>Champ LeadControl</span>
                <span />
                <span className={styles.mappingLabel}>Colonne CSV</span>

                {MAPPED_FIELDS.map(({ key, label }) => (
                  <>
                    <span key={`label-${key}`} style={{ fontSize: "var(--fs-14)", color: "var(--app-text-primary)" }}>
                      {label}
                    </span>
                    <span className={styles.mappingArrow} key={`arrow-${key}`}>→</span>
                    <select
                      key={`select-${key}`}
                      className={styles.mappingSelect}
                      value={mapping[key]}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    >
                      <option value="">— ignorer —</option>
                      {csv.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </>
                ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {csv && previewRows.length > 0 && (
              <div className={styles.csvSectionCard}>
                <p className={styles.csvSectionTitle}>
                  Aperçu ({previewRows.length} première{previewRows.length > 1 ? "s" : ""} ligne{previewRows.length > 1 ? "s" : ""})
                </p>
                <div className={styles.csvPreview}>
                <table className={styles.csvPreviewTable}>
                  <thead>
                    <tr>
                      {csv.headers.map((h) => (
                        <th key={h} className={styles.csvPreviewTh}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={styles.csvPreviewTd}>
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

          {error && <p className={styles.fieldError}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
            type="button"
          >
            Annuler
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
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

// ─── ContactDrawer ────────────────────────────────────────────────────────────

const ContactDrawer: FunctionComponent<{
  contact: Contact;
  onClose: () => void;
  onUpdated: () => void;
}> = ({ contact, onClose, onUpdated }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: contact.full_name ?? "",
    instagram_handle: contact.instagram_handle ?? "",
    phone_e164: contact.phone_e164 ?? "",
    email: contact.email ?? "",
    status: contact.status,
    tags: contact.tags ?? [],
    notes: contact.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const drawerBackdropPointerDownRef = useRef(false);
  const handleDrawerBackdropPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    drawerBackdropPointerDownRef.current = event.target === event.currentTarget;
  };
  const handleDrawerBackdropPointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const shouldClose =
      drawerBackdropPointerDownRef.current &&
      event.target === event.currentTarget;
    drawerBackdropPointerDownRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };
  const resetDrawerBackdropPointer = () => {
    drawerBackdropPointerDownRef.current = false;
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("contacts")
      .update({
        full_name: form.full_name || null,
        instagram_handle: form.instagram_handle
          ? form.instagram_handle.replace(/^@/, "")
          : null,
        phone_e164: form.phone_e164 || null,
        email: form.email || null,
        status: form.status,
        tags: form.tags,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdated();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className={styles.drawerBackdrop}
        onPointerDown={handleDrawerBackdropPointerDown}
        onPointerUp={handleDrawerBackdropPointerUp}
        onPointerCancel={resetDrawerBackdropPointer}
        onPointerLeave={resetDrawerBackdropPointer}
      />
      <aside className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>
            {contact.full_name ?? contact.instagram_handle ?? contact.phone_e164 ?? "Contact"}
          </h2>
          <button className={styles.modalClose} onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Informations */}
          <div className={styles.drawerSection}>
            <p className={styles.drawerSectionTitle}>Informations</p>

            <div className={styles.drawerField}>
              <label className={styles.drawerFieldLabel}>Nom complet</label>
              <input
                className={styles.fieldInput}
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="Jean Dupont"
              />
            </div>

            <div className={styles.drawerField}>
              <label className={styles.drawerFieldLabel}>Handle Instagram</label>
              <input
                className={styles.fieldInput}
                value={form.instagram_handle}
                onChange={(e) => setForm((p) => ({ ...p, instagram_handle: e.target.value }))}
                placeholder="@username"
              />
            </div>

            <div className={styles.drawerField}>
              <label className={styles.drawerFieldLabel}>Téléphone</label>
              <input
                className={styles.fieldInput}
                value={form.phone_e164}
                onChange={(e) => setForm((p) => ({ ...p, phone_e164: e.target.value }))}
                placeholder="+33612345678"
              />
            </div>

            <div className={styles.drawerField}>
              <label className={styles.drawerFieldLabel}>Email</label>
              <input
                className={styles.fieldInput}
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="jean@exemple.com"
              />
            </div>
          </div>

          {/* Statut */}
          <div className={styles.drawerSection}>
            <p className={styles.drawerSectionTitle}>Statut & Tags</p>

            <div className={styles.drawerField}>
              <label className={styles.drawerFieldLabel}>Statut</label>
              <select
                className={styles.drawerSelect}
                value={form.status}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status: e.target.value as ContactStatus }))
                }
              >
                {(Object.entries(STATUS_CONFIG) as [ContactStatus, { label: string }][]).map(
                  ([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className={styles.drawerField}>
              <label className={styles.drawerFieldLabel}>Tags</label>
              <TagsInput
                tags={form.tags}
                onChange={(tags) => setForm((p) => ({ ...p, tags }))}
              />
            </div>
          </div>

          {/* Notes */}
          <div className={styles.drawerSection}>
            <p className={styles.drawerSectionTitle}>Notes</p>
            <textarea
              className={styles.fieldTextarea}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notes libres…"
            />
          </div>

          {/* Métadonnées */}
          <div className={styles.drawerSection}>
            <p className={styles.drawerSectionTitle}>Métadonnées</p>

            <div className={styles.drawerField}>
              <span className={styles.drawerFieldLabel}>Source</span>
              <span className={styles.sourceBadge}>
                {SOURCE_LABELS[contact.source]}
              </span>
            </div>

            <div className={styles.drawerField}>
              <span className={styles.drawerFieldLabel}>Ajouté le</span>
              <span className={styles.drawerFieldValue}>
                {formatDate(contact.created_at)}
              </span>
            </div>

            {contact.conversation_id && (
              <div className={styles.drawerField}>
                <span className={styles.drawerFieldLabel}>Conversation liée</span>
                <button
                  type="button"
                  className={styles.conversationLink}
                  onClick={() => navigate("/app/conversations")}
                >
                  Voir la conversation →
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={styles.drawerFooter}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
            type="button"
          >
            Fermer
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saved ? "✓ Enregistré" : saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </aside>
    </>,
    document.body
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const Contacts: FunctionComponent = () => {
  const navigate = useNavigate();

  // ── Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<ContactSource | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<"all" | "instagram" | "whatsapp">("all");

  // ── UI state
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // ── Fetch
  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });
    setIsLoading(false);
    if (!error && data) {
      setContacts(data as Contact[]);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addMenuOpen]);

  // ── Filtered contacts
  const filtered = contacts.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
    if (platformFilter !== "all") {
      const p = getPlatform(c);
      if (p !== platformFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        c.full_name?.toLowerCase().includes(q) ||
        c.instagram_handle?.toLowerCase().includes(q) ||
        c.phone_e164?.includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Update selected contact when list refreshes
  useEffect(() => {
    if (selectedContact) {
      const updated = contacts.find((c) => c.id === selectedContact.id);
      if (updated) setSelectedContact(updated);
    }
  }, [contacts]);

  const handleDeleteContact = async (contact: Contact) => {
    if (deletingContactId) return;

    const contactLabel =
      contact.full_name ?? contact.instagram_handle ?? contact.phone_e164 ?? "ce contact";
    const confirmed = window.confirm(
      `Supprimer ${contactLabel} de la liste ? Cette action est irréversible.`
    );
    if (!confirmed) return;

    setDeletingContactId(contact.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setDeletingContactId(null);
      window.alert("Session expirée. Reconnecte-toi puis réessaie.");
      return;
    }

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contact.id)
      .eq("user_id", user.id);

    setDeletingContactId(null);

    if (error) {
      window.alert("Impossible de supprimer ce contact pour le moment.");
      return;
    }

    setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    if (selectedContact?.id === contact.id) {
      setSelectedContact(null);
    }
  };

  return (
    <AppLayout>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Contacts</h1>
            <p className={styles.subtitle}>Gérez votre base de contacts</p>
          </div>

          <div className={styles.addButtonWrapper} ref={addMenuRef}>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => setAddMenuOpen((prev) => !prev)}
            >
              + Ajouter un contact
              <svg
                className={`${styles.addButtonChevron} ${addMenuOpen ? styles.open : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {addMenuOpen && (
              <div className={styles.addMenu}>
                <button
                  type="button"
                  className={styles.addMenuItem}
                  onClick={() => {
                    setAddMenuOpen(false);
                    setShowManualModal(true);
                  }}
                >
                  <span className={styles.addMenuItemIcon}>✏️</span>
                  Ajout manuel
                </button>
                <button
                  type="button"
                  className={styles.addMenuItem}
                  onClick={() => {
                    setAddMenuOpen(false);
                    setShowCsvModal(true);
                  }}
                >
                  <span className={styles.addMenuItemIcon}>📤</span>
                  Import CSV
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Toolbar */}
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
                placeholder="Rechercher un contact..."
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
                onChange={(e) => setStatusFilter(e.target.value as ContactStatus | "all")}
              >
                <option value="all">Tous les statuts</option>
                {(Object.entries(STATUS_CONFIG) as [ContactStatus, { label: string }][]).map(
                  ([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Source</span>
              <select
                className={styles.filterSelect}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as ContactSource | "all")}
              >
                <option value="all">Toutes les sources</option>
                {(Object.entries(SOURCE_LABELS) as [ContactSource, string][]).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Plateforme</span>
              <select
                className={styles.filterSelect}
                value={platformFilter}
                onChange={(e) =>
                  setPlatformFilter(e.target.value as "all" | "instagram" | "whatsapp")
                }
              >
                <option value="all">Toutes les plateformes</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
          </div>

          <div className={styles.contactCount}>
            <span className={styles.contactCountLabel}>Résultats</span>
            <span className={styles.contactCountValue}>
              {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {/* Table */}
        <div className={styles.tableWrapper}>
          {isLoading ? (
            <div className={`${styles.emptyState} ${styles.emptyStateLoading}`}>
              <div className={`${styles.emptyStateVisual} ${styles.emptyStateLoadingVisual}`}>
                <span className={styles.emptyStateSpinner} />
              </div>
              <p className={styles.emptyStateText}>Chargement…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateVisual}>
                <svg
                  className={styles.emptyStateGlyph}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 20a4 4 0 0 0-8 0" />
                  <circle cx="12" cy="11" r="3.5" />
                  <path d="M5.2 18.2A3.6 3.6 0 0 0 2 22" />
                  <path d="M18.8 18.2A3.6 3.6 0 0 1 22 22" />
                  <path d="M6.5 10.4a2.8 2.8 0 1 1 0-5.6" />
                  <path d="M17.5 10.4a2.8 2.8 0 1 0 0-5.6" />
                </svg>
              </div>
              <p className={styles.emptyStateText}>
                {contacts.length === 0
                  ? "Aucun contact pour le moment"
                  : "Aucun résultat pour ces filtres"}
              </p>
              {contacts.length === 0 && (
                <p className={styles.emptyStateSub}>
                  Ajoute ton premier contact manuellement ou importe un CSV.
                </p>
              )}
              {contacts.length === 0 ? (
                <div className={styles.emptyStateActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => setShowManualModal(true)}
                  >
                    Ajouter un contact
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => setShowCsvModal(true)}
                  >
                    Importer un CSV
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setSourceFilter("all");
                    setPlatformFilter("all");
                  }}
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Nom</th>
                  <th className={styles.th}>Plateforme</th>
                  <th className={styles.th}>Statut</th>
                  <th className={styles.th}>Ajouté le</th>
                  <th className={styles.th}>Tags</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => (
                  <tr key={contact.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.contactName}>
                        {contact.full_name ?? "—"}
                      </div>
                      {contact.email && (
                        <div className={styles.contactHandle}>{contact.email}</div>
                      )}
                    </td>
                    <td className={styles.td}>
                      <PlatformCell contact={contact} />
                    </td>
                    <td className={styles.td}>
                      <StatusBadge status={contact.status} />
                    </td>
                    <td className={styles.td}>
                      <span className={styles.dateText}>
                        {formatDate(contact.created_at)}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {contact.tags && contact.tags.length > 0 ? (
                        <div className={styles.tagList}>
                          {contact.tags.map((tag) => (
                            <span key={tag} className={styles.tagPill}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className={styles.dateText}>—</span>
                      )}
                    </td>
                    <td className={styles.tdActions}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => setSelectedContact(contact)}
                      >
                        Voir
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                        style={{ marginLeft: 8 }}
                        onClick={() => navigate("/app/conversations")}
                      >
                        Démarrer →
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        style={{ marginLeft: 8 }}
                        onClick={() => void handleDeleteContact(contact)}
                        disabled={deletingContactId === contact.id}
                      >
                        {deletingContactId === contact.id ? "Suppression…" : "Supprimer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {showManualModal && (
        <AddManualModal
          onClose={() => setShowManualModal(false)}
          onSuccess={fetchContacts}
        />
      )}
      {showCsvModal && (
        <CsvImportModal
          onClose={() => setShowCsvModal(false)}
          onSuccess={fetchContacts}
        />
      )}

      {/* Drawer */}
      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdated={fetchContacts}
        />
      )}
    </AppLayout>
  );
};

export default Contacts;


