"use client";

import Link from "next/link";
import { useState } from "react";

// Minimal CSV parser (handles quoted fields + commas). No dependency.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch !== "\r") cell += ch;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Map common header names to our fields.
const FIELDS = ["fullName", "email", "title", "phone", "category", "aum", "notes"];
function guessField(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (/(fullname|name|contact)/.test(h)) return "fullName";
  if (/email/.test(h)) return "email";
  if (/(title|role|position)/.test(h)) return "title";
  if (/(phone|tel|mobile)/.test(h)) return "phone";
  if (/(category|type)/.test(h)) return "category";
  if (/aum|assets/.test(h)) return "aum";
  if (/(note|comment)/.test(h)) return "notes";
  return "";
}

export default function CrmImportExport() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (file: File) => {
    setError(""); setResult(null);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { setError("That file has no data rows."); return; }
    const hdr = rows[0];
    setHeaders(hdr);
    setDataRows(rows.slice(1));
    const m: Record<number, string> = {};
    hdr.forEach((h, i) => { m[i] = guessField(h); });
    setMapping(m);
  };

  const doImport = async () => {
    setBusy(true); setError("");
    try {
      const rows = dataRows.map((r) => {
        const obj: Record<string, string> = {};
        Object.entries(mapping).forEach(([idx, field]) => { if (field) obj[field] = (r[Number(idx)] ?? "").trim(); });
        return obj;
      });
      const res = await fetch("/api/crm/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Import failed.");
      setResult({ imported: d.imported, skipped: d.skipped });
      setHeaders([]); setDataRows([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); }
  };

  const doExport = async () => {
    const res = await fetch("/api/crm?entity=contacts");
    const d = await res.json();
    const contacts = d.contacts ?? [];
    const cols = ["fullName", "title", "email", "phone", "category", "stage", "aum", "notes"];
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...contacts.map((c: Record<string, string>) => cols.map((k) => esc(c[k])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "crm-contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Link href="/crm" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">← Back to CRM</Link>

      {/* Export */}
      <div className="rounded-2xl border border-app bg-surface p-5">
        <h3 className="font-semibold text-app">Export contacts</h3>
        <p className="mt-1 text-sm text-muted">Download every contact as a CSV.</p>
        <button onClick={doExport} className="mt-3 rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover">⤓ Download CSV</button>
      </div>

      {/* Import */}
      <div className="rounded-2xl border border-app bg-surface p-5">
        <h3 className="font-semibold text-app">Import contacts</h3>
        <p className="mt-1 text-sm text-muted">Upload a CSV. We auto-match columns and skip duplicate emails.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="mt-3 block text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-app file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-medium file:text-app" />

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        {result && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">✓ Imported {result.imported} contacts. Skipped {result.skipped} (blank or duplicate).</p>}

        {headers.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-app">Match your columns ({dataRows.length} rows)</p>
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm text-muted">{h || `Column ${i + 1}`}</span>
                  <span className="text-faint">→</span>
                  <select value={mapping[i] ?? ""} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })} className="rounded-lg border border-app bg-surface-2 px-2 py-1 text-sm text-app focus:outline-none">
                    <option value="">— skip —</option>
                    {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={doImport} disabled={busy} className="mt-4 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy ? "Importing…" : `Import ${dataRows.length} contacts`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
