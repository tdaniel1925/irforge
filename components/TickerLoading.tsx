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

// Full-screen DARK overlay → every color hardcoded bright (white / light-green).
export default function TickerLoading() {
  const [feed, setFeed] = useState<number[]>([]);
  const [quote, setQuote] = useState(0);
  const [fade, setFade] = useState(false);
  const i = useRef(0);

  useEffect(() => {
    const s = setInterval(() => {
      setFeed((prev) => (prev.length >= SOURCES.length ? prev : [...prev, i.current++ % SOURCES.length]));
    }, 260);
    // Cross-fade quotes without ever resting at low opacity.
    const q = setInterval(() => {
      setFade(true);
      setTimeout(() => { setQuote((x) => (x + 1) % QUOTES.length); setFade(false); }, 400);
    }, 3600);
    return () => { clearInterval(s); clearInterval(q); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#04060c]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#34d399 1px, transparent 1px), linear-gradient(90deg, #34d399 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.10)_0%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,#04060c_78%)]" />

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center px-6">
        {/* BIG radar */}
        <div className="relative mb-10 h-72 w-72 sm:h-80 sm:w-80">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="absolute rounded-full border border-emerald-400/25" style={{ inset: `${r * 38}px` }} />
          ))}
          <span className="absolute inset-0 rounded-full border-2 border-emerald-400/50 pz-ping" />
          <span className="absolute inset-0 rounded-full border-2 border-emerald-400/40 pz-ping" style={{ animationDelay: "1.3s" }} />
          {/* crosshair lines */}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-400/15" />
          <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-emerald-400/15" />
          {/* sweeping beam */}
          <div className="absolute inset-0 rounded-full pz-sweep" style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 290deg, rgba(52,211,153,0.45) 345deg, rgba(167,243,208,0.9) 360deg)" }} />
          {/* core */}
          <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500/15">
            <span className="h-4 w-4 rounded-full bg-emerald-300 pz-glow" />
          </div>
          {/* blips */}
          {SOURCES.slice(0, 8).map((_, idx) => {
            const ang = (idx / 8) * Math.PI * 2 - Math.PI / 2;
            const on = feed.length > idx;
            return (
              <span key={idx} className={`absolute h-2.5 w-2.5 rounded-full transition-all duration-500 ${on ? "bg-emerald-300 shadow-[0_0_14px_4px_rgba(52,211,153,0.9)]" : "bg-emerald-400/25"}`}
                style={{ left: `calc(50% + ${Math.cos(ang) * 122}px - 5px)`, top: `calc(50% + ${Math.sin(ang) * 122}px - 5px)` }} />
            );
          })}
        </div>

        {/* HUGE bright wordmark — inline colors so the light-mode theme bridge can't dim them */}
        <div className="mb-3 flex items-baseline gap-1 text-5xl font-extrabold tracking-tight sm:text-6xl" style={{ textShadow: "0 0 28px rgba(52,211,153,0.45)" }}>
          <span style={{ color: "#ecfdf5" }}>Pubco</span><span style={{ color: "#34d399" }}>Zone.</span>
        </div>
        <h1 className="mb-10 text-2xl font-semibold text-emerald-50 sm:text-3xl">Pulling the full picture on this company</h1>

        {/* Scanning feed — bigger chips */}
        <div className="flex min-h-[2.5rem] flex-wrap items-center justify-center gap-2.5">
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.25em]" style={{ color: "#34d399" }}>scanning</span>
          {feed.slice(-4).map((srcIdx, k, arr) => (
            <span key={`${srcIdx}-${feed.length - arr.length + k}`} className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium pz-rise ${k === arr.length - 1 ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-100" : "border-emerald-400/25 bg-emerald-400/8 text-emerald-200/70"}`}>
              ✓ {SOURCES[srcIdx]}
            </span>
          ))}
        </div>

        {/* progress */}
        <div className="mt-7 h-1.5 w-80 overflow-hidden rounded-full bg-emerald-400/10">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-300" style={{ width: `${Math.min(100, (feed.length / SOURCES.length) * 100)}%` }} />
        </div>

        {/* Big bright quote — cross-fades, never rests dim. Tall reserved area so 3-line wraps never collide. */}
        <div className="mt-12 flex min-h-[8rem] max-w-2xl items-center">
          <p className="text-center text-xl font-semibold leading-relaxed sm:text-2xl" style={{ color: "#ffffff", transition: "opacity 400ms ease", opacity: fade ? 0 : 1, textShadow: "0 1px 20px rgba(16,185,129,0.25)" }}>
            &ldquo;{QUOTES[quote]}&rdquo;
          </p>
        </div>

        <p className="mt-6 text-sm text-emerald-200/50">Live public data · no signup · usually under 15 seconds</p>
      </div>
    </div>
  );
}
