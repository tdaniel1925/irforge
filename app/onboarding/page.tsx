"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TIERS = [
  { key: "starter", name: "Starter", price: "$1,500/mo", blurb: "Verified page, filing-to-post drafting, the board, monthly proof." },
  { key: "growth", name: "Growth", price: "$3,500/mo", blurb: "+ Threat Radar, AI Q&A, 13F investor targeting, X publishing.", popular: true },
  { key: "pro", name: "Command", price: "$6,000/mo", blurb: "+ short-attack defense, earnings support, dedicated onboarding." },
];

const DEFAULT_DISCLOSURE =
  "Disclosure: This account is operated on behalf of the company via IRForge, a compensated service provider. Not investment advice. See SEC filings at sec.gov for complete information.";
const DEFAULT_FLS =
  "This post contains forward-looking statements subject to risks and uncertainties described in our SEC filings. Actual results may differ materially.";

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [tickerInput, setTickerInput] = useState("");
  const [lookup, setLookup] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", ticker: "", exchange: "", cik: "", sector: "", description: "",
    approverName: "", approverTitle: "", xHandle: "", peers: "",
    disclosureText: DEFAULT_DISCLOSURE, flsText: DEFAULT_FLS, tier: "growth",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const runLookup = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/onboard/lookup?ticker=${encodeURIComponent(tickerInput)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Lookup failed."); return; }
      setLookup(data);
      setForm((f) => ({
        ...f,
        name: data.companyName || f.name,
        ticker: data.ticker || tickerInput.toUpperCase(),
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
      router.push("/company");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {["Ticker", "Confirm", "Approver", "Compliance", "Plan"].map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-emerald-500 text-white" : "bg-surface-2 text-faint"}`}>{i + 1}</div>
            <span className={`hidden text-xs sm:inline ${i === step ? "font-semibold text-app" : "text-faint"}`}>{label}</span>
            {i < 4 && <div className={`h-0.5 flex-1 ${i < step ? "bg-emerald-500" : "bg-surface-2"}`} />}
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
          <Back onClick={() => setStep(0)} /><Next onClick={() => setStep(2)} label="Next →" />
        </Panel>
      )}

      {/* STEP 2 — approver */}
      {step === 2 && (
        <Panel title="Who approves what goes out?" sub="Nothing publishes without this person's tap. This is the compliance gate at the heart of IRForge.">
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
          <Back onClick={() => setStep(2)} /><Next onClick={() => setStep(4)} label="Next →" />
        </Panel>
      )}

      {/* STEP 4 — tier */}
      {step === 4 && (
        <Panel title="Pick your plan" sub="You can change this anytime. Most companies start on Growth.">
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
                <span className="shrink-0 font-bold text-app">{t.price}</span>
              </button>
            ))}
          </div>
          <Back onClick={() => setStep(3)} />
          <Next onClick={finish} busy={busy} label="Activate my Command Center →" />
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
