import type { Company, Filing, Mention } from "./types";
import type { TickerAudit } from "./audit";

// AI drafting layer.
// With ANTHROPIC_API_KEY set, drafts are written by Claude.
// Without it, deterministic templates keep the entire app fully functional offline.

const MODEL = "claude-sonnet-4-6";

async function claude(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = (c: Company) =>
  `You write X (Twitter) threads for ${c.name} ($${c.ticker}), a public company. ` +
  `STRICT RULES: Use ONLY facts provided. Never predict stock price, never use words like "undervalued", ` +
  `never give investment advice, never guarantee outcomes. Plain, factual, confident tone. ` +
  `Cite the SEC filing as the source. Return ONLY the tweets, one per line, separated by a blank line, max 270 chars each, 3-4 tweets.`;

function parseTweets(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((t) => t.replace(/^\d+[\/.).]\s*/, "").trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

// The model sometimes refuses or pushes back when the source material is wrong/missing
// ("I don't have access...", "I can't write...", "this filing is from Apple not...",
// "would be factually false", "securities fraud"). Detect ANY of that across the whole
// response so a refusal never reaches a customer as a "tweet".
function isRefusal(text: string): boolean {
  return /\b(I don'?t have|I can'?t (write|create|draft)|I'?m (not able|unable)|I need to flag|no actual (facts|content|information)|only its title|factually false|misleading to investors|securities fraud|market manipulation|not\s+\$?\w+|the filing (you )?provided is from|share the correct filing)\b/i.test(text);
}

export async function generateFilingThread(
  filing: Filing,
  company: Company
): Promise<{ tweets: string[]; engine: "claude" | "template" }> {
  const ai = await claude(
    SYSTEM_PROMPT(company),
    `Write a thread announcing this ${filing.form} filing.\nTitle: ${filing.title}\nFiled: ${filing.filedAt.slice(0, 10)}\n` +
      (filing.fullText
        ? `Full disclosure text (use only facts found here):\n${filing.fullText.slice(0, 4000)}`
        : `You may not have the document body — that's fine. Write a brief, factual announcement that the company filed this ${filing.form} ("${filing.title}") with the SEC, note what that form type generally covers, and point readers to the full filing on EDGAR. Do NOT refuse, do NOT say you lack information — just announce the filing professionally.`)
  );
  if (ai && !isRefusal(ai)) return { tweets: parseTweets(ai), engine: "claude" };

  return {
    engine: "template",
    tweets: [
      `New ${filing.form} filed: ${filing.title}. Here's what's in it. 🧵 $${company.ticker}`,
      `${filing.summary}`,
      `The complete filing is available on EDGAR (sec.gov, ticker ${company.ticker}, ${filing.form} dated ${filing.filedAt.slice(0, 10)}). Questions? Ask below — we answer from the public record.`,
    ],
  };
}

export async function generateCadencePost(
  company: Company,
  recentTitles: string[]
): Promise<{ tweets: string[]; engine: "claude" | "template"; title: string }> {
  const ai = await claude(
    SYSTEM_PROMPT(company),
    `Write an educational "between-news" thread about the company or its sector (${company.sector}). ` +
      `Company description: ${company.description}. Avoid repeating these recent topics: ${recentTitles.join("; ") || "none"}.`
  );
  if (ai && !isRefusal(ai)) return { tweets: parseTweets(ai), engine: "claude", title: "Cadence: educational thread" };

  return {
    engine: "template",
    title: "Cadence: company explainer",
    tweets: [
      `What does ${company.name} actually do? A plain-English explainer for new shareholders. 🧵 $${company.ticker}`,
      `${company.description}`,
      `Everything we share comes from our public SEC filings — the complete record is on EDGAR under ${company.ticker}. New here? Start with our latest annual report.`,
    ],
  };
}

// Plain-English explainer for the public ticker pages.
// Grounded strictly in what the live audit observed — never invents facts.
export async function generateTickerExplainer(audit: TickerAudit): Promise<{ text: string; engine: "claude" | "template" }> {
  const facts = [
    audit.companyName ? `Company: ${audit.companyName} ($${audit.ticker})` : `Ticker: $${audit.ticker}`,
    audit.filings.last12mo ? `${audit.filings.last12mo} SEC filings in the last 12 months; latest ${audit.filings.lastForm} on ${audit.filings.lastFilingDate}` : "No recent SEC filings found",
    typeof audit.social.watchers === "number" ? `${audit.social.watchers.toLocaleString()} StockTwits watchers` : "",
    audit.news.articles30d ? `${audit.news.articles30d} news articles in the last 30 days` : "",
    typeof audit.market.price === "number" ? `Share price ~$${audit.market.price}${typeof audit.market.changePct3mo === "number" ? `, ${audit.market.changePct3mo >= 0 ? "+" : ""}${audit.market.changePct3mo.toFixed(1)}% over 3 months` : ""}` : "",
  ].filter(Boolean);

  const ai = await claude(
    `You write neutral, factual stock-page summaries. STRICT RULES: use ONLY the facts provided — no speculation, no opinions on valuation, no investment advice, no predictions. If facts are thin, say what is and isn't known. 3-4 plain sentences for a retail investor. Do not recommend buying or selling.`,
    `Write a short neutral overview paragraph from these observed facts:\n${facts.join("\n")}`
  );
  if (ai) return { text: ai.trim(), engine: "claude" };

  return {
    engine: "template",
    text:
      `${audit.companyName ?? `$${audit.ticker}`} is an SEC-registered company` +
      (audit.filings.last12mo ? ` with ${audit.filings.last12mo} filings in the last 12 months (most recently a ${audit.filings.lastForm} on ${audit.filings.lastFilingDate}).` : ".") +
      (typeof audit.social.watchers === "number" ? ` ${audit.social.watchers.toLocaleString()} investors watch the ticker on StockTwits.` : "") +
      (audit.news.articles30d ? ` ${audit.news.articles30d} news articles mentioned the company in the last 30 days.` : "") +
      ` All figures are drawn live from public sources — verify anything important against the company's SEC filings.`,
  };
}

// Reg FD guard: questions that fish for non-public information get a safe deflection.
const NON_PUBLIC_PATTERNS =
  /(guidance|forecast|projection|in talks|negotiat|acquisition|merger|buyout|when will you (announce|sign|close)|offtake.*(sign|close|new)|partner(ship)? (talks|discussions)|insider|upcoming (deal|news)|price target)/i;

export function questionNeedsNonPublicInfo(question: string): boolean {
  return NON_PUBLIC_PATTERNS.test(question);
}

export async function generatePublicAnswer(
  question: string,
  asker: string,
  company: Company,
  publicContext: string
): Promise<{ tweets: string[]; engine: "claude" | "template"; deflected: boolean }> {
  if (questionNeedsNonPublicInfo(question)) {
    return {
      engine: "template",
      deflected: true,
      tweets: [
        `Q from ${asker}: "${question.slice(0, 120)}" — We can only speak to our public filings; answering this would require non-public information. Any updates will come through official disclosures first. $${company.ticker}`,
      ],
    };
  }
  const ai = await claude(
    SYSTEM_PROMPT(company),
    `An investor named ${asker} asked on our public page: "${question}". ` +
      `Write ONE tweet-length answer (max 270 chars) using ONLY this public information: ${publicContext}. ` +
      `Start with 'Q: ' and a short restatement, then the answer. If the public record doesn't answer it, say so and point to EDGAR.`
  );
  if (ai) return { tweets: parseTweets(ai).slice(0, 2), engine: "claude", deflected: false };

  return {
    engine: "template",
    deflected: false,
    tweets: [
      `Q from ${asker}: "${question.slice(0, 100)}" — Our most recent filings address this: ${publicContext.slice(0, 140)} Full detail on EDGAR under $${company.ticker}.`,
    ],
  };
}

// Flags label posts by signal quality instead of silently blocking them — the reader filters.
// Only "abuse" (threats/doxxing/explicit pump-and-dump coordination) is hard-blocked.
export type PostFlag = "factual" | "opinion" | "hype" | "fud" | "chatter" | "abuse";

export interface ModerationVerdict {
  flag: PostFlag;
  block: boolean; // true only for genuinely illegal/abusive content
  reason: string;
  engine: "claude" | "rules";
}

const VALID_FLAGS: PostFlag[] = ["factual", "opinion", "hype", "fud", "chatter", "abuse"];

export async function moderateBoardPost(text: string): Promise<ModerationVerdict> {
  const ai = await claude(
    `You label posts on a compliance-first stock message board by SIGNAL QUALITY. You do NOT censor opinions — you label them so readers can filter. ` +
      `Choose ONE flag: ` +
      `"factual" = states/cites a fact, filing, number, or news; ` +
      `"opinion" = a reasoned bull OR bear take, even strongly negative, as long as it gives a basis; ` +
      `"hype" = pump language with no substance ("about to rip", "easy multibagger", "load up", price targets); ` +
      `"fud" = bearish claims with NO factual support, or fear-mongering designed to scare holders ("scam", "get out now") without evidence; ` +
      `"chatter" = off-topic or low-signal; ` +
      `"abuse" = threats, doxxing, slurs, or explicit pump-and-dump coordination — this is the ONLY flag that should be blocked. ` +
      `A reasoned bearish take is "opinion", NOT "fud" — only baseless fear is "fud". ` +
      `Respond with ONLY JSON: {"flag": "...", "reason": "one short sentence explaining the flag"}.`,
    `Label this post: "${text}"`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        const flag: PostFlag = VALID_FLAGS.includes(v.flag) ? v.flag : "chatter";
        return { flag, block: flag === "abuse", reason: String(v.reason ?? "").slice(0, 200), engine: "claude" };
      }
    } catch {
      /* fall through */
    }
  }
  // Without AI: everything that cleared the keyword filter is unlabeled chatter.
  return { flag: "chatter", block: false, reason: "Posted without AI labeling (no key).", engine: "rules" };
}

// Drafts a calm, factual, filing-cited rebuttal to a detected threat. Never attacks back —
// just answers with the public record, which is what neutralizes baseless FUD.
export async function generateRebuttal(
  threatTitle: string,
  evidence: string | undefined,
  company: Company,
  publicContext: string
): Promise<{ tweets: string[]; engine: "claude" | "template" }> {
  const ai = await claude(
    SYSTEM_PROMPT(company),
    `A negative narrative about us needs a calm, factual response. The concern: "${threatTitle}".` +
      (evidence ? ` The specific claim: "${evidence}".` : "") +
      ` Write a 1-2 tweet response that corrects the record using ONLY this public information: ${publicContext}. ` +
      `Do NOT attack the critic. Do NOT make claims beyond the filings. Lead with the fact, cite the filing, stay measured.`
  );
  if (ai) return { tweets: parseTweets(ai).slice(0, 2), engine: "claude" };

  return {
    engine: "template",
    tweets: [
      `On recent questions about $${company.ticker}: the facts are in our filings. ${publicContext.slice(0, 160)} Full detail on EDGAR. We're always happy to answer from the public record.`,
    ],
  };
}

// Press release builder — AP-style, compliant, safe-harbor language baked in.
export async function generatePressRelease(
  topic: string,
  company: Company,
  publicContext: string
): Promise<{ headline: string; dateline: string; body: string; engine: "claude" | "template" }> {
  const dateline = `${company.city ?? "CITY"}, ${company.state ?? "STATE"} — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  const ai = await claude(
    `You are an IR communications writer for ${company.name} ($${company.ticker}). Write a professional, AP-style press release. ` +
      `STRICT: use ONLY facts provided; no price predictions, no "undervalued", no investment advice, no guarantees. ` +
      `Structure: HEADLINE (one line, SEO + factual), then the body with a dateline lede paragraph (who/what/where/when/why), 2-3 body paragraphs, an optional brief CEO quote that stays factual, and a standard boilerplate "About" paragraph. ` +
      `Return as: first line = headline only; then a blank line; then the full body.`,
    `Write a press release about: "${topic}".\nCompany: ${company.description}\nRelevant public facts: ${publicContext}\nDateline city/date to use: ${dateline}`
  );
  if (ai && !isRefusal(ai)) {
    const lines = ai.split(/\n/);
    const headline = lines[0].replace(/^#+\s*/, "").trim();
    const body = lines.slice(1).join("\n").trim();
    return { headline, dateline, body, engine: "claude" };
  }
  return {
    engine: "template",
    headline: `${company.name} Provides Update on ${topic}`,
    dateline,
    body: `${dateline} — ${company.name} ($${company.ticker}) today provided an update regarding ${topic}.\n\n${publicContext.slice(0, 300)}\n\nAbout ${company.name}: ${company.description}\n\nForward-looking statements: This release contains forward-looking statements subject to risks described in the company's SEC filings.`,
  };
}

// 8-K / disclosure helper — drafting assistant, NOT legal advice.
export async function checkDisclosure(
  event: string,
  company: Company
): Promise<{ likelyMaterial: boolean; form: string; reasoning: string; draftLanguage: string; engine: "claude" | "template" }> {
  const ai = await claude(
    `You are an IR drafting assistant for a US public company. You are NOT a lawyer and must NOT give legal advice — you flag whether an event is the KIND of thing that is commonly disclosed on a Form 8-K, suggest the likely item number, and draft starter language the company will review with counsel. ` +
      `Common 8-K items: 1.01 material agreement, 1.02 termination of agreement, 2.02 results of operations, 3.02 unregistered equity sales, 5.02 director/officer changes, 7.01 Reg FD disclosure, 8.01 other events. ` +
      `Return ONLY JSON: {"likelyMaterial": boolean, "form": "8-K Item X.XX or 'likely not 8-K-triggering'", "reasoning": "2 sentences, plain English", "draftLanguage": "a short starter paragraph for the filing"}.`,
    `Event the company is considering: "${event}". Company: ${company.name} ($${company.ticker}), ${company.sector}.`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        return {
          likelyMaterial: Boolean(v.likelyMaterial),
          form: String(v.form ?? "").slice(0, 60),
          reasoning: String(v.reasoning ?? "").slice(0, 400),
          draftLanguage: String(v.draftLanguage ?? "").slice(0, 800),
          engine: "claude",
        };
      }
    } catch {
      /* fall through */
    }
  }
  return {
    engine: "template",
    likelyMaterial: true,
    form: "Possibly 8-K — confirm with counsel",
    reasoning: "Many corporate events of this type are disclosed on a Form 8-K. Confirm materiality and timing with your securities counsel.",
    draftLanguage: `On [date], ${company.name} [describe the event]. [Add the material terms and any financial impact here.]`,
  };
}

// Document analyzer — summarize, extract terms, flag risks, and assess disclosure impact.
export async function analyzeDocument(
  docName: string,
  text: string,
  company: Company
): Promise<{ summary: string; keyTerms: { label: string; value: string }[]; risks: string[]; disclosureTrigger: string; engine: "claude" | "template" }> {
  const ai = await claude(
    `You are an IR/finance analyst assistant for ${company.name} ($${company.ticker}). You are NOT a lawyer — flag, don't adjudicate. ` +
      `Analyze a document and return ONLY JSON: {"summary":"3-4 sentences plain English","keyTerms":[{"label":"...","value":"..."}],"risks":["..."],"disclosureTrigger":"Likely 8-K Item X.XX — confirm with counsel | Probably not 8-K-triggering"}. ` +
      `keyTerms = the most material specifics (amounts, dates, parties, rates, conversion terms). risks = what the company should watch. Be concrete.`,
    `Document: "${docName}"\nContents:\n${text.slice(0, 6000)}`
  );
  // No isRefusal() check here — this returns JSON whose risk text legitimately contains
  // words like "misleading"/"not" that would false-positive the refusal guard. A genuine
  // refusal simply won't parse as our JSON shape and falls through to the template.
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (v.summary || v.keyTerms || v.risks) {
          return {
            summary: String(v.summary ?? "").slice(0, 800),
            keyTerms: Array.isArray(v.keyTerms) ? v.keyTerms.slice(0, 12).map((t: { label?: string; value?: string }) => ({ label: String(t.label ?? "").slice(0, 60), value: String(t.value ?? "").slice(0, 120) })) : [],
            risks: Array.isArray(v.risks) ? v.risks.slice(0, 8).map((r: string) => String(r).slice(0, 200)) : [],
            disclosureTrigger: String(v.disclosureTrigger ?? "Review with counsel").slice(0, 120),
            engine: "claude",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return {
    engine: "template",
    summary: `${docName}: AI analysis is unavailable right now (no API key or the model declined). The document text was captured for your records.`,
    keyTerms: [],
    risks: ["AI analysis unavailable — review manually with counsel."],
    disclosureTrigger: "Review with counsel",
  };
}

// Labeled AI analyst content for public ticker pages — a balanced bull/bear take and
// a few FAQ answers drawn ONLY from observed public data. ALWAYS shown as AI (badged),
// never as a human persona. This is SEO-valuable substance, not fabricated chatter.
import type { TickerAudit as TA } from "./audit";

export interface AnalystContent {
  bull: string;
  bear: string;
  faq: { q: string; a: string }[];
  engine: "claude" | "template";
}

export async function generateAnalystContent(audit: TA): Promise<AnalystContent> {
  const facts = [
    audit.companyName ? `${audit.companyName} ($${audit.ticker})` : `$${audit.ticker}`,
    typeof audit.market.price === "number" ? `Price ~$${audit.market.price}${typeof audit.market.changePct3mo === "number" ? `, ${audit.market.changePct3mo.toFixed(1)}% over 3mo` : ""}` : "",
    audit.filings.last12mo ? `${audit.filings.last12mo} SEC filings in 12mo; latest ${audit.filings.lastForm} ${audit.filings.lastFilingDate}` : "",
    typeof audit.fundamentals?.cash === "number" ? `Cash $${(audit.fundamentals.cash / 1e6).toFixed(1)}M` : "",
    typeof audit.fundamentals?.runwayQuarters === "number" ? `~${audit.fundamentals.runwayQuarters.toFixed(1)} quarters runway` : "",
    typeof audit.fundamentals?.sharesChangePct1y === "number" ? `share count ${audit.fundamentals.sharesChangePct1y >= 0 ? "+" : ""}${audit.fundamentals.sharesChangePct1y.toFixed(0)}% in 1yr` : "",
    audit.shortData ? `${audit.shortData.shortPct.toFixed(0)}% of daily volume short` : "",
    audit.insiders ? `${audit.insiders.buys} insider buys / ${audit.insiders.sells} sells (180d)` : "",
    audit.news.articles30d ? `${audit.news.articles30d} news articles in 30d` : "",
  ].filter(Boolean).join(". ");

  const ai = await claude(
    `You are a neutral AI equity analyst. Using ONLY the data provided, write a balanced view of a stock for a public ticker page. ` +
      `No price predictions, no "buy/sell", no "undervalued", no hype. Be specific and factual. ` +
      `Also answer 3 FAQ questions investors commonly ask, each from the data (if the data doesn't answer one, say what's publicly knowable and point to EDGAR). ` +
      `Return ONLY JSON: {"bull":"2-3 sentence bull case from the facts","bear":"2-3 sentence bear/risk case from the facts","faq":[{"q":"...","a":"..."},{"q":"...","a":"..."},{"q":"...","a":"..."}]}`,
    `Company data: ${facts}`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (v.bull && v.bear) {
          return {
            bull: String(v.bull).slice(0, 600),
            bear: String(v.bear).slice(0, 600),
            faq: Array.isArray(v.faq) ? v.faq.slice(0, 4).map((f: { q?: string; a?: string }) => ({ q: String(f.q ?? "").slice(0, 160), a: String(f.a ?? "").slice(0, 500) })) : [],
            engine: "claude",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return {
    engine: "template",
    bull: `${audit.companyName ?? `$${audit.ticker}`} files regularly with the SEC and has public data available for analysis. Review the latest filings on EDGAR for the current picture.`,
    bear: `As with any small-cap, key risks include cash runway, dilution, and execution. Confirm the latest figures in the company's most recent filing.`,
    faq: [],
  };
}

export async function generateReplyDraft(
  mention: Mention,
  company: Company,
  publicContext: string
): Promise<{ tweets: string[]; engine: "claude" | "template" }> {
  if (mention.requiresNonPublicInfo) {
    return {
      engine: "template",
      tweets: [
        `Thanks for the question. We can only speak to what's in our public filings — anything beyond our announced MOU would be non-public. Watch our EDGAR filings and this account for any updates. $${company.ticker}`,
      ],
    };
  }
  const ai = await claude(
    SYSTEM_PROMPT(company),
    `A shareholder asked: "${mention.text}". Answer in ONE tweet using only this public information: ${publicContext}. If the public record doesn't answer it, say so and point to EDGAR.`
  );
  if (ai) return { tweets: parseTweets(ai).slice(0, 1), engine: "claude" };

  return {
    engine: "template",
    tweets: [
      `Good question — the answer is in our most recent filings: ${publicContext.slice(0, 180)} Full details on EDGAR under $${company.ticker}.`,
    ],
  };
}
