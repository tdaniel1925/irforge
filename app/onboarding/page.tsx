"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TIERS = [
  { key: "starter", name: "Starter", price: "$1,500/mo", blurb: "Verified page, filing-to-post drafting, the board, monthly proof." },
  { key: "growth", name: "Growth", price: "$3,500/mo", blurb: "+ Threat Radar, AI Q&A, 13F investor targeting, X publishing.", popular: true },
  { key: "pro", name: "Command", price: "$6,000/mo", blurb: "+ short-attack defense, earnings support, dedicated onboarding." },
];

const DEFAULT_DISCLOSURE =
  "Disclosure: This account is operated on behalf of the company via PubcoZone, a compensated service provider. Not investment advice. See SEC filings at sec.gov for complete information.";
const DEFAULT_FLS =
  "This post contains forward-looking statements subject to risks and uncertainties described in our SEC filings. Actual results may differ materially.";

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Comped accounts (promo / super-admin) already have full free access — they
  // should NOT see a pricing/plan step. We detect that and skip it.
  const [comped, setComped] = useState(false);

  const [tickerInput, setTickerInput] = useState("");
  const [lookup, setLookup] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", ticker: "", exchange: "", cik: "", sector: "", description: "",
    approverName: "", approverTitle: "", xHandle: "", peers: "",
    disclosureText: DEFAULT_DISCLOSURE, flsText: DEFAULT_FLS, tier: "growth",
  });

  // Is this a comped/free account? (already active before any payment.)
  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((d) => {
        if (d?.superAdmin || d?.company?.comped) setComped(true);
      })
      .catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Claim flow: /onboarding?ticker=AMFN pre-fills the ticker and auto-runs the
  // EDGAR lookup so a company arriving from "Claim $TICKER" lands on step 1 with
  // its details already pulled — no retyping.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("ticker");
    if (t && /^[A-Za-z.\-]{1,8}$/.test(t)) {
      const up = t.toUpperCase();
      setTickerInput(up);
      runLookup(up);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runLookup = async (tickerArg?: string) => {
    // Guard: onClick passes a MouseEvent here — only honor a real string ticker.
    const explicit = typeof tickerArg === "string" ? tickerArg : "";
    const tk = (explicit || tickerInput).trim();
    if (!tk) { setError("Enter your ticker to continue."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/onboard/lookup?ticker=${encodeURIComponent(tk)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Lookup failed."); return; }
      setLookup(data);
      setForm((f) => ({
        ...f,
        name: data.companyName || f.name,
        ticker: data.ticker || tk.toUpperCase(),
        exchange: data.exchange || f.exchange,
        cik: data.cik || f.cik,
        sector: data.sector || f.sector,
        description: data.description || f.description,
      }));
      setStep(1);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, peers: form.peers.split(",").map((p) => p.trim()).filter(Boolean) }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed."); return; }
      // Land on the approvals inbox (/app) — the home the "Activate my dashboard" button promises.
      router.push("/app");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress — comped accounts skip the Plan step entirely */}
      <div className="mb-8 flex items-center gap-2">
        {["Ticker", "Confirm", "Approver", "Compliance", ...(comped ? [] : ["Plan"])].map((label, i, arr) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-emerald-500 text-white" : "bg-surface-2 text-faint"}`}>{i + 1}</div>
            <span className={`hidden text-xs sm:inline ${i === step ? "font-semibold text-app" : "text-faint"}`}>{label}</span>
            {i < arr.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-emerald-500" : "bg-surface-2"}`} />}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">{error}</div>}

      {/* STEP 0 — ticker */}
      {step === 0 && (
        <Panel title="Let's claim your page" sub="Enter your ticker — we'll pull your public profile from SEC EDGAR automatically.">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && runLookup()}
            placeholder="Your ticker — e.g. LAC"
            autoFocus
            className="w-full rounded-xl border border-app bg-surface-2 px-4 py-3 text-center text-lg uppercase tracking-wider text-app focus:border-emerald-500 focus:outline-none"
          />
          <Next onClick={runLookup} busy={busy} label="Look up my company →" />
        </Panel>
      )}

      {/* STEP 1 — confirm prefilled */}
      {step === 1 && (
        <Panel title="Is this you?" sub={lookup?.found ? "We found you on EDGAR and pre-filled the details. Fix anything that's off." : "This ticker isn't an SEC/EDGAR filer (often the case for OTC or non-US companies). No problem — enter your details below, and you can add your filings yourself in Settings after setup."}>
          {lookup?.found && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <p className="font-semibold text-app">{lookup.companyName}</p>
              <p className="text-muted">Current visibility score: <span className="font-semibold text-app">{lookup.score} ({lookup.grade})</span> · {lookup.watchers.toLocaleString()} watchers · {lookup.filings12mo} filings/yr &mdash; this is what investors see today.</p>
            </div>
          )}
          <Field label="Company name" value={form.name} onChange={(v) => set("name", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ticker" value={form.ticker} onChange={(v) => set("ticker", v.toUpperCase())} />
            <Field label="Exchange" value={form.exchange} onChange={(v) => set("exchange", v)} />
          </div>
          <Field label="Sector" value={form.sector} onChange={(v) => set("sector", v)} />
          <TextField label="One-line description (investors and AI read this)" value={form.description} onChange={(v) => set("description", v)} />
          <Field label="Peer tickers for comparison (comma-separated)" value={form.peers} onChange={(v) => set("peers", v.toUpperCase())} />
          <Back onClick={() => setStep(0)} /><Next onClick={() => setStep(2)} label="Next →" disabled={!form.name || !form.ticker} />
        </Panel>
      )}

      {/* STEP 2 — approver */}
      {step === 2 && (
        <Panel title="Who approves what goes out?" sub="Nothing publishes without this person's tap — the human approval at the heart of PubcoZone. You stay in control of every post.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Approver name" value={form.approverName} onChange={(v) => set("approverName", v)} />
            <Field label="Title" value={form.approverTitle} onChange={(v) => set("approverTitle", v)} placeholder="CFO" />
          </div>
          <Field label="X (Twitter) handle" value={form.xHandle} onChange={(v) => set("xHandle", v)} placeholder="@yourcompany" />
          <p className="mt-1 text-xs text-faint">You&apos;ll connect the X account itself in Settings after onboarding (via Ayrshare).</p>
          <Back onClick={() => setStep(1)} /><Next onClick={() => setStep(3)} label="Next →" disabled={!form.approverName} />
        </Panel>
      )}

      {/* STEP 3 — compliance language */}
      {step === 3 && (
        <Panel title="Your disclosure language" sub="Appended to every published post automatically — it can't be skipped. Edit if your counsel prefers different wording.">
          <TextField label="Section 17(b) disclosure" value={form.disclosureText} onChange={(v) => set("disclosureText", v)} rows={3} />
          <TextField label="Forward-looking statements notice" value={form.flsText} onChange={(v) => set("flsText", v)} rows={2} />
          <Back onClick={() => setStep(2)} />
          {comped
            ? <Next onClick={finish} busy={busy} label="Activate my dashboard →" />
            : <Next onClick={() => setStep(4)} label="Next →" />}
        </Panel>
      )}

      {/* STEP 4 — tier (no charge at signup; you can add billing later) */}
      {step === 4 && comped && (
        <Panel title="You're all set — free, full access" sub="Your account has every feature unlocked at no charge. No plan to pick, no card needed.">
          <Back onClick={() => setStep(3)} />
          <Next onClick={finish} busy={busy} label="Activate my dashboard →" />
        </Panel>
      )}

      {step === 4 && !comped && (
        <Panel title="Which plan fits you?" sub="No card needed to get started — we'll activate your dashboard now and sort out billing with you later. This just tells us what you're after.">
          <div className="space-y-3">
            {TIERS.map((t) => (
              <button
                key={t.key}
                onClick={() => set("tier", t.key)}
                className={`flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition ${form.tier === t.key ? "border-emerald-500 bg-emerald-500/5" : "border-app hover:border-app"}`}
              >
                <div>
                  <p className="font-semibold text-app">
                    {t.name} {t.popular && <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">POPULAR</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{t.blurb}</p>
                </div>
                <span className="shrink-0 text-right text-sm font-medium text-faint">{t.price}<br /><span className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">free to start</span></span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">You won&apos;t be charged today. Activate your dashboard and we&apos;ll set up billing together when you&apos;re ready.</p>
          <Back onClick={() => setStep(3)} />
          <Next onClick={finish} busy={busy} label="Activate my dashboard →" />
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-app bg-surface p-7">
      <h1 className="text-xl font-semibold text-app">{title}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">{sub}</p>
      {children}
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
    </div>
  );
}
function TextField({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none" />
    </div>
  );
}
function Next({ onClick, label, busy, disabled }: { onClick: () => void; label: string; busy?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy || disabled} className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50">
      {busy ? "…" : label}
    </button>
  );
}
function Back({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="mt-3 text-xs text-muted hover:text-app">← Back</button>;
}
