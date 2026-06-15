"use client";

import { useEffect, useState } from "react";

interface Kit {
  ticker: string; name: string; welcome: string; report: string;
  posts: string[]; replySnippets: string[]; emailTemplate: string; irHtmlBlock: string;
  graphics: { type: string; label: string; url: string }[];
}

export default function MarketingKit() {
  const [kit, setKit] = useState<Kit | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string>("welcome");

  useEffect(() => {
    fetch("/api/marketing-kit").then((r) => r.json()).then((d) => {
      if (d.error) setError(d.error); else setKit(d);
    }).catch(() => setError("Couldn't load your kit."));
  }, []);

  if (error) return <div className="rounded-xl border border-app bg-surface p-5 text-sm text-muted">{error}</div>;
  if (!kit) return <div className="rounded-xl border border-app bg-surface p-8 text-center text-sm text-faint">Building your kit…</div>;

  const sections = [
    { key: "welcome", icon: "🔗", title: "Your investor link", hint: "Put this everywhere" },
    { key: "posts", icon: "📣", title: "Announcement posts", hint: "AI-written, ready to publish" },
    { key: "graphics", icon: "🎨", title: "Share graphics", hint: "Social card, X header, LinkedIn banner" },
    { key: "replies", icon: "💬", title: "Reply snippets", hint: "Drop these on StockTwits / iHub" },
    { key: "email", icon: "✉️", title: "Investor email + website button", hint: "Send to your shareholder list" },
  ];

  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <div key={s.key} className="overflow-hidden rounded-xl border border-app bg-surface">
          <button onClick={() => setOpen(open === s.key ? "" : s.key)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-app-hover">
            <span className="text-xl">{s.icon}</span>
            <span className="flex-1">
              <span className="block font-semibold text-app">{s.title}</span>
              <span className="block text-xs text-muted">{s.hint}</span>
            </span>
            <span className="text-faint">{open === s.key ? "−" : "+"}</span>
          </button>
          {open === s.key && <div className="border-t border-app px-5 py-4">{renderSection(s.key, kit)}</div>}
        </div>
      ))}
    </div>
  );
}

function renderSection(key: string, kit: Kit) {
  if (key === "welcome") {
    return (
      <div>
        <p className="mb-2 text-sm text-muted">Share this link in your X/LinkedIn bio, email signature, earnings deck, and website. It&apos;s the front door for your investors.</p>
        <CopyBox text={kit.welcome} />
      </div>
    );
  }
  if (key === "posts") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">AI-written in your company&apos;s voice. Copy, tweak if you like, and post.</p>
        {kit.posts.map((p, i) => <CopyBox key={i} text={p} multiline />)}
      </div>
    );
  }
  if (key === "graphics") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Right-click → Save image, or use the URL directly. Auto-branded with your ticker.</p>
        {kit.graphics.map((g) => (
          <div key={g.type}>
            <p className="mb-1 text-xs font-medium text-app">{g.label}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.url} alt={g.label} className="w-full rounded-lg border border-app" />
            <a href={g.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-emerald-600 hover:underline dark:text-emerald-400">Open / download →</a>
          </div>
        ))}
      </div>
    );
  }
  if (key === "replies") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">When investors are guessing about you on StockTwits or iHub, drop one of these to pull them to the real answer.</p>
        {kit.replySnippets.map((r, i) => <CopyBox key={i} text={r} />)}
      </div>
    );
  }
  if (key === "email") {
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-app">Investor announcement email</p>
          <CopyBox text={kit.emailTemplate} multiline />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-app">Website button (paste into your IR page)</p>
          <CopyBox text={kit.irHtmlBlock} multiline />
        </div>
      </div>
    );
  }
  return null;
}

function CopyBox({ text, multiline }: { text: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select manually */ }
  };
  return (
    <div className="rounded-lg border border-app bg-surface-2 p-3">
      <p className={`text-sm text-app ${multiline ? "whitespace-pre-wrap" : "truncate"}`}>{text}</p>
      <button onClick={copy} className="mt-2 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500">
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
