"use client";

import { useMemo, useRef, useState } from "react";
import { renderMarkdown, splitSections } from "./BriefView";

// A paginated reader for a research brief: one ## section per page, with Prev/Next
// controls, a page indicator, and a jump-to-section list. Keeps the brief on a
// single URL (good for a shareable demo) without one endless scroll.
export default function BriefReader({ markdown }: { markdown: string }) {
  const sections = useMemo(() => {
    const all = splitSections(markdown);
    // Drop a leading title-less intro that is just the TOC blockquote — the
    // jump-to-section pills already serve that purpose, so page 1 starts on the
    // first real section.
    return all.filter((s, i) => !(i === 0 && !s.title));
  }, [markdown]);
  const [page, setPage] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  if (sections.length === 0) return null;
  const total = sections.length;
  const current = sections[Math.min(page, total - 1)];

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(total - 1, next));
    setPage(clamped);
    // Bring the top of the reader into view on page change.
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const label = (i: number) => sections[i].title || "Introduction";

  return (
    <div ref={topRef} className="scroll-mt-20">
      {/* Jump-to-section pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {sections.map((s, i) => (
          <button
            key={s.id || i}
            onClick={() => go(i)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              i === page
                ? "bg-emerald-600 text-white"
                : "border border-app bg-surface text-muted hover:bg-app-hover hover:text-app"
            }`}
          >
            {label(i)}
          </button>
        ))}
      </div>

      {/* Current page */}
      <div className="min-h-[320px] space-y-3">{renderMarkdown(current.body, `p${page}-`)}</div>

      {/* Pager */}
      <div className="mt-8 flex items-center justify-between border-t border-app pt-5">
        <button
          onClick={() => go(page - 1)}
          disabled={page === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-app px-4 py-2 text-sm font-semibold text-app transition hover:bg-app-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous
        </button>
        <span className="text-xs font-medium text-faint">
          Page {page + 1} of {total}
          {current.title ? ` · ${current.title}` : ""}
        </span>
        <button
          onClick={() => go(page + 1)}
          disabled={page === total - 1}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
