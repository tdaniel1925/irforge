"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import InlineConfirm from "@/components/InlineConfirm";
import type { Notice } from "@/components/ui";
import type { Company } from "@/lib/types";
import Term from "@/components/Term";

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

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Company profile, compliance language, and publishing controls." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <Card className={`mb-6 ${db.company.quietMode ? "border-red-500/40" : "border-emerald-500/20"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-app"><Term id="quiet-period">Quiet mode</Term></h2>
            <p className="mt-1 text-sm text-muted">
              One switch suspends ALL publishing — use before earnings, financings, or any <Term id="material">material</Term> announcement window.
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
        <label className="mb-1 block text-xs font-medium text-muted"><Term id="section-17b">Section 17(b)</Term> service-provider disclosure</label>
        <textarea
          value={form.disclosureText}
          onChange={(e) => set("disclosureText", e.target.value)}
          rows={3}
          className="mb-4 w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
        <label className="mb-1 block text-xs font-medium text-muted"><Term id="fls">Forward-looking statements</Term> notice</label>
        <textarea
          value={form.flsText}
          onChange={(e) => set("flsText", e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
      </Card>

      <AddDisclosure onDone={(msg) => setNotice({ text: msg, tone: "success" })} />

      <SocialConnections />

      <TeamSection />

      <div className="flex items-center justify-between">
        <Button onClick={save} disabled={busy}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

// Team management — invite and manage the people on this company account.
// Lives here in Settings so admins find it where they expect. The full roster +
// invite form is the /admin/team page (works for any company admin, not just
// platform super-admins).
function TeamSection() {
  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-app">Your team</h2>
      <p className="mb-3 mt-1 text-sm text-muted">
        Invite colleagues to this company account. Everyone shares the dashboard; each person gets their own private workspace.
        Admins can approve posts and manage settings; members can draft and collaborate.
      </p>
      <Link href="/admin/team" className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
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

// A connected account's rich detail (matches lib/ayrshare SocialAccount).
interface SocialAccount {
  platform: string;
  accountId: string;
  displayName?: string;
  username?: string;
  profilePicture?: string;
  followersCount?: number;
  isActive: boolean;
  platformStatus?: string;
  tokenExpiresAt?: string;
  tokenValid: boolean;
  canPost: boolean;
}
type TestResult = { ok: boolean; canPost: boolean; tokenValid: boolean; status?: string; needsRefresh?: boolean; missingScopes?: string[]; error?: string; testedAt: number };

function SocialConnections() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [multiTenant, setMultiTenant] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [tests, setTests] = useState<Record<string, TestResult | "running">>({});
  const [noticeJustConnected, setNoticeJustConnected] = useState(false);

  const load = async () => {
    try {
      // status (configured/multiTenant) from the connect endpoint…
      const s = await fetch("/api/social/connect").then((r) => r.json()).catch(() => ({}));
      setConfigured(Boolean(s.configured));
      setMultiTenant(Boolean(s.multiTenant));
      // …and the DETAILED account list (handle/avatar/health) from the new endpoint.
      const a = await fetch("/api/social/accounts").then((r) => r.json()).catch(() => ({ accounts: [] }));
      setAccounts(Array.isArray(a.accounts) ? a.accounts : []);
    } catch {
      /* leave defaults */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // When the connect popup redirects back to /settings?connected=…, auto-refresh so
  // a just-linked account is CONFIRMED immediately (no manual refresh needed).
  // Zernio appends its OWN params on return (e.g. ?connected=linkedin&profileId=…),
  // so match ANY truthy `connected` value — not just "1" — and also clear the extra
  // params Zernio adds. (Matching only "1" is why returns looked like nothing happened.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (!connected) return;

    // Case A: this /settings loaded INSIDE the connect popup (it has an opener).
    // Tell the opener to refresh, then close ourselves so the user lands back on the
    // real settings page with the new account showing — instead of the OAuth return
    // page sitting open in a popup looking like nothing happened.
    if (window.opener && window.opener !== window) {
      try { window.opener.postMessage({ type: "pz:social-connected", platform: connected }, window.location.origin); } catch { /* ignore */ }
      window.close();
      return;
    }

    // Case B: normal tab (popup was blocked, so the redirect replaced this tab).
    load();
    ["connected", "profileId", "state", "error", "platform"].forEach((k) => params.delete(k));
    const q = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    setNoticeJustConnected(true);
    setTimeout(() => setNoticeJustConnected(false), 6000);
  }, []);

  // Listen for the popup's "connected" signal (Case A above) and refresh + confirm.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "pz:social-connected") {
        load();
        setNoticeJustConnected(true);
        setTimeout(() => setNoticeJustConnected(false), 6000);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Run a live "Test connection" for one account.
  const testConnection = async (acct: SocialAccount) => {
    setTests((t) => ({ ...t, [acct.accountId]: "running" }));
    try {
      const d = await fetch("/api/social/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: acct.accountId }),
      }).then((r) => r.json());
      setTests((t) => ({ ...t, [acct.accountId]: { ...d, testedAt: Date.now() } }));
    } catch {
      setTests((t) => ({ ...t, [acct.accountId]: { ok: false, canPost: false, tokenValid: false, error: "Couldn't reach the test service.", testedAt: Date.now() } }));
    }
  };

  // Open the connect page in a SECURE WINDOW from inside our modal. To dodge popup
  // blockers we open a blank window synchronously on the click, then redirect it to
  // the Ayrshare URL once the (async) JWT comes back.
  // Connect ONE network. Zernio is per-platform OAuth, so we pass the chosen
  // platform and open that network's authorize page in a popup.
  const connect = (platform: string) => {
    setErr("");
    // Open a FRESH window per attempt (unique name) so a slow/failed redirect can't
    // strand the previous connect's page in a reused "pzConnect" window — which is
    // what made returns look like "nothing happened". Write an immediate placeholder
    // so the user never stares at a blank/stale tab while we fetch the auth URL.
    const win = window.open("about:blank", `pzConnect_${platform}_${Math.random().toString(36).slice(2)}`, "width=560,height=720");
    if (win) {
      try {
        win.document.write(`<!doctype html><title>Connecting…</title><body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#334155">Opening ${platform} sign-in…</body>`);
      } catch { /* cross-origin guard — ignore */ }
    }
    setBusy(true);
    fetch("/api/social/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || !d.url) throw new Error(d.error ?? "Couldn't open the connect page.");
        if (win && !win.closed) win.location.href = d.url;
        else window.location.href = d.url; // popup blocked / closed — fall back to same-tab
      })
      .catch((e) => { if (win && !win.closed) win.close(); setErr(e instanceof Error ? e.message : "Failed."); })
      .finally(() => setBusy(false));
  };

  const refresh = async () => {
    setBusy(true);
    await load();
    setBusy(false);
  };

  // Disconnect one network from THIS company's profile.
  const disconnect = async (platform: string, label: string) => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/social/connect", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't disconnect.");
      // Reload the detailed list so the row reflects reality immediately.
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const byPlatform = new Map(accounts.map((a) => [a.platform, a] as const));
  const connected = new Set(accounts.map((a) => a.platform.toLowerCase()));

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
        {multiTenant && (
          <Button onClick={() => { setErr(""); setModalOpen(true); }} disabled={busy}>
            {connected.size > 0 ? "Manage connections" : "Connect accounts"}
          </Button>
        )}
      </div>

      {noticeJustConnected && (
        <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          ✓ Account authorized. If it doesn&apos;t appear below yet, give it a few seconds and tap refresh.
        </p>
      )}
      {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

      {!configured ? (
        <p className="mt-4 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-muted">
          Publishing isn&apos;t configured on this deployment yet. Posts you approve are marked as posted but not sent to a
          live network.
        </p>
      ) : !multiTenant ? (
        <p className="mt-4 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-muted">
          Posting is live on a shared account. Per-company account linking will appear here once enabled.
        </p>
      ) : loading ? (
        <p className="mt-4 text-sm text-faint">Checking your connections…</p>
      ) : connected.size === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-app bg-surface-2/40 px-3 py-3 text-sm text-muted">
          No accounts connected yet. Tap <strong className="text-app">Connect accounts</strong> to link X, LinkedIn, and more.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {/* One rich row per CONNECTED account — confirms who's linked + its health. */}
          {accounts.map((a) => {
            const meta = SOCIAL_NETWORKS.find((n) => n.key === a.platform);
            const label = meta?.label ?? a.platform;
            const test = tests[a.accountId];
            return (
              <AccountRow
                key={a.accountId}
                acct={a}
                label={label}
                icon={meta?.icon ?? "•"}
                test={test}
                onTest={() => testConnection(a)}
                onDisconnect={() => disconnect(a.platform, label)}
              />
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Connect social accounts" onClick={() => !busy && setModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-app bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold text-app">Connect your social accounts</h2>
              <button onClick={() => !busy && setModalOpen(false)} aria-label="Close" className="rounded px-2 text-faint hover:bg-app-hover hover:text-app">✕</button>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Connect each network you want to publish to. Click <strong className="text-app">Connect</strong> next to a network,
              authorize in the secure window, then come back and refresh.
            </p>

            {/* Per-network connect — Zernio links one platform at a time. */}
            <div className="mt-4 space-y-2">
              {SOCIAL_NETWORKS.map((n) => {
                const on = connected.has(n.key);
                return (
                  <div key={n.key} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${on ? "border-emerald-500/40 bg-emerald-500/5" : "border-app bg-surface-2/40"}`}>
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-app-hover text-[11px] font-bold text-app">{n.icon}</span>
                    <span className="flex-1 text-app">{n.label}</span>
                    {on ? (
                      <InlineConfirm onConfirm={() => disconnect(n.key, n.label)} label="✓ Connected" confirmLabel={`Disconnect ${n.label}`} className="text-xs font-semibold text-emerald-600 hover:text-red-500 dark:text-emerald-400" />
                    ) : (
                      <button onClick={() => connect(n.key)} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                        {busy ? "…" : "Connect"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button onClick={refresh} disabled={busy} className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app transition hover:bg-app-hover disabled:opacity-50">
                {busy ? "…" : "↻ I'm done — refresh status"}
              </button>
            </div>
            <p className="mt-3 text-[11px] text-faint">Each network opens its own secure sign-in window. After you authorize, click &ldquo;refresh status&rdquo; to update the checkmarks. Note: X (Twitter) may require a payment method on the publishing account.</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// One connected account: avatar + handle (confirmation it's linked), a health badge,
// a "Test connection" button with inline result, and disconnect. No popups — the
// test result renders inline beneath the row.
function AccountRow({
  acct,
  label,
  icon,
  test,
  onTest,
  onDisconnect,
}: {
  acct: SocialAccount;
  label: string;
  icon: string;
  test?: TestResult | "running";
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const expiresSoon = (() => {
    if (!acct.tokenExpiresAt) return false;
    const ms = Date.parse(acct.tokenExpiresAt) - Date.now();
    return !Number.isNaN(ms) && ms < 24 * 60 * 60 * 1000; // < 24h
  })();
  const expired = (() => {
    if (!acct.tokenExpiresAt) return false;
    const ms = Date.parse(acct.tokenExpiresAt) - Date.now();
    return !Number.isNaN(ms) && ms <= 0;
  })();

  // Status badge: green when active + post-capable, amber when linked but needs
  // attention, red when it can't post.
  const tone = !acct.isActive || expired ? "red" : acct.canPost ? "green" : "amber";
  const badge =
    tone === "green" ? { cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", text: "● Active · can post" }
    : tone === "amber" ? { cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", text: "● Linked · check posting" }
    : { cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300", text: expired ? "● Token expired" : "● Inactive" };

  const running = test === "running";
  const result = test && test !== "running" ? test : null;

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${acct.isActive && !expired ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-red-500/30 bg-red-500/[0.04]"}`}>
      <div className="flex flex-wrap items-center gap-3">
        {/* avatar (falls back to the network glyph) */}
        {acct.profilePicture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={acct.profilePicture} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-app-hover text-xs font-bold text-app">{icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-app">
            {acct.displayName || label}
            {acct.username && <span className="ml-1.5 text-xs font-normal text-muted">@{acct.username}</span>}
          </p>
          <p className="text-[11px] text-faint">
            {label}
            {typeof acct.followersCount === "number" && acct.followersCount > 0 && ` · ${acct.followersCount.toLocaleString()} followers`}
            {acct.tokenExpiresAt && !expired && expiresSoon && " · token renews soon"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.text}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onTest}
            disabled={running}
            className="rounded-lg border border-app px-2.5 py-1 text-xs font-medium text-app transition hover:bg-app-hover disabled:opacity-50"
          >
            {running ? "Testing…" : "Test connection"}
          </button>
          <InlineConfirm
            onConfirm={onDisconnect}
            label={<span className="underline-offset-2 hover:underline">Disconnect</span>}
            confirmLabel={`Disconnect ${label}`}
            title={`Disconnect ${label}`}
            className="text-xs font-semibold text-muted hover:text-red-500 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Inline test result — no popup. */}
      {result && (
        <div
          className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs ${
            result.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {result.error ? (
            <>✕ {result.error}</>
          ) : result.ok ? (
            <>✓ Connection healthy — posts will publish to this account.{result.needsRefresh ? " (Token auto-refreshing.)" : ""}</>
          ) : (
            <>
              ✕ Can&apos;t post yet:
              {!result.tokenValid && " the access token is invalid or expired — reconnect this account."}
              {result.missingScopes?.length ? ` missing permission${result.missingScopes.length > 1 ? "s" : ""}: ${result.missingScopes.join(", ")} — reconnect and grant posting access.` : ""}
              {result.tokenValid && !result.missingScopes?.length ? ` status is "${result.status ?? "unknown"}".` : ""}
            </>
          )}
        </div>
      )}
    </div>
  );
}
