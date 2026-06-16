// Renders a Sponsored Research Brief's markdown as a styled, theme-aware document
// with a sticky table-of-contents (built from ## headings) and section anchors.
// Self-contained mini-markdown (## / ### headings, **bold**, - and 1. lists,
// > blockquotes, markdown tables, paragraphs) — no markdown dependency.

import { Fragment } from "react";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

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

function isTableRow(line: string) {
  return /^\s*\|.*\|\s*$/.test(line);
}
function isTableDivider(line: string) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}
function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

export default function BriefView({ markdown }: { markdown: string }) {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");

  // First pass: collect the ## headings for the table of contents.
  const toc: { id: string; text: string }[] = [];
  for (const raw of lines) {
    const m = raw.match(/^##\s+(?!#)(.*)$/);
    if (m) {
      const text = m[1].trim();
      toc.push({ id: slugify(text), text });
    }
  }

  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = (key: string) => {
    if (para.length) {
      const text = para.join(" ");
      blocks.push(
        <p key={key} className="text-[15px] leading-7 text-muted">
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
        <Tag key={key} className={`${cls} space-y-1.5 pl-5 text-[15px] leading-7 text-muted`}>
          {list.items.map((it, i) => (
            <li key={`${key}-i${i}`}>{inline(it, `${key}-i${i}`)}</li>
          ))}
        </Tag>
      );
    }
    list = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trimEnd();
    const k = `b${idx}`;

    if (!line.trim()) {
      flushPara(k);
      flushList(k);
      continue;
    }

    // Markdown table: header row + divider + body rows.
    if (isTableRow(line) && idx + 1 < lines.length && isTableDivider(lines[idx + 1])) {
      flushPara(k);
      flushList(k);
      const header = splitRow(line);
      const rows: string[][] = [];
      idx += 2; // skip header + divider
      while (idx < lines.length && isTableRow(lines[idx])) {
        rows.push(splitRow(lines[idx]));
        idx++;
      }
      idx--; // step back; loop will increment
      blocks.push(
        <div key={k} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-app">
                {header.map((h, i) => (
                  <th key={`${k}-h${i}`} className="px-3 py-2 font-semibold text-app">
                    {inline(h, `${k}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={`${k}-r${ri}`} className="border-b border-app/60">
                  {r.map((c, ci) => (
                    <td key={`${k}-r${ri}c${ci}`} className="px-3 py-2 align-top text-muted">
                      {inline(c, `${k}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const h2 = line.match(/^##\s+(?!#)(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const h1 = line.match(/^#\s+(?!#)(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);

    if (h2) {
      flushPara(k);
      flushList(k);
      const txt = h2[1].trim();
      const id = slugify(txt);
      blocks.push(
        <h2 key={k} id={id} className="scroll-mt-24 border-b border-app pb-2 pt-4 text-xl font-bold tracking-tight text-app first:pt-0">
          {inline(txt, k)}
        </h2>
      );
      continue;
    }
    if (h3 || h1) {
      flushPara(k);
      flushList(k);
      const txt = (h3?.[1] ?? h1?.[1] ?? "").trim();
      blocks.push(
        <h3 key={k} className="mt-2 text-base font-semibold text-app">
          {inline(txt, k)}
        </h3>
      );
      continue;
    }
    if (quote) {
      flushPara(k);
      flushList(k);
      blocks.push(
        <blockquote key={k} className="rounded-r-lg border-l-4 border-emerald-500/50 bg-surface-2/50 px-4 py-2 text-sm italic text-muted">
          {inline(quote[1].trim(), k)}
        </blockquote>
      );
      continue;
    }
    if (ul || ol) {
      flushPara(k);
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList(k);
        list = { ordered, items: [] };
      }
      list.items.push((ul?.[1] ?? ol?.[1] ?? "").trim());
      continue;
    }
    // plain paragraph line
    flushList(k);
    para.push(line.trim());
  }
  flushPara("end-p");
  flushList("end-l");

  return (
    <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
      {/* Sticky table of contents */}
      {toc.length > 1 && (
        <nav className="mb-6 lg:mb-0">
          <div className="lg:sticky lg:top-20">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-faint">Contents</p>
            <ol className="space-y-1.5 border-l border-app pl-3 text-sm">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="block text-muted transition hover:text-emerald-600 dark:hover:text-emerald-400">
                    {t.text}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
      )}
      <div className="min-w-0 space-y-3">{blocks}</div>
    </div>
  );
}
