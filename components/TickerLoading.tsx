"use client";

import { useEffect, useState } from "react";

const SOURCES = [
  "SEC EDGAR — filings",
  "XBRL — financials",
  "Form 4 — insider trades",
  "FINRA — short volume",
  "StockTwits — sentiment",
  "Yahoo Finance — price & volume",
  "GDELT — global news",
  "Wikipedia & Wikidata",
  "ClinicalTrials.gov",
  "USAspending.gov",
  "openFDA",
  "Reddit",
];

const QUOTES = [
  { line: "On the message boards, anonymous accounts pump, dump, and bash. Here, every post is labeled and the company is on the record.", tag: "Not pump-and-dump land" },
  { line: "InvestorsHub and StockTwits let strangers write your story. PubcoZone lets the company finally answer — legally.", tag: "The playing field, leveled" },
  { line: "We aggregate 12 public sources into one honest picture — so you're not the exit liquidity for someone else's scheme.", tag: "Signal over noise" },
  { line: "Hype gets flagged. FUD gets flagged. Verified company answers rise to the top. The truth gets home-field advantage.", tag: "AI-moderated, fair to both sides" },
  { line: "Every figure here traces to a public filing. No tips, no touts — just the record, made readable.", tag: "Built on the public record" },
];

export default function TickerLoading() {
  const [revealed, setRevealed] = useState(0);
  const [quote, setQuote] = useState(0);

  useEffect(() => {
    const s = setInterval(() => setRevealed((r) => (r + 1) % (SOURCES.length + 1)), 380);
    const q = setInterval(() => setQuote((x) => (x + 1) % QUOTES.length), 3200);
    return () => { clearInterval(s); clearInterval(q); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950">
      {/* ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[100px]" />

      {/* Gears */}
      <div className="relative mb-10 h-32 w-32">
        <Gear className="absolute left-0 top-0 h-20 w-20 text-emerald-400" spin="tl-spin 6s linear infinite" />
        <Gear className="absolute right-0 top-6 h-14 w-14 text-emerald-300/80" spin="tl-spin-rev 4.5s linear infinite" />
        <Gear className="absolute bottom-0 left-8 h-12 w-12 text-emerald-500/70" spin="tl-spin 5s linear infinite" />
      </div>

      <p className="mb-1 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">PubcoZone</p>
      <h1 className="mb-8 text-xl font-semibold text-white">Building the honest picture…</h1>

      {/* Sources lighting up */}
      <div className="grid w-full max-w-2xl grid-cols-2 gap-x-8 gap-y-2 px-8 sm:grid-cols-3">
        {SOURCES.map((src, i) => {
          const on = i < revealed;
          return (
            <div key={src} className={`flex items-center gap-2 text-xs transition-all duration-300 ${on ? "text-slate-200 opacity-100" : "text-slate-600 opacity-40"}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full transition-colors duration-300 ${on ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" : "bg-slate-700"}`} />
              {src}
            </div>
          );
        })}
      </div>

      {/* Rotating quotes */}
      <div className="mt-12 h-24 max-w-2xl px-8 text-center">
        <div key={quote} className="tl-fade">
          <p className="text-lg font-medium leading-relaxed text-white">&ldquo;{QUOTES[quote].line}&rdquo;</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">{QUOTES[quote].tag}</p>
        </div>
      </div>

      <p className="absolute bottom-8 text-xs text-slate-500">Scanning live public sources · usually under 15 seconds</p>
    </div>
  );
}

function Gear({ className, spin }: { className: string; spin: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={{ animation: spin, transformOrigin: "center" }}>
      <path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 13.5 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.566.566 0 0 0-.18-.03c-.17 0-.34.09-.43.25l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.29.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.06.02.12.03.18.03.17 0 .34-.09.43-.25l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5z" />
    </svg>
  );
}
