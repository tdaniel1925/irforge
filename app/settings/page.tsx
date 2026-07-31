"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import InlineConfirm from "@/components/InlineConfirm";
import type { Notice } from "@/components/ui";
import type { Company } from "@/lib/types";
import Term from "@/components/Term";
import SocialConnections from "@/components/settings/SocialConnections";

export default function SettingsPage() {
  const { db, error, busy, act } = useAppState();
  const [form, setForm] = useState<Company | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (db && !form) setForm(db.company);
  }, [db, form]);

  // Warn before leaving with unsaved edits (covers tab close / hard nav).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (error) return <ErrorBanner message={error} />;
  if (!db || !form) return <LoadingState />;

  // Company-wide settings are admin-only (compliance disclosure text, ticker, quiet
  // mode). Members get a read-only view. `role` is absent in demo mode → treat as admin.
  const isAdmin = (db as { role?: string }).role !== "member";

  const set = <K extends keyof Company>(key: K, value: Company[K]) => { setForm({ ...form, [key]: value }); setDirty(true); };

  // Inline validation (no toasts) — returns an error string or "" when valid.
  const validate = (f: Company): string => {
    if (f.ticker && !/^[A-Z.]{1,8}$/.test(f.ticker)) return "Ticker should be 1–8 letters (e.g. AMFN).";
    if (f.cik && !/^\d{1,10}$/.test(f.cik)) return "SEC CIK should be digits only (no letters).";
    if (f.xHandle && !/^@?[A-Za-z0-9_]{1,15}$/.test(f.xHandle)) return "X handle should be letters, numbers, or underscores (max 15).";
    return "";
  };

  const save = async () => {
    setNotice(null);
    const vErr = validate(form);
    if (vErr) { setNotice({ text: vErr, tone: "error" }); return; }
    const err = await act("/api/company", "PUT", form);
    if (!err) setDirty(false);
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

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Company profile, compliance language, and publishing controls." />
      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          You&apos;re a team member — these company settings are view-only. Ask a company admin to make changes.
        </div>
      )}
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <Card className={`mb-6 ${db.company.quietMode ? "border-red-500/40" : "border-emerald-500/20"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-app"><Term id="quiet-period">Quiet mode</Term></h2>
            <p className="mt-1 text-sm text-muted">
              One switch suspends ALL publishing — use before earnings, financings, or any <Term id="material">material</Term> announcement window.
            </p>
          </div>
          <Button variant={db.company.quietMode ? "danger" : "secondary"} onClick={toggleQuiet} disabled={busy || !isAdmin} title={!isAdmin ? "Admins only" : undefined}>
            {db.company.quietMode ? "⏸ ON — tap to lift" : "Enable quiet mode"}
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-app">Company profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" value={form.name} onChange={(v) => set("name", v)} disabled={!isAdmin} />
          <Field label="Ticker" value={form.ticker} onChange={(v) => set("ticker", v.toUpperCase())} disabled={!isAdmin} />
          <Field label="Exchange" value={form.exchange} onChange={(v) => set("exchange", v)} disabled={!isAdmin} />
          <Field label="SEC CIK (for EDGAR sync)" value={form.cik} onChange={(v) => set("cik", v)} disabled={!isAdmin} />
          <Field label="X handle" value={form.xHandle} onChange={(v) => set("xHandle", v)} disabled={!isAdmin} />
          <Field label="Sector" value={form.sector} onChange={(v) => set("sector", v)} disabled={!isAdmin} />
          <Field label="Approver name" value={form.approverName} onChange={(v) => set("approverName", v)} disabled={!isAdmin} />
          <Field label="Approver title" value={form.approverTitle} onChange={(v) => set("approverTitle", v)} disabled={!isAdmin} />
        </div>
        <div className="mt-4">
          <Field label="Brand colors (used by AI image generation — e.g. “navy blue and red”)" value={form.brandColors ?? ""} onChange={(v) => set("brandColors", v)} disabled={!isAdmin} />
        </div>
        <div className="mt-4">
          <Label text="Company description (used by AI drafting — public facts only)" />
          <textarea
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            disabled={!isAdmin}
            rows={3}
            className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none disabled:opacity-60"
          />
        </div>
        <div className="mt-4">
          <Label text="Peer tickers for 13F targeting (comma-separated)" />
          <input
            value={form.peers.join(", ")}
            onChange={(e) => set("peers", e.target.value.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean))}
            disabled={!isAdmin}
            className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none disabled:opacity-60"
          />
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 font-semibold text-app">Mandatory disclosure language</h2>
        <p className="mb-4 text-xs text-faint">
          Appended to every published post automatically. The publish path physically cannot skip these.
        </p>
        <label className="mb-1 block text-xs font-medium text-muted"><Term id="section-17b">Section 17(b)</Term> service-provider disclosure</label>
        <textarea
          value={form.disclosureText}
          onChange={(e) => set("disclosureText", e.target.value)}
          disabled={!isAdmin}
          rows={3}
          className="mb-4 w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none disabled:opacity-60"
        />
        <label className="mb-1 block text-xs font-medium text-muted"><Term id="fls">Forward-looking statements</Term> notice</label>
        <textarea
          value={form.flsText}
          onChange={(e) => set("flsText", e.target.value)}
          disabled={!isAdmin}
          rows={2}
          className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none disabled:opacity-60"
        />
      </Card>

      {/* Disclosures are compliance content — admin-only, like the rest of settings. */}
      {isAdmin && <AddDisclosure onDone={(msg) => setNotice({ text: msg, tone: "success" })} />}

      <NotificationsSection
        initial={db.company.boardNotifyEmails ?? []}
        isAdmin={isAdmin}
        ownerHint={form.approverName || ""}
        onSaved={(msg, ok) => setNotice({ text: msg, tone: ok ? "success" : "error" })}
      />

      <SocialConnections />

      <TeamSection />

      <div className="flex items-center justify-between">
        <Button onClick={save} disabled={busy || !isAdmin} title={!isAdmin ? "Admins only" : undefined}>
          {dirty ? "Save settings •" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

// Team management — invite and manage the people on this company account.
// Lives here in Settings so admins find it where they expect. The full roster +
// invite form is the /team page (works for any company admin, not just platform
// super-admins — it is intentionally NOT under the /admin super-admin wall).
// Who gets emailed when an investor posts a question to the company's discussion
// board (immediate) and in the daily digest. Empty list = the owner's account email.
function NotificationsSection({ initial, isAdmin, ownerHint, onSaved }: { initial: string[]; isAdmin: boolean; ownerHint: string; onSaved: (msg: string, ok: boolean) => void }) {
  const [emails, setEmails] = useState<string[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  const add = () => {
    const e = input.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { onSaved("Enter a valid email address.", false); return; }
    if (emails.includes(e)) { setInput(""); return; }
    setEmails([...emails, e]); setInput("");
  };
  const remove = (e: string) => setEmails(emails.filter((x) => x !== e));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boardNotifyEmails: emails }) });
      if (!res.ok) { onSaved((await res.json().catch(() => ({}))).error ?? "Couldn't save notification settings.", false); return; }
      onSaved(emails.length ? "Notification recipients saved." : "Cleared — notifications will go to the account owner.", true);
    } catch { onSaved("Network error — couldn't save.", false); }
    finally { setBusy(false); }
  };

  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-app">Board notifications</h2>
      <p className="mb-3 mt-1 text-sm text-muted">
        Who gets emailed when an investor posts a question to your public discussion board — immediately, plus a daily digest of activity.
        {emails.length === 0 && <> Right now these go to the account owner{ownerHint ? ` (${ownerHint})` : ""}.</>}
      </p>

      {emails.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {emails.map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-surface-2 px-2.5 py-1 text-sm text-app">
              {e}
              {isAdmin && <button onClick={() => remove(e)} className="text-faint hover:text-red-500" aria-label={`Remove ${e}`}>✕</button>}
            </span>
          ))}
        </div>
      )}

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="ir@yourcompany.com"
            className="min-w-[220px] flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
          />
          <Button variant="secondary" onClick={add} disabled={!input.trim()}>Add</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save recipients"}</Button>
        </div>
      ) : (
        <p className="text-xs text-faint">Only company admins can change notification recipients.</p>
      )}
    </Card>
  );
}

function TeamSection() {
  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-app">Your team</h2>
      <p className="mb-3 mt-1 text-sm text-muted">
        Invite colleagues to this company account. Everyone shares the dashboard; each person gets their own private workspace.
        Admins can approve posts and manage settings; members can draft and collaborate.
      </p>
      <Link href="/team" className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
        Manage team &amp; invite people →
      </Link>
    </Card>
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

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <Label text={label} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
