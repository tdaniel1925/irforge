// Filing Change Detector — "what changed since the last filing?"
//
// Deterministic period-over-period diffs of key XBRL facts from SEC companyfacts
// (cash, revenue, net income, shares outstanding), plus an optional Haiku-written
// plain-English summary with a mandatory template fallback. Everything here is the
// public record restated — no predictions, no advice, no interpretation beyond
// arithmetic.

export interface MetricChange {
  metric: string;
  prev: number;
  prevAsOf: string;
  latest: number;
  latestAsOf: string;
  pctChange: number | null; // null when prev is 0
}

export interface FilingDiff {
  ticker: string;
  companyName: string;
  changes: MetricChange[];
  summary: string;
  engine: "claude" | "template";
}

const UA = { "User-Agent": "PubcoZone research contact@pubcozone.com" };

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function resolveCik(ticker: string): Promise<{ cik: string; name: string } | null> {
  const raw = await getJson("https://www.sec.gov/files/company_tickers.json");
  const T = ticker.toUpperCase();
  for (const k of Object.keys(raw ?? {})) {
    const row = raw[k];
    if (String(row?.ticker).toUpperCase() === T) {
      return { cik: String(row.cik_str).padStart(10, "0"), name: String(row.title ?? T) };
    }
  }
  return null;
}

type FactPoint = { val: number; end: string; fy?: string; fp?: string; form?: string };

function series(fact: any): FactPoint[] {
  const units = fact?.units ?? {};
  const arr: any[] = units.USD ?? units.shares ?? units[Object.keys(units)[0] ?? ""] ?? [];
  return arr
    .filter((u) => typeof u?.val === "number" && u?.end)
    .sort((a, b) => String(a.end).localeCompare(String(b.end)));
}

// Latest two DISTINCT period-end values (deduped — the same period is often
// re-reported across several filings).
function latestTwo(fact: any): [FactPoint, FactPoint] | null {
  const pts = series(fact);
  const byEnd = new Map<string, FactPoint>();
  for (const p of pts) byEnd.set(p.end, p); // last write wins (amended values)
  const uniq = Array.from(byEnd.values()).sort((a, b) => a.end.localeCompare(b.end));
  if (uniq.length < 2) return null;
  return [uniq[uniq.length - 2], uniq[uniq.length - 1]];
}

function change(metric: string, pair: [FactPoint, FactPoint] | null): MetricChange | null {
  if (!pair) return null;
  const [prev, latest] = pair;
  return {
    metric,
    prev: prev.val,
    prevAsOf: prev.end,
    latest: latest.val,
    latestAsOf: latest.end,
    pctChange: prev.val !== 0 ? ((latest.val - prev.val) / Math.abs(prev.val)) * 100 : null,
  };
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `$${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `$${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `$${(abs / 1e3).toFixed(0)}K` : `$${abs.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
}
function fmtShares(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString();
}

function templateSummary(changes: MetricChange[]): string {
  if (changes.length === 0) return "No comparable period-over-period figures found in the structured filings yet.";
  return changes
    .map((c) => {
      const fmt = c.metric === "Shares outstanding" ? fmtShares : fmtMoney;
      const dir = c.latest > c.prev ? "up" : c.latest < c.prev ? "down" : "unchanged";
      const pct = c.pctChange !== null ? ` (${c.pctChange > 0 ? "+" : ""}${c.pctChange.toFixed(1)}%)` : "";
      return `${c.metric}: ${fmt(c.latest)} as of ${c.latestAsOf}, ${dir} from ${fmt(c.prev)}${pct}.`;
    })
    .join(" ");
}

export async function computeFilingDiff(ticker: string): Promise<FilingDiff | null> {
  const co = await resolveCik(ticker);
  if (!co) return null;

  const data = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${co.cik}.json`);
  const gaap = data?.facts?.["us-gaap"] ?? {};
  const dei = data?.facts?.dei ?? {};

  const changes = [
    change("Cash & equivalents",
      latestTwo(gaap.CashAndCashEquivalentsAtCarryingValue) ??
      latestTwo(gaap.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents) ??
      latestTwo(gaap.Cash)),
    change("Revenue",
      latestTwo(gaap.Revenues) ??
      latestTwo(gaap.RevenueFromContractWithCustomerExcludingAssessedTax)),
    change("Net income (loss)", latestTwo(gaap.NetIncomeLoss)),
    change("Shares outstanding", latestTwo(dei.EntityCommonStockSharesOutstanding)),
  ].filter(Boolean) as MetricChange[];

  // Plain-English restatement of the arithmetic above. Haiku when available;
  // the deterministic template ALWAYS works and is the guard-fallback.
  const template = templateSummary(changes);
  let summary = template;
  let engine: FilingDiff["engine"] = "template";

  const key = process.env.ANTHROPIC_API_KEY;
  if (key && changes.length > 0) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 220,
          system:
            "You restate SEC filing figures in plain English for investors. STRICT: use the pre-formatted values " +
            "EXACTLY as given — never convert units or re-round them. Never predict, never advise, never say " +
            "good/bad/undervalued/opportunity, never speculate on causes. 2-3 neutral sentences describing what " +
            "changed between the two periods. No preamble.",
          messages: [{
            role: "user",
            // Pre-formatted so the model can't misread raw dollars as millions.
            content: `Company: ${co.name}. Period-over-period changes:\n` + changes.map((c) => {
              const f = c.metric === "Shares outstanding" ? fmtShares : fmtMoney;
              const pct = c.pctChange !== null ? ` (${c.pctChange > 0 ? "+" : ""}${c.pctChange.toFixed(1)}%)` : "";
              return `- ${c.metric}: ${f(c.prev)} as of ${c.prevAsOf} -> ${f(c.latest)} as of ${c.latestAsOf}${pct}`;
            }).join("\n"),
          }],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const text: string | undefined = d?.content?.[0]?.text?.trim();
        // Same drift guard as the radar caption — advice-y words fall back to template.
        if (text && !/\b(buy|sell|undervalued|overvalued|opportunity|bullish|bearish|expect|likely|should)\b/i.test(text)) {
          summary = text;
          engine = "claude";
        }
      }
    } catch {
      /* template already set */
    }
  }

  return { ticker: ticker.toUpperCase(), companyName: co.name, changes, summary, engine };
}
