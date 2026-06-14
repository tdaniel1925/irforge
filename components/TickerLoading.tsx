"use client";

import { useEffect, useRef, useState } from "react";

const SOURCES = [
  "SEC EDGAR", "XBRL financials", "Form 4 insiders", "FINRA short data",
  "StockTwits", "Yahoo Finance", "GDELT news", "Wikidata",
  "ClinicalTrials.gov", "USAspending", "openFDA", "Reddit",
];

const QUOTES = [
  "Anonymous accounts pump, dump, and bash. Here, every post is labeled — and the company is on the record.",
  "InvestorsHub and StockTwits let strangers write your story. PubcoZone lets the company answer — legally.",
  "Twelve public sources, one honest picture. So you're never the exit liquidity for someone else's scheme.",
  "Hype flagged. FUD flagged. Verified answers on top. The truth gets home-field advantage.",
];

// NOTE: this is a full-screen DARK overlay, so every color here is hardcoded light
// (white / light-green) — never theme-aware classes, which would flip to dark text.
export default function TickerLoading() {
  const [feed, setFeed] = useState<number[]>([]);
  const [quote, setQuote] = useState(0);
  const i = useRef(0);

  useEffect(() => {
    const s = setInterval(() => {
      setFeed((prev) => (prev.length >= SOURCES.length ? prev : [...prev, i.current++ % SOURCES.length]));
    }, 280);
    const q = setInterval(() => setQuote((x) => (x + 1) % QUOTES.length), 3400);
    return () => { clearInterval(s); clearInterval(q); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#05070d]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,#05070d_75%)]" />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center px-6">
        {/* Radar */}
        <div className="relative mb-12 h-56 w-56">
          {[1, 2, 3].map((r) => (
            <div key={r} className="absolute rounded-full border border-emerald-400/20" style={{ inset: `${(r - 1) * 28}px` }} />
          ))}
          <span className="absolute inset-0 rounded-full border border-emerald-400/40 pz-ping" />
          <span className="absolute inset-0 rounded-full border border-emerald-400/30 pz-ping" style={{ animationDelay: "1.1s" }} />
          <div className="absolute inset-0 rounded-full pz-sweep" style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(52,211,153,0.4) 350deg, rgba(110,231,183,0.75) 360deg)" }} />
          <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500/15">
            <span className="h-3 w-3 rounded-full bg-emerald-300 pz-glow" />
          </div>
          {SOURCES.slice(0, 8).map((_, idx) => {
            const ang = (idx / 8) * Math.PI * 2;
            const on = feed.length > idx;
            return (
              <span key={idx} className={`absolute h-1.5 w-1.5 rounded-full transition-all duration-500 ${on ? "bg-emerald-300 shadow-[0_0_10px_3px_rgba(52,211,153,0.8)]" : "bg-emerald-400/25"}`}
                style={{ left: `calc(50% + ${Math.cos(ang) * 88}px - 3px)`, top: `calc(50% + ${Math.sin(ang) * 88}px - 3px)` }} />
            );
          })}
        </div>

        {/* Wordmark + headline — bright */}
        <div className="mb-2 flex items-baseline gap-0.5 text-3xl font-bold tracking-tight">
          <span className="text-white">Pubco</span><span className="text-emerald-300">Zone</span><span className="text-emerald-300">.</span>
        </div>
        <h1 className="mb-10 text-lg font-medium text-emerald-50/90">Pulling the full picture on this company</h1>

        {/* Live scanning feed — bright chips */}
        <div className="flex h-8 items-center gap-2 text-sm">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">scanning</span>
          <div className="flex items-center gap-2 overflow-hidden">
            {feed.slice(-4).map((srcIdx, k, arr) => (
              <span key={`${srcIdx}-${feed.length - arr.length + k}`} className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs pz-rise ${k === arr.length - 1 ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-100/50"}`}>
                ✓ {SOURCES[srcIdx]}
              </span>
            ))}
          </div>
        </div>

        {/* progress */}
        <div className="mt-6 h-1 w-64 overflow-hidden rounded-full bg-emerald-400/10">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${Math.min(100, (feed.length / SOURCES.length) * 100)}%` }} />
        </div>

        {/* Rotating quote — bright white */}
        <div className="mt-12 flex h-16 max-w-xl items-center text-center">
          <p key={quote} className="pz-quote text-base font-medium leading-relaxed text-white">
            &ldquo;{QUOTES[quote]}&rdquo;
          </p>
        </div>
      </div>

      <p className="absolute bottom-8 text-xs text-emerald-100/40">Live public data · no signup · usually under 15 seconds</p>
    </div>
  );
}
