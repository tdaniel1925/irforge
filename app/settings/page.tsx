"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { Company } from "@/lib/types";

export default function SettingsPage() {
  const { db, error, busy, act } = useAppState();
  const [form, setForm] = useState<Company | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (db && !form) setForm(db.company);
  }, [db, form]);

  if (error) return <ErrorBanner message={error} />;
  if (!db || !form) return <LoadingState />;

  const set = <K extends keyof Company>(key: K, value: Company[K]) => setForm({ ...form, [key]: value });

  const save = async () => {
    setNotice(null);
    const err = await act("/api/company", "PUT", form);
    setNotice(err ? { text: err, tone: "error" } : { text: "Settings saved.", tone: "success" });
  };

  const toggleQuiet = async () => {
    setNotice(null);
    const next = !db.company.quietMode;
    const err = await act("/api/company", "PUT", { quietMode: next });
    if (!err) setForm({ ...form, quietMode: next });
    setNotice(
      err
        ? { text: err, tone: "error" }
        : { text: next ? "Quiet mode is ON — nothing will publish until you turn it off." : "Quiet mode is OFF — publishing works again.", tone: "success" }
    );
  };

  const reset = async () => {
    if (!confirm("This wipes all demo data. Continue?")) return;
    const err = await act("/api/reset", "POST");
    setForm(null);
    setNotice(err ? { text: err, tone: "error" } : { text: "Demo data restored to its original state.", tone: "success" });
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Company profile, compliance language, and publishing controls." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <Card className={`mb-6 ${db.company.quietMode ? "border-red-500/40" : "border-emerald-500/20"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-app">Quiet mode</h2>
            <p className="mt-1 text-sm text-muted">
              One switch suspends ALL publishing — use before earnings, financings, or any material announcement window.
            </p>
          </div>
          <Button variant={db.company.quietMode ? "danger" : "secondary"} onClick={toggleQuiet} disabled={busy}>
            {db.company.quietMode ? "⏸ ON — tap to lift" : "Enable quiet mode"}
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-app">Company profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" value={form.name} onChange={(v) => set("name", v)} />
          <Field label="Ticker" value={form.ticker} onChange={(v) => set("ticker", v.toUpperCase())} />
          <Field label="Exchange" value={form.exchange} onChange={(v) => set("exchange", v)} />
          <Field label="SEC CIK (for EDGAR sync)" value={form.cik} onChange={(v) => set("cik", v)} />
          <Field label="X handle" value={form.xHandle} onChange={(v) => set("xHandle", v)} />
          <Field label="Sector" value={form.sector} onChange={(v) => set("sector", v)} />
          <Field label="Approver name" value={form.approverName} onChange={(v) => set("approverName", v)} />
          <Field label="Approver title" value={form.approverTitle} onChange={(v) => set("approverTitle", v)} />
        </div>
        <div className="mt-4">
          <Label text="Company description (used by AI drafting — public facts only)" />
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="mt-4">
          <Label text="Peer tickers for 13F targeting (comma-separated)" />
          <input
            value={form.peers.join(", ")}
            onChange={(e) => set("peers", e.target.value.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean))}
            className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 font-semibold text-app">Mandatory disclosure language</h2>
        <p className="mb-4 text-xs text-faint">
          Appended to every published post automatically. The publish path physically cannot skip these.
        </p>
        <Label text="Section 17(b) service-provider disclosure" />
        <textarea
          value={form.disclosureText}
          onChange={(e) => set("disclosureText", e.target.value)}
          rows={3}
          className="mb-4 w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
        <Label text="Forward-looking statements notice" />
        <textarea
          value={form.flsText}
          onChange={(e) => set("flsText", e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
      </Card>

      <AddDisclosure onDone={(msg) => setNotice({ text: msg, tone: "success" })} />

      <SocialConnections />

      <Card className="mb-6">
        <h2 className="mb-2 font-semibold text-app">Integration status</h2>
        <div className="space-y-2 text-sm text-muted">
          <p>
            <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${db.hasAyrshare ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-2 text-faint"}`}>
              {db.hasAyrshare ? "LIVE" : "SIMULATED"}
            </span>
            X (Twitter) posting via Ayrshare —{" "}
            {db.hasAyrshare
              ? "publishing a draft posts it to your connected X account, for real."
              : "no AYRSHARE_API_KEY set; publishing marks posts as posted locally only."}
          </p>
          <p>
            <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${db.hasAi ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-2 text-faint"}`}>
              {db.hasAi ? "LIVE" : "TEMPLATE"}
            </span>
            Claude AI drafting —{" "}
            {db.hasAi ? "ANTHROPIC_API_KEY detected (verify it's valid — invalid keys silently fall back to templates)." : "set ANTHROPIC_API_KEY in .env.local for AI-written drafts; templates otherwise."}
          </p>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button onClick={save} disabled={busy}>
          Save settings
        </Button>
        <Button variant="danger" onClick={reset} disabled={busy} title="Restores the original demo data">
          Reset demo data
        </Button>
      </div>
    </div>
  );
}

function AddDisclosure({ onDone }: { onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState("8-K");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/filings/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, title, url, text, date }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error ?? "Failed.");
      else {
        onDone(`Added "${title}". It's ready to turn into a post in the Do queue, and now shows on your public page.`);
        setOpen(false);
        setTitle(""); setUrl(""); setText(""); setDate("");
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6 border-sky-500/20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-app">Add a disclosure</h2>
          <p className="mt-1 text-sm text-muted">
            We pull SEC filings automatically. For OTC, SEDAR, or anything not on EDGAR, add it here — paste the text or link it,
            and it flows into your posts, AI answers, and public page like any other filing.
          </p>
        </div>
        {!open && <Button variant="secondary" onClick={() => setOpen(true)}>+ Add</Button>}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label text="Type" />
              <input value={form} onChange={(e) => setForm(e.target.value)} placeholder="8-K, news, MD&A…" className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
            </div>
            <div className="sm:col-span-2">
              <Label text="Title" />
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q2 Operations Update" className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <Label text="Link to the disclosure (we'll fetch & read it) — or leave blank and paste below" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          </div>
          <div>
            <Label text="Or paste the disclosure text" />
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste the announcement…" className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="w-48">
            <Label text="Date (optional)" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add disclosure"}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Label({ text }: { text: string }) {
  return <label className="mb-1 block text-xs font-medium text-muted">{text}</label>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label text={label} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
      />
    </div>
  );
}

// All networks PubcoZone can publish to (via Ayrshare). Labels for the status grid.
const SOCIAL_NETWORKS: { key: string; label: string; icon: string }[] = [
  { key: "twitter", label: "X (Twitter)", icon: "𝕏" },
  { key: "linkedin", label: "LinkedIn", icon: "in" },
  { key: "facebook", label: "Facebook", icon: "f" },
  { key: "instagram", label: "Instagram", icon: "◎" },
  { key: "youtube", label: "YouTube", icon: "▶" },
  { key: "tiktok", label: "TikTok", icon: "♪" },
  { key: "telegram", label: "Telegram", icon: "✈" },
  { key: "reddit", label: "Reddit", icon: "r/" },
];

function SocialConnections() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<{ configured: boolean; multiTenant: boolean; hasProfile?: boolean; accounts: string[] }>({
    configured: false,
    multiTenant: false,
    accounts: [],
  });

  const load = async () => {
    try {
      const res = await fetch("/api/social/connect");
      const d = await res.json();
      setStatus(d);
    } catch {
      /* leave defaults */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const connect = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/social/connect", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't open the connect page.");
      // Navigate the current tab — a post-await window.open() gets popup-blocked.
      // Ayrshare's connect page is a full-page flow and returns the user back after.
      if (d.url) { window.location.href = d.url; return; }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  };

  const connected = new Set((status.accounts ?? []).map((a) => a.toLowerCase()));

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-app">Your social accounts</h2>
          <p className="mt-1 text-sm text-muted">
            Connect the accounts you want approved posts to publish to. Posts only go out after you approve them — and your
            disclosures are always attached.
          </p>
        </div>
        {status.multiTenant && (
          <Button onClick={connect} disabled={busy}>
            {busy ? "Opening…" : connected.size > 0 ? "Manage connections" : "Connect accounts"}
          </Button>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

      {!status.configured ? (
        <p className="mt-4 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-muted">
          Publishing isn&apos;t configured on this deployment yet. Posts you approve are marked as posted but not sent to a
          live network.
        </p>
      ) : !status.multiTenant ? (
        <p className="mt-4 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-muted">
          Posting is live on a shared account. Per-company account linking will appear here once enabled.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SOCIAL_NETWORKS.map((n) => {
            const on = connected.has(n.key);
            return (
              <div
                key={n.key}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-emerald-500/40 bg-emerald-500/5" : "border-app bg-surface-2/40"}`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-app-hover text-xs font-bold text-app">{n.icon}</span>
                <span className="flex-1 text-app">{n.label}</span>
                {loading ? (
                  <span className="text-xs text-faint">…</span>
                ) : on ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓</span>
                ) : (
                  <span className="text-xs text-faint">—</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {status.multiTenant && !loading && connected.size === 0 && (
        <p className="mt-3 text-xs text-faint">No accounts connected yet. Tap &ldquo;Connect accounts&rdquo; to link X, LinkedIn, and more.</p>
      )}
    </Card>
  );
}
