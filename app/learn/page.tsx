"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { TRACKS, GLOSSARY, type Article } from "@/lib/learnContent";

export default function Learn() {
  const [activeTrack, setActiveTrack] = useState(TRACKS[0].key);
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [view, setView] = useState<"library" | "glossary">("library");
  const [feed, setFeed] = useState<{ title: string; link: string; date: string }[]>([]);

  useEffect(() => {
    fetch("/api/sec-feed")
      .then((r) => r.json())
      .then((d) => setFeed(d.items ?? []))
      .catch(() => {});
  }, []);

  const track = TRACKS.find((t) => t.key === activeTrack)!;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Public Company Playbook"
        subtitle="In-depth, plain-English guides to filings, disclosure rules, IR, defense, and capital — each grounded in the actual SEC, exchange, and FINRA rules, with links to the primary source. Educational, not legal advice."
      />

      <div className="mb-6 flex gap-1 rounded-lg border border-app bg-surface p-1 text-sm">
        <button onClick={() => setView("library")} className={`rounded-md px-3.5 py-1.5 transition ${view === "library" ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"}`}>Guides</button>
        <button onClick={() => setView("glossary")} className={`rounded-md px-3.5 py-1.5 transition ${view === "glossary" ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"}`}>Glossary</button>
      </div>

      {view === "glossary" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="rounded-xl border border-app bg-surface p-4">
              <p className="text-sm font-semibold text-app">{g.term}</p>
              <p className="mt-1 text-sm text-muted">{g.def}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          {/* Track nav */}
          <div className="space-y-1">
            {TRACKS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTrack(t.key); setOpenArticle(null); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${activeTrack === t.key ? "bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-300" : "text-muted hover:bg-app-hover hover:text-app"}`}
              >
                {t.title}
              </button>
            ))}
            {feed.length > 0 && (
              <div className="mt-6 rounded-xl border border-app bg-surface p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Recent from the SEC</p>
                <ul className="space-y-2">
                  {feed.slice(0, 5).map((f, i) => (
                    <li key={i}>
                      <a href={f.link} target="_blank" rel="noreferrer" className="block text-xs leading-snug text-muted hover:text-emerald-600 dark:hover:text-emerald-300">
                        {f.title}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-faint">Live from sec.gov</p>
              </div>
            )}
          </div>

          {/* Articles */}
          <div>
            <p className="mb-4 text-sm text-muted">{track.blurb}</p>
            <div className="space-y-3">
              {track.articles.map((a) => (
                <ArticleCard key={a.id} a={a} open={openArticle === a.id} onToggle={() => setOpenArticle(openArticle === a.id ? null : a.id)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-faint">
        Educational content only — not legal or investment advice. Rules summarized here are subject to change and exceptions;
        confirm anything affecting your filings or disclosures with your securities counsel. Source links go to the official SEC,
        exchange, and FINRA materials.
      </p>
    </div>
  );
}

function ArticleCard({ a, open, onToggle }: { a: Article; open: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-app bg-surface">
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left">
        <div>
          <p className="text-sm font-semibold text-app">{a.title}</p>
          <p className="mt-1 text-sm text-muted">{a.summary}</p>
        </div>
        <span className="shrink-0 pt-1 text-faint">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-app px-5 py-4">
          {a.body.map((p, i) => (
            <p key={i} className="mb-3 text-sm leading-relaxed text-muted">{p}</p>
          ))}
          {a.checklist && (
            <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="mb-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300">DO THIS</p>
              <ul className="space-y-1.5">
                {a.checklist.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-app">
                    <span className="text-emerald-600 dark:text-emerald-400">✓</span> {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg border border-app bg-surface-2 p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Primary sources</p>
            <ul className="space-y-1">
              {a.sources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline dark:text-emerald-300">
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
