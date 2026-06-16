// Explain-the-filing: turns a bare "new 8-K filed" alert into a plain-English
// "what this filing type generally means + what to watch for" note for a retail
// investor. Self-contained fetch (does NOT touch lib/ai.ts), same template-fallback
// pattern as the other AI libs.
//
// COMPLIANCE: explains what the FORM TYPE generally covers — never interprets the
// specific contents as good/bad, never says buy/sell, never predicts price. Always
// points the reader to the actual filing on EDGAR.

const MODEL = "claude-haiku-4-5";

export interface FilingExplanation {
  plain: string;     // what this filing type generally means
  watchFor: string;  // what an investor might look for in it
  engine: "claude" | "template";
}

// Plain-English fallbacks for the common forms — used when AI is unavailable so the
// alert is still useful, and as grounding context for the model.
const FORM_HINTS: Record<string, string> = {
  "8-K": "a report of a material event (e.g. results, leadership change, agreement, or other significant development)",
  "10-Q": "the quarterly financial report (unaudited financials for the period)",
  "10-K": "the annual report (audited financials, business overview, and risk factors)",
  "S-1": "a registration statement, often for a new securities offering",
  "S-3": "a registration statement for a follow-on/shelf securities offering",
  "424B": "a prospectus describing the terms of a securities offering",
  "13D": "a disclosure that an investor acquired a >5% stake with intent to influence",
  "13G": "a disclosure of a >5% passive ownership stake",
  "DEF 14A": "the proxy statement for a shareholder vote (e.g. annual meeting items)",
  "4": "an insider transaction report (an officer/director/10% holder bought or sold)",
  "SC 13D": "a disclosure that an investor acquired a >5% stake with intent to influence",
};

function hintFor(form: string): string {
  const f = (form || "").toUpperCase().trim();
  for (const key of Object.keys(FORM_HINTS)) {
    if (f.startsWith(key)) return FORM_HINTS[key];
  }
  return "a document filed with the SEC";
}

async function haiku(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

export async function explainFiling(form: string, companyName: string, filingDate?: string): Promise<FilingExplanation> {
  const hint = hintFor(form);
  const template: FilingExplanation = {
    plain: `${companyName} filed a ${form}${filingDate ? ` on ${filingDate}` : ""} — generally ${hint}.`,
    watchFor: `Open the filing on EDGAR (sec.gov) to see the specifics. We don't interpret it for you — read the document and, if it matters to your decision, consider your own research or advisor.`,
    engine: "template",
  };

  const system =
    `You explain SEC filing TYPES to retail investors in plain English. ` +
    `Explain what this FORM TYPE generally covers and what a reader might look for when they open it. ` +
    `STRICT COMPLIANCE: explain the form type only. Do NOT speculate about the specific contents, do NOT say it is good or bad, bullish or bearish, do NOT predict the stock price, do NOT say buy/sell/hold. Always tell the reader to read the actual filing on EDGAR. ` +
    `Respond ONLY with JSON: {"plain":"1-2 sentences on what this filing type means","watchFor":"1 sentence on what to look for + read it on EDGAR"}.`;
  const user = `Company: ${companyName}. Filing form: ${form}${filingDate ? ` (filed ${filingDate})` : ""}. General context: this form is ${hint}.`;

  const ai = await haiku(system, user);
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (v.plain) {
          return {
            plain: String(v.plain).slice(0, 400),
            watchFor: String(v.watchFor ?? template.watchFor).slice(0, 400),
            engine: "claude",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return template;
}
