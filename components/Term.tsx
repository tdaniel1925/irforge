"use client";

import { useState } from "react";

// Inline jargon gloss: shows a plain-English meaning on hover (desktop) or tap
// (mobile). Renders the term with a dotted underline so users know they can get a
// plain explanation — keeps the real IR term but makes the app 5th-grade readable.

// One place for every plain-language definition. Keyed by a short id.
export const GLOSSARY: Record<string, string> = {
  "reg-fd": "Reg FD is the SEC rule that says you can't tell one investor something important you haven't told everyone. So company news has to go out to the public all at once.",
  "section-17b": "Section 17(b) is the rule that says if you're paid to promote a stock, you have to disclose that you were paid. That's why a disclosure line gets added to every post.",
  "13f": "A 13F is a report big investment funds must file every quarter listing the U.S. stocks they own. It's public — so we can see which funds hold companies like yours.",
  "quiet-period": "A quiet period is a window (like right before earnings or a financing) when companies avoid saying anything that could move the stock. Turning it on pauses all publishing.",
  "fls": "Forward-looking statements are anything about the future — plans, projections, goals. They legally need a disclaimer noting that the future is uncertain, which gets added automatically.",
  "tamper-evident": "Tamper-evident means we save a digital fingerprint of the approval (who signed off, when) that can't be secretly changed later — the kind of record lawyers want.",
  "visibility-score": "Your Visibility Score is a single number (like a credit score for attention) that tracks how well-known and well-covered your company is, so you can show progress over time.",
  "8-k": "An 8-K is the SEC form for reporting a major event quickly — things like results, a big deal, or a leadership change.",
  "10-k-q": "A 10-K is your big annual report; a 10-Q is the shorter quarterly one. Both are filed with the SEC.",
  "material": "'Material' means important enough that it could affect an investor's decision or move the stock — the kind of news that has to be handled carefully.",
};

export default function Term({ id, children }: { id: keyof typeof GLOSSARY | string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const def = GLOSSARY[id];
  if (!def) return <>{children}</>;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="cursor-help border-b border-dotted border-current font-medium"
        aria-label={`What does ${typeof children === "string" ? children : "this"} mean?`}
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-app bg-surface p-3 text-left text-xs font-normal leading-relaxed text-app shadow-xl"
        >
          {def}
        </span>
      )}
    </span>
  );
}
