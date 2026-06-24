"use client";

import Link from "next/link";
import { useState } from "react";

// Full-height split-screen hero: investor (left, sky) vs public company (right,
// emerald). Hovering a side expands it; the other recedes. Each side routes
// straight to the right signup. On mobile the two stack full-width.
export default function SplitHero() {
  const [hover, setHover] = useState<"investor" | "company" | null>(null);

  // Flex weights drive the grow/shrink on hover (desktop only).
  const investorGrow = hover === "investor" ? "lg:flex-[1.35]" : hover === "company" ? "lg:flex-[0.65]" : "lg:flex-1";
  const companyGrow = hover === "company" ? "lg:flex-[1.35]" : hover === "investor" ? "lg:flex-[0.65]" : "lg:flex-1";

  return (
    <section className="relative flex min-h-[88vh] flex-col lg:flex-row">
      {/* INVESTOR side */}
      <Link
        href="/login?type=investor&mode=signup"
        onMouseEnter={() => setHover("investor")}
        onMouseLeave={() => setHover(null)}
        className={`group relative flex flex-1 flex-col justify-center overflow-hidden px-8 py-16 transition-all duration-500 ease-out sm:px-12 lg:py-0 ${investorGrow}`}
      >
        {/* gradient + glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-sky-700 to-slate-900" />
        <div className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl transition-opacity duration-500 group-hover:opacity-90" />
        <div className="relative z-10 mx-auto max-w-md text-white">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="text-base">📈</span> For investors
          </div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Research any ticker.<br />Facts over hype.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-sky-100/90">
            A board where claims get checked against filings, pumps get flagged, and you
            see real SEC data — price, cash, insiders, short interest — before you decide.
            You&apos;re not the exit liquidity.
          </p>
          <span className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-sky-700 shadow-lg transition group-hover:gap-3 group-hover:shadow-xl">
            Explore free <span aria-hidden>→</span>
          </span>
          <p className="mt-3 text-xs text-sky-200/80">Free to research · sign up to save a watchlist &amp; join the board</p>
        </div>
      </Link>

      {/* Divider seam (desktop) */}
      <div className="hidden w-px shrink-0 bg-white/10 lg:block" />

      {/* PUBLIC COMPANY side */}
      <Link
        href="/login?type=company&mode=signup"
        onMouseEnter={() => setHover("company")}
        onMouseLeave={() => setHover(null)}
        className={`group relative flex flex-1 flex-col justify-center overflow-hidden px-8 py-16 transition-all duration-500 ease-out sm:px-12 lg:py-0 ${companyGrow}`}
      >
        <div className="absolute inset-0 bg-gradient-to-bl from-emerald-600 via-emerald-700 to-slate-900" />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl transition-opacity duration-500 group-hover:opacity-90" />
        <div className="relative z-10 mx-auto max-w-md text-white lg:ml-auto">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="text-base">🏢</span> For public companies
          </div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Turn filings into compliant posts<br />you approve.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-emerald-100/90">
            AI drafts your investor updates from the public record, a Reg FD check and
            counsel sign-off keep you compliant, and you post to every channel — all
            approved by you with one tap. Your whole IR program in one place.
          </p>
          <span className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-emerald-700 shadow-lg transition group-hover:gap-3 group-hover:shadow-xl">
            Start free <span aria-hidden>→</span>
          </span>
          <p className="mt-3 text-xs text-emerald-200/80">Free company report · no card to start</p>
        </div>
      </Link>

      {/* Center label — which side are you? */}
      <div className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 text-center">
        <span className="rounded-full bg-black/30 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
          Which side of the table are you on?
        </span>
      </div>
    </section>
  );
}
