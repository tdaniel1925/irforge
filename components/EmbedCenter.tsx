"use client";

import { useState } from "react";

const SITE = "https://pubcozone.com";

export default function EmbedCenter({ ticker }: { ticker: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : SITE;
  const embeds = [
    {
      key: "grade",
      title: "Visibility Grade badge",
      desc: "Your live PubcoZone grade. Great in a footer or IR header.",
      preview: <img src={`${origin}/api/badge/${ticker}.svg`} alt="grade" width={248} height={60} />,
      snippet: `<a href="${SITE}/t/${ticker}" target="_blank" rel="noopener"><img src="${SITE}/api/badge/${ticker}.svg" alt="PubcoZone Visibility Grade for $${ticker}" width="248" height="60"></a>`,
    },
    {
      key: "price",
      title: "Live price chip",
      desc: "Auto-updating price + change. The most-asked-for IR-site element.",
      preview: <img src={`${origin}/api/badge/${ticker}/price`} alt="price" width={230} height={44} />,
      snippet: `<a href="${SITE}/t/${ticker}" target="_blank" rel="noopener"><img src="${SITE}/api/badge/${ticker}/price" alt="$${ticker} live price" width="230" height="44"></a>`,
    },
    {
      key: "verified",
      title: "Verified-by-PubcoZone seal",
      desc: "A trust mark showing your page is claimed and verified.",
      preview: <img src={`${origin}/api/badge/${ticker}/verified`} alt="verified" width={230} height={56} />,
      snippet: `<a href="${SITE}/t/${ticker}" target="_blank" rel="noopener"><img src="${SITE}/api/badge/${ticker}/verified" alt="Verified by PubcoZone" width="230" height="56"></a>`,
    },
    {
      key: "snapshot",
      title: "Stock snapshot card",
      desc: "Price, sparkline, and key stats in one card. A mini investor dashboard.",
      preview: <iframe src={`${origin}/embed/snapshot/${ticker}`} title="snapshot" width={340} height={250} style={{ border: 0, borderRadius: 14 }} />,
      snippet: `<iframe src="${SITE}/embed/snapshot/${ticker}" width="340" height="250" style="border:0;border-radius:14px" title="$${ticker} snapshot"></iframe>`,
    },
    {
      key: "hub",
      title: "Full investor hub",
      desc: "Your entire investor page — price, stats, filings, chart — embedded on your own domain.",
      preview: <iframe src={`${origin}/embed/hub/${ticker}`} title="hub" width="100%" height={420} style={{ border: "1px solid var(--c-border)", borderRadius: 14 }} />,
      snippet: `<iframe src="${SITE}/embed/hub/${ticker}" width="100%" height="900" style="border:0" title="$${ticker} investor hub"></iframe>`,
    },
  ];

  return (
    <div className="space-y-4">
      {embeds.map(({ key, ...e }) => (
        <EmbedRow key={key} {...e} />
      ))}
      <p className="text-xs text-faint">
        All embeds pull live public data and update themselves. Each links back to your PubcoZone page.
      </p>
    </div>
  );
}

function EmbedRow({ title, desc, preview, snippet }: { title: string; desc: string; preview: React.ReactNode; snippet: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user can select manually */
    }
  };

  return (
    <div className="rounded-2xl border border-app bg-surface p-5">
      <div className="mb-3">
        <h3 className="font-semibold text-app">{title}</h3>
        <p className="text-sm text-muted">{desc}</p>
      </div>
      <div className="mb-3 flex justify-center overflow-hidden rounded-lg bg-surface-2 p-4">{preview}</div>
      <code className="block max-w-full overflow-x-auto whitespace-nowrap rounded-lg border border-app bg-surface-2 px-3 py-2 text-[11px] text-muted">
        {snippet}
      </code>
      <button onClick={copy} className="mt-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500">
        {copied ? "Copied ✓" : "Copy embed code"}
      </button>
    </div>
  );
}
