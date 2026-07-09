"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketingNav, MarketingFooter } from "@/components/marketing/Chrome";

// Company page claim + verification. Two steps, no login required:
//   1) Which ticker are you claiming? (prefilled from ?ticker=)
//   2) Who are you + upload proof (authorization letter/filing + a government ID).
// Submits to /api/claim (multipart) -> pending claim_requests row + private doc upload
// -> an admin reviews in the console and verifies. Inline UI only (no toasts/alerts).

const RELATIONSHIPS = [
  { v: "officer", label: "Officer (CEO / CFO / etc.)" },
  { v: "director", label: "Board director" },
  { v: "ir", label: "Investor Relations / Communications" },
  { v: "agent", label: "Authorized agent (with written authorization)" },
];

function VerifyInner() {
  const params = useSearchParams();
  const initialTicker = (params.get("ticker") ?? "").toUpperCase();

  const [step, setStep] = useState<1 | 2>(initialTicker ? 2 : 1);
  const [ticker, setTicker] = useState(initialTicker);
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [relationship, setRelationship] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  const toStep2 = () => {
    if (!/^[A-Za-z][A-Za-z0-9.\-]{0,7}$/.test(ticker.trim())) { setError("Enter a valid ticker."); return; }
    setError(""); setStep(2);
  };

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list).slice(0, 5));
  };

  const submit = async () => {
    setError("");
    if (!companyName.trim() || !name.trim()) { setError("Company name and your name are required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid work email."); return; }
    if (!relationship) { setError("Select your relationship to the company."); return; }
    if (files.length === 0) { setError("Upload your proof documents (authorization/filing + a government ID)."); return; }

    setState("busy");
    const fd = new FormData();
    fd.set("ticker", ticker.trim().toUpperCase());
    fd.set("companyName", companyName.trim());
    fd.set("name", name.trim());
    fd.set("title", title.trim());
    fd.set("relationship", relationship);
    fd.set("email", email.trim());
    fd.set("phone", phone.trim());
    fd.set("notes", notes.trim());
    for (const f of files) fd.append("docs", f);

    try {
      const r = await fetch("/api/claim", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "Couldn't submit — try again."); setState("idle"); return; }
      setState("done");
    } catch {
      setError("Network error — try again."); setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">✓</div>
        <h1 className="text-2xl font-bold text-app">Claim submitted for ${ticker.toUpperCase()}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Our team will review your documents and verify ownership — usually within one business day. We&apos;ll email{" "}
          <span className="font-medium text-app">{email}</span> once your page is verified, with next steps to set it up.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/t/${ticker.toUpperCase()}`} className="rounded-lg border border-app px-5 py-2.5 text-sm font-semibold text-app hover:bg-app-hover">
            View your public page
          </Link>
          <Link href="/for-companies" className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
            See what you get →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-app">Claim &amp; verify your company page</h1>
        <p className="mx-auto mt-2 max-w-lg text-muted">
          Free to claim. We verify that you&apos;re authorized to speak for the company before you get the verified voice —
          it&apos;s what keeps &ldquo;verified company&rdquo; meaningful.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-3 text-sm">
        <span className={`flex items-center gap-2 ${step === 1 ? "font-semibold text-app" : "text-faint"}`}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === 1 ? "bg-emerald-600 text-white" : "bg-app-hover text-muted"}`}>1</span> Ticker
        </span>
        <span className="h-px w-8 bg-app" />
        <span className={`flex items-center gap-2 ${step === 2 ? "font-semibold text-app" : "text-faint"}`}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === 2 ? "bg-emerald-600 text-white" : "bg-app-hover text-muted"}`}>2</span> Verify ownership
        </span>
      </div>

      {step === 1 && (
        <div className="rounded-2xl border border-app bg-surface p-6">
          <label className="block text-sm font-medium text-app">Which company are you claiming?</label>
          <div className="mt-2 flex overflow-hidden rounded-xl border border-app bg-surface-2 focus-within:border-emerald-500">
            <span className="flex items-center pl-4 text-faint">$</span>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && toStep2()}
              placeholder="Your ticker — e.g. AMFN" autoFocus
              className="w-full bg-transparent px-2 py-3 uppercase tracking-wide text-app placeholder:normal-case placeholder:tracking-normal focus:outline-none" />
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <button onClick={toStep2} className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
            Continue →
          </button>
          <p className="mt-3 text-center text-xs text-faint">Not sure your ticker has a page? <Link href="/t" className="underline">Look it up first</Link>.</p>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-2xl border border-app bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted">Claiming <span className="font-semibold text-app">${ticker.toUpperCase()}</span></p>
            <button onClick={() => setStep(1)} className="text-xs text-faint underline hover:text-app">change</button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company legal name" value={companyName} onChange={setCompanyName} placeholder="American Fusion, Inc." full />
            <Field label="Your full name" value={name} onChange={setName} placeholder="Jane Smith" />
            <Field label="Your title" value={title} onChange={setTitle} placeholder="Chief Financial Officer" />
            <div>
              <label className="block text-xs font-medium text-muted">Relationship to the company</label>
              <select value={relationship} onChange={(e) => setRelationship(e.target.value)}
                className="mt-1 w-full rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none">
                <option value="">Select…</option>
                {RELATIONSHIPS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </div>
            <Field label="Work email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" />
            <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+1 555 123 4567" />
          </div>

          {/* Document upload */}
          <div className="mt-5">
            <label className="block text-sm font-medium text-app">Proof of authority</label>
            <p className="mt-1 text-xs text-muted">
              Upload (1) a document showing you&apos;re authorized — an officer/board authorization letter, a recent SEC filing
              naming you, or company registration — <span className="font-medium text-app">and</span> (2) a government photo ID
              of the person named above. PDF or image, up to 5 files, 10MB each. These are private and used only to verify you.
            </p>
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-app bg-surface-2 px-4 py-8 text-center transition hover:border-emerald-500">
              <span className="text-2xl">📎</span>
              <span className="mt-1 text-sm font-medium text-app">Choose files</span>
              <span className="mt-0.5 text-xs text-faint">PDF, PNG, JPG · up to 5 files</span>
              <input type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-app bg-surface-2 px-3 py-1.5 text-xs">
                    <span className="truncate text-app">{f.name}</span>
                    <span className="ml-2 shrink-0 text-faint">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-muted">Anything else we should know? (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. the filing that names me is the 10-K dated…"
              className="mt-1 w-full resize-y rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <button onClick={submit} disabled={state === "busy"}
            className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            {state === "busy" ? "Submitting…" : "Submit for verification"}
          </button>
          <p className="mt-3 text-center text-xs text-faint">
            Free to claim · reviewed within ~1 business day · your documents are private and never shown publicly.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", full = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium text-muted">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-app text-app">
      <MarketingNav audience="companies" />
      <Suspense fallback={<div className="px-6 py-24 text-center text-faint">Loading…</div>}>
        <VerifyInner />
      </Suspense>
      <MarketingFooter />
    </div>
  );
}
