// Renders a Sponsored Research Brief's markdown as styled, theme-aware content.
// Self-contained mini-markdown (## / ### headings, **bold**, - and 1. lists,
// paragraphs) so we don't pull in a markdown dependency. Used by the public
// sample page and the ticker report.

import { Fragment } from "react";

function inline(text: string, keyBase: string) {
  // **bold** → <strong>. Split on the bold delimiters, alternate plain/bold.
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyBase}-b${i}`} className="font-semibold text-app">
        {p}
      </strong>
    ) : (
      <Fragment key={`${keyBase}-t${i}`}>{p}</Fragment>
    )
  );
}

export default function BriefView({ markdown }: { markdown: string }) {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = (key: string) => {
    if (para.length) {
      const text = para.join(" ");
      blocks.push(
        <p key={key} className="text-sm leading-relaxed text-muted">
          {inline(text, key)}
        </p>
      );
      para = [];
    }
  };
  const flushList = (key: string) => {
    if (list && list.items.length) {
      const Tag = list.ordered ? "ol" : "ul";
      const cls = list.ordered ? "list-decimal" : "list-disc";
      blocks.push(
        <Tag key={key} className={`${cls} space-y-1 pl-5 text-sm leading-relaxed text-muted`}>
          {list.items.map((it, i) => (
            <li key={`${key}-i${i}`}>{inline(it, `${key}-i${i}`)}</li>
          ))}
        </Tag>
      );
    }
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const k = `b${idx}`;
    if (!line.trim()) {
      flushPara(k);
      flushList(k);
      return;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);

    if (h2 || h3 || h1) {
      flushPara(k);
      flushList(k);
      const txt = (h2?.[1] ?? h3?.[1] ?? h1?.[1] ?? "").trim();
      blocks.push(
        <h3 key={k} className="mt-6 text-base font-bold text-app first:mt-0">
          {inline(txt, k)}
        </h3>
      );
      return;
    }
    if (ul || ol) {
      flushPara(k);
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList(k);
        list = { ordered, items: [] };
      }
      list.items.push((ul?.[1] ?? ol?.[1] ?? "").trim());
      return;
    }
    // plain paragraph line
    flushList(k);
    para.push(line.trim());
  });
  flushPara("end-p");
  flushList("end-l");

  return <div className="space-y-3">{blocks}</div>;
}
