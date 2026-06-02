"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, UploadCloud, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal } from "@/components/Modal";
import { normalizeIsraeliPhone } from "@/lib/phone";

/**
 * R159 — import a guest list from an Excel / CSV file.
 *
 * The owner asked for "instead of adding guests one by one, import an
 * Excel file that syncs into the system". This modal:
 *   1. Reads .xlsx / .xls / .csv (SheetJS, loaded lazily so it never
 *      bloats the main bundle).
 *   2. Auto-detects the name + phone columns by Hebrew/English header
 *      keywords, falling back to content heuristics when there's no
 *      header row.
 *   3. Shows a preview + new/duplicate counts (deduped against the
 *      existing list AND within the file itself) so the host confirms
 *      before anything is added.
 *   4. Hands the final, deduped rows back to the page, which adds them
 *      through the normal addGuest path (so cloud-sync etc. just work).
 */

interface ParsedRow {
  name: string;
  phone: string;
  /** true when this row collides with an existing guest or an earlier file row. */
  duplicate: boolean;
}

const NAME_KEYS = ["שם", "מוזמן", "אורח", "name", "contact", "full"];
const PHONE_KEYS = [
  "טלפון",
  "נייד",
  "פלאפון",
  "פלאפ",
  "וואטסאפ",
  "ווצאפ",
  "מספר",
  "phone",
  "mobile",
  "tel",
  "cell",
  "whatsapp",
];

function headerMatch(cell: unknown, keys: string[]): boolean {
  const s = String(cell ?? "").toLowerCase().trim();
  if (!s) return false;
  return keys.some((k) => s.includes(k));
}

function looksLikePhone(v: unknown): boolean {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Excel commonly stores a phone as a number, dropping the leading 0
 *  ("0501234567" → 501234567). Restore it for Israeli mobiles/landlines. */
function repairPhone(raw: string): string {
  const t = raw.trim();
  if (/^\d{9}$/.test(t) && /^[5-9]/.test(t)) return `0${t}`;
  return t;
}

function canonical(phone: string): string | null {
  const norm = normalizeIsraeliPhone(phone);
  return norm.valid ? norm.phone : null;
}

export function ImportSpreadsheetModal({
  existingGuests,
  onClose,
  onConfirm,
}: {
  existingGuests: Array<{ phone: string }>;
  onClose: () => void;
  onConfirm: (rows: Array<{ name: string; phone: string }>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "parsing" | "preview">("pick");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);

  const newRows = rows.filter((r) => !r.duplicate);
  const dupCount = rows.length - newRows.length;

  const handleFile = async (file: File) => {
    setError(null);
    setPhase("parsing");
    setFileName(file.name);
    try {
      // Lazy-load SheetJS — keeps it out of the main bundle.
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        setError("הקובץ ריק או לא נתמך.");
        setPhase("pick");
        return;
      }
      const matrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        blankrows: false,
        defval: "",
        raw: false,
      }) as unknown[][];

      const data = matrix.filter((r) =>
        r.some((c) => String(c ?? "").trim() !== ""),
      );
      if (data.length === 0) {
        setError("לא נמצאו שורות בקובץ.");
        setPhase("pick");
        return;
      }

      // Detect columns.
      const header = data[0] ?? [];
      let nameCol = header.findIndex((c) => headerMatch(c, NAME_KEYS));
      let phoneCol = header.findIndex((c) => headerMatch(c, PHONE_KEYS));
      const hasHeader = nameCol >= 0 || phoneCol >= 0;
      const body = hasHeader ? data.slice(1) : data;

      const colCount = Math.max(...data.map((r) => r.length), 1);
      if (phoneCol < 0) {
        // Pick the column with the most phone-like values.
        let best = -1;
        let bestScore = 0;
        for (let c = 0; c < colCount; c++) {
          const score = body.filter((r) => looksLikePhone(r[c])).length;
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        phoneCol = bestScore > 0 ? best : -1;
      }
      if (nameCol < 0) {
        // First text column that isn't the phone column.
        let best = -1;
        let bestScore = 0;
        for (let c = 0; c < colCount; c++) {
          if (c === phoneCol) continue;
          const score = body.filter(
            (r) => String(r[c] ?? "").trim() !== "" && !looksLikePhone(r[c]),
          ).length;
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        nameCol = best >= 0 ? best : phoneCol === 0 ? 1 : 0;
      }

      // Build + dedup.
      const existing = new Set(
        existingGuests
          .map((g) => canonical(g.phone))
          .filter((p): p is string => p !== null),
      );
      const seen = new Set<string>();
      const parsed: ParsedRow[] = [];
      for (const r of body) {
        const name = String(r[nameCol] ?? "").trim();
        if (!name) continue;
        const phone =
          phoneCol >= 0 ? repairPhone(String(r[phoneCol] ?? "")) : "";
        const key = canonical(phone);
        const duplicate = !!key && (existing.has(key) || seen.has(key));
        if (key) seen.add(key);
        parsed.push({ name, phone, duplicate });
      }

      if (parsed.length === 0) {
        setError("לא זוהו שמות בקובץ. ודאו שיש עמודת שם.");
        setPhase("pick");
        return;
      }
      setRows(parsed);
      setPhase("preview");
    } catch (e) {
      console.error("[ImportSpreadsheet] parse failed", e);
      setError("קריאת הקובץ נכשלה. נסו לשמור כ-CSV או אקסל תקני.");
      setPhase("pick");
    }
  };

  return (
    <Modal onClose={onClose} title="ייבוא מאקסל / CSV" maxWidthClass="max-w-lg">
      {phase === "pick" && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-2xl py-10 px-5 flex flex-col items-center gap-3 transition hover:bg-white/5"
            style={{
              border: "1.5px dashed var(--border-gold)",
              background: "var(--input-bg)",
            }}
          >
            <UploadCloud size={34} style={{ color: "var(--accent)" }} aria-hidden />
            <span className="font-bold">בחרו קובץ אקסל או CSV</span>
            <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
              ‎.xlsx · .xls · .csv — נזהה אוטומטית את עמודות השם והטלפון
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          {error && (
            <div
              className="mt-4 rounded-xl px-3 py-2.5 text-sm flex items-center gap-2"
              style={{
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "rgb(252,165,165)",
              }}
            >
              <AlertCircle size={16} className="shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
          <p
            className="mt-4 text-[11px] leading-relaxed"
            style={{ color: "var(--foreground-muted)" }}
          >
            טיפ: הכותרות יכולות להיות בעברית (שם, טלפון) או באנגלית
            (name, phone). אם אין כותרות — נזהה לפי התוכן.
          </p>
        </div>
      )}

      {phase === "parsing" && (
        <div className="py-12 flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent)" }} aria-hidden />
          <span className="text-sm" style={{ color: "var(--foreground-soft)" }}>
            קורא את {fileName}…
          </span>
        </div>
      )}

      {phase === "preview" && (
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm">
            <FileSpreadsheet size={16} style={{ color: "var(--accent)" }} aria-hidden />
            <span className="font-semibold truncate">{fileName}</span>
          </div>

          <div className="flex gap-2 mb-3">
            <Stat label="חדשים" value={newRows.length} highlight />
            <Stat label="כפולים (יידלגו)" value={dupCount} />
            <Stat label="סה״כ בקובץ" value={rows.length} />
          </div>

          <div
            className="rounded-xl overflow-hidden mb-4"
            style={{ border: "1px solid var(--border)" }}
          >
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--input-bg)" }}>
                    <th className="text-start px-3 py-2 font-semibold">שם</th>
                    <th className="text-start px-3 py-2 font-semibold">טלפון</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((r, i) => (
                    <tr
                      key={i}
                      style={{
                        borderTop: "1px solid var(--border)",
                        opacity: r.duplicate ? 0.45 : 1,
                      }}
                    >
                      <td className="px-3 py-1.5 truncate max-w-[180px]">
                        {r.name}
                        {r.duplicate && (
                          <span
                            className="ms-2 text-[10px]"
                            style={{ color: "var(--foreground-muted)" }}
                          >
                            כפול
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 ltr-num" style={{ color: "var(--foreground-soft)" }}>
                        {r.phone || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 60 && (
              <div
                className="px-3 py-2 text-[11px] text-center"
                style={{ background: "var(--input-bg)", color: "var(--foreground-muted)" }}
              >
                …ועוד {rows.length - 60} שורות
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPhase("pick");
                setRows([]);
              }}
              className="btn-secondary flex-1"
            >
              קובץ אחר
            </button>
            <button
              type="button"
              disabled={newRows.length === 0}
              onClick={() =>
                onConfirm(newRows.map((r) => ({ name: r.name, phone: r.phone })))
              }
              className="btn-gold flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 size={16} aria-hidden />
              ייבוא {newRows.length} מוזמנים
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex-1 rounded-xl px-3 py-2.5 text-center"
      style={{
        background: highlight
          ? "color-mix(in srgb, var(--gold-100) 12%, var(--input-bg))"
          : "var(--input-bg)",
        border: `1px solid ${highlight ? "var(--border-gold)" : "var(--border)"}`,
      }}
    >
      <div
        className="text-xl font-extrabold ltr-num"
        style={{ color: highlight ? "var(--accent)" : "var(--foreground)" }}
      >
        {value}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
    </div>
  );
}
