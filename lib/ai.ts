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
  `Cite the SEC filing as the source. Return ONLY the tweets themselves, separated by a blank line, max 270 chars each, 3-4 tweets. ` +
  `Do NOT include any preamble, intro, or label such as "Here is the thread:" — output the first tweet directly as the first line.`;

// Models sometimes prefix the output with a conversational preamble ("Here is the
// thread:", "Sure! Here are the tweets:") or a trailing sign-off. Those are not
// tweets — strip them so they never become tweet 1/N.
const PREAMBLE_RE = /^(here'?s?( is| are)?|sure|here you go|of course|certainly|below( is| are)?|the (thread|tweets?|posts?)|i'?ve (written|drafted)|happy to help)\b.*?(thread|tweets?|posts?|:)\s*$/i;
function isPreambleLine(t: string): boolean {
  const s = t.trim();
  if (!s) return true;
  // A short line that ends in a colon and contains no real content (e.g. "Here is the thread:")
  if (PREAMBLE_RE.test(s)) return true;
  if (s.length <= 40 && /:$/.test(s) && /\b(thread|tweets?|posts?|here)\b/i.test(s)) return true;
  return false;
}

function parseTweets(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((t) => t.replace(/^\d+[\/.).]\s*/, "").trim())
    .filter((t) => t.length > 0 && !isPreambleLine(t))
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

// Reg FD traffic-light classifier for a draft post/update before it publishes.
// GREEN = routine, safe to post. YELLOW = sensitive, approver should look closely.
// RED = potentially material non-public info — needs counsel sign-off before publish.
// This is a flag, NOT legal advice; counsel makes the call on RED.
export type RegFdClass = "green" | "yellow" | "red";
export async function classifyRegFD(
  draft: string,
  company: Company
): Promise<{ classification: RegFdClass; confidence: number; flags: string[]; reasoning: string; engine: "claude" | "template" }> {
  const ai = await claude(
    `You are a Reg FD pre-publication classifier for a US public company's investor communications. You are NOT a lawyer; you triage so the right human reviews. ` +
      `Classify a DRAFT post into exactly one: ` +
      `"green" = routine/already-public info (recaps of filed results, public product news, general education, engagement) — safe to post; ` +
      `"yellow" = sensitive but probably fine — forward-leaning tone, selective emphasis, anything that could be read as guidance-adjacent — an approver should look closely; ` +
      `"red" = likely material non-public information or selective disclosure risk — unannounced deals/partnerships, financial guidance or projections, milestone results not yet filed, M&A, capital raises — MUST get counsel sign-off and simultaneous public disclosure first. ` +
      `When unsure between yellow and red, choose red. ` +
      `Return ONLY JSON: {"classification":"green|yellow|red","confidence":0.0-1.0,"flags":["short reasons"],"reasoning":"2 sentences plain English"}.`,
    `Company: ${company.name} ($${company.ticker}), ${company.sector || "public company"}.\nDraft to classify:\n"${draft.slice(0, 4000)}"`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        const cls: RegFdClass = ["green", "yellow", "red"].includes(v.classification) ? v.classification : "yellow";
        return {
          classification: cls,
          confidence: typeof v.confidence === "number" ? Math.max(0, Math.min(1, v.confidence)) : 0.5,
          flags: Array.isArray(v.flags) ? v.flags.slice(0, 6).map((f: unknown) => String(f).slice(0, 120)) : [],
          reasoning: String(v.reasoning ?? "").slice(0, 400),
          engine: "claude",
        };
      }
    } catch {
      /* fall through */
    }
  }
  // No AI: be conservative — flag for human review rather than greenlight blindly.
  return {
    classification: "yellow",
    confidence: 0.3,
    flags: ["Classified without AI — review manually."],
    reasoning: "AI classification is unavailable, so this draft is flagged for a human approver to review before publishing.",
    engine: "template",
  };
}

// Draft a post in a specific executive's voice profile.
export interface VoiceSpec { name: string; roleTitle: string; guidance: string; styleExamples: string[]; forbiddenPhrases: string[] }
export async function draftInVoice(topic: string, voice: VoiceSpec, company: Company): Promise<{ text: string; engine: "claude" | "template" }> {
  const sys =
    `You are ghost-writing an investor-relations post AS ${voice.name}${voice.roleTitle ? `, ${voice.roleTitle}` : ""} of ${company.name} ($${company.ticker}). ` +
    `Voice guidance: ${voice.guidance || "professional, plain-spoken, credible"}. ` +
    (voice.forbiddenPhrases.length ? `NEVER use these words/phrases: ${voice.forbiddenPhrases.join(", ")}. ` : "") +
    `STRICT compliance rules: only state things that are public or clearly non-material; never predict the stock price; never give investment advice; never promise outcomes. ` +
    (voice.styleExamples.length ? `Match the style of these examples:\n${voice.styleExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n` : "") +
    `Return ONLY the post text, no preamble, under 280 words.`;
  const ai = await claude(sys, `Write a post about: ${topic}`);
  if (ai) return { text: ai.trim(), engine: "claude" };
  return { text: `${topic}\n\n— ${voice.name}${voice.roleTitle ? `, ${voice.roleTitle}` : ""}`, engine: "template" };
}

// Check whether a draft matches a voice profile; return pass/fail + specific notes.
export async function voiceCheck(draft: string, voice: VoiceSpec): Promise<{ passed: boolean; notes: string; engine: "claude" | "template" }> {
  // Fast deterministic check: forbidden phrases are an automatic fail.
  const hit = voice.forbiddenPhrases.find((p) => p && draft.toLowerCase().includes(p.toLowerCase()));
  if (hit) return { passed: false, notes: `Uses a forbidden phrase: "${hit}".`, engine: "template" };

  const ai = await claude(
    `You verify whether a draft matches an executive's voice. Voice: ${voice.name}, ${voice.roleTitle}. Guidance: ${voice.guidance}. ` +
      `Return ONLY JSON: {"passed": boolean, "notes": "one specific sentence — if it fails, say exactly what's off"}.`,
    `Draft:\n"${draft.slice(0, 3000)}"`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) { const v = JSON.parse(m[0]); return { passed: Boolean(v.passed), notes: String(v.notes ?? "").slice(0, 300), engine: "claude" }; }
    } catch { /* fall through */ }
  }
  return { passed: true, notes: "No forbidden phrases found (AI voice check unavailable).", engine: "template" };
}

// Triage an inbound message from a stakeholder: classify, tag, suggest owner + reply.
export async function triageInbound(message: string, company: Company): Promise<{ category: string; topics: string[]; summary: string; suggestedReply: string; engine: "claude" | "template" }> {
  const ai = await claude(
    `You triage inbound messages to a public company's IR/comms team. Classify the sender and draft a safe reply. ` +
      `Categories: investor | analyst | journalist | partner | procurement | talent | other. ` +
      `The reply MUST be Reg FD-safe: no material non-public info, no guidance, no stock-price talk — point to public filings/IR when needed. ` +
      `Return ONLY JSON: {"category":"...","topics":["..."],"summary":"one line","suggestedReply":"2-4 sentence draft reply"}.`,
    `Company: ${company.name} ($${company.ticker}). Inbound message:\n"${message.slice(0, 3000)}"`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        return {
          category: ["investor", "analyst", "journalist", "partner", "procurement", "talent", "other"].includes(v.category) ? v.category : "other",
          topics: Array.isArray(v.topics) ? v.topics.slice(0, 6).map((t: unknown) => String(t).slice(0, 60)) : [],
          summary: String(v.summary ?? "").slice(0, 200),
          suggestedReply: String(v.suggestedReply ?? "").slice(0, 1000),
          engine: "claude",
        };
      }
    } catch { /* fall through */ }
  }
  return { category: "other", topics: [], summary: message.slice(0, 120), suggestedReply: "Thanks for reaching out — we'll route this to the right person on our team and follow up. For the latest, our filings are on SEC EDGAR.", engine: "template" };
}

// Generate a small pack of "we're on PubcoZone" announcement posts for a company
// to spread the word. Returns several distinct angles they can approve & publish.
export async function announcementPosts(company: Company, welcomeUrl: string): Promise<{ posts: string[]; engine: "claude" | "template" }> {
  const ai = await claude(
    `You write short social posts AS ${company.name} ($${company.ticker}), a public company, announcing that they now engage investors openly on PubcoZone — where info is real, fair, AI-balanced, and the company answers on the record (vs. the anonymous pump-and-dump of StockTwits/InvestorsHub). ` +
      `Compliance: no stock-price talk, no guidance, no hype, no promises. Confident and plain. Each post under 270 chars and must include the link ${welcomeUrl}. ` +
      `Return ONLY JSON: {"posts":["...","...","...","..."]} with 4 distinct angles (the announcement, why we left the noise, an invite to ask us anything, and a transparency/trust angle).`,
    `Company: ${company.name} ($${company.ticker}), ${company.sector || "public company"}.`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (Array.isArray(v.posts) && v.posts.length) return { posts: v.posts.slice(0, 5).map((p: unknown) => String(p).slice(0, 280)), engine: "claude" };
      }
    } catch { /* fall through */ }
  }
  const t = company.ticker;
  return {
    engine: "template",
    posts: [
      `📣 We now answer investor questions on the record at PubcoZone — real, fair, AI-balanced info on $${t}. No anonymous noise. ${welcomeUrl}`,
      `Tired of slushing through pump-and-dump posts about $${t}? So were we. We engage investors honestly on PubcoZone. ${welcomeUrl}`,
      `Got a question about $${t}? Ask us directly — we answer in public, on the record. ${welcomeUrl}`,
      `Transparency matters. Real filings, real data, real answers about $${t} — all in one fair place. ${welcomeUrl}`,
    ],
  };
}

// Generate a short Friday-style IR summary for executives from the week's metrics.
export async function weeklySummary(metricsText: string, company: Company): Promise<{ markdown: string; engine: "claude" | "template" }> {
  const ai = await claude(
    `You write a crisp weekly investor-relations summary for the executives of ${company.name} ($${company.ticker}). ` +
      `Max 5 bullet points. Format: what shipped, what's in the pipeline, what needs attention. Plain English, no fluff, no hype, no predictions. ` +
      `Return ONLY the summary as markdown bullets.`,
    `This week's IR-OS metrics:\n${metricsText}`
  );
  if (ai) return { markdown: ai.trim(), engine: "claude" };
  return { markdown: `**This week for ${company.name}**\n\n${metricsText.split("\n").map((l) => `- ${l}`).join("\n")}`, engine: "template" };
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

// ── Sponsored Research Brief ──
// A company PAYS for production of a thorough, factual, filing-based profile of
// THEIR OWN company. It is clearly DISCLOSED as company-sponsored (like a sell-
// side initiation carries a disclosure). The company pays us to WRITE it, not to
// RATE it — so: no buy/sell, no price targets, no valuation calls, no
// predictions. Just a deep, balanced, public-record write-up. Disclosure is
// baked in by construction.
export interface SponsoredBrief {
  title: string;
  markdown: string;        // the brief body
  disclosure: string;      // the mandatory sponsorship disclosure
  engine: "claude" | "template";
}
export async function generateSponsoredBrief(company: Company, audit: TA): Promise<SponsoredBrief> {
  const disclosure = `This research brief was commissioned and paid for by ${company.name} ($${company.ticker}) and prepared by PubcoZone from the company's public SEC filings and public data. It is a company-sponsored profile, not independent research or a rating, and it is not investment advice or a recommendation to buy or sell any security. Verify all figures against the company's filings at sec.gov.`;
  const facts = [
    audit.companyName ? `${audit.companyName} ($${audit.ticker})` : `$${audit.ticker}`,
    audit.profile?.industry ? `Industry: ${audit.profile.industry}` : "",
    audit.profile?.hq ? `HQ: ${audit.profile.hq}` : "",
    typeof audit.market.price === "number" ? `Price ~$${audit.market.price}` : "",
    audit.filings.last12mo ? `${audit.filings.last12mo} SEC filings in 12mo; latest ${audit.filings.lastForm} ${audit.filings.lastFilingDate}` : "",
    typeof audit.fundamentals?.cash === "number" ? `Cash $${(audit.fundamentals.cash / 1e6).toFixed(1)}M` : "",
    typeof audit.fundamentals?.revenueAnnual === "number" ? `Revenue $${(audit.fundamentals.revenueAnnual / 1e6).toFixed(1)}M` : "",
    typeof audit.fundamentals?.runwayQuarters === "number" ? `~${audit.fundamentals.runwayQuarters.toFixed(1)} quarters runway` : "",
    audit.catalysts?.trials ? `${audit.catalysts.trials.total} clinical trials` : "",
    company.description ? `Company description: ${company.description}` : "",
  ].filter(Boolean).join(". ");

  const ai = await claude(
    `You write a thorough, factual COMPANY-SPONSORED research brief about a public company, prepared from its public filings. ` +
      `This is paid content the company will publish, so it must be accurate, balanced, and squarely compliant: NO price targets, NO buy/sell/hold, NO "undervalued", NO predictions or guidance, NO forward-looking promises. Present the business, the financials, the recent filings, the catalysts, AND the risks (a sponsored brief that hides risk is misleading — include a real risk section). ` +
      `Use only the facts provided + general public context; point to EDGAR for specifics. Return ONLY JSON: {"title":"...","markdown":"a structured brief in markdown with ## sections: Overview, Business, Financial Snapshot, Recent Filings, Catalysts, Risks"}.`,
    `Company data: ${facts}`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (v.markdown) return { title: String(v.title ?? `${company.name} — Company Brief`).slice(0, 160), markdown: String(v.markdown).slice(0, 8000), disclosure, engine: "claude" };
      }
    } catch {
      /* fall through */
    }
  }
  return {
    engine: "template",
    title: `${company.name} ($${company.ticker}) — Company Brief`,
    markdown: `## Overview\n${company.name} is an SEC-registered public company${company.sector ? ` in ${company.sector}` : ""}.\n\n## Recent Filings\nReview the latest filings on EDGAR for current figures.\n\n## Risks\nAs with any company, review cash position, dilution, and execution risk in the filings before drawing conclusions.`,
    disclosure,
  };
}

// ── AI Research Panel ("Both Sides") ──
// A panel of clearly-labeled AI lenses (NOT human personas) that each give a
// grounded take on a stock from a stated analytical angle. Transparency is the
// point: every entry is badged 🤖 AI. Strict compliance: no price predictions,
// no buy/sell, no made-up non-public info — opinions grounded in the public record.
export type PanelLensKey = "value" | "growth" | "skeptic" | "explainer";
export interface PanelLens {
  key: PanelLensKey;
  name: string;     // e.g. "The Value Lens"
  icon: string;
  take: string;     // the lens's analysis
}
export interface ResearchPanel {
  lenses: PanelLens[];
  engine: "claude" | "template";
}

const PANEL_LENSES: { key: PanelLensKey; name: string; icon: string; angle: string }[] = [
  { key: "value", name: "The Value Lens", icon: "💵", angle: "fundamentals — cash, runway, dilution, revenue, and valuation relative to the filings" },
  { key: "growth", name: "The Growth Optimist", icon: "🚀", angle: "the bull case — catalysts, momentum, and upside, but ONLY grounded in real news/filings, never hype" },
  { key: "skeptic", name: "The Skeptic", icon: "🧐", angle: "the fair bear case — risks, red flags, dilution, short interest, and hard questions. Be candid even if unflattering" },
  { key: "explainer", name: "The Explainer", icon: "📖", angle: "plain-English context for a first-time investor — what the company does and what the latest filing means, no jargon" },
];

export async function generateResearchPanel(audit: TA): Promise<ResearchPanel> {
  const facts = [
    audit.companyName ? `${audit.companyName} ($${audit.ticker})` : `$${audit.ticker}`,
    audit.profile?.industry ? `Industry: ${audit.profile.industry}` : "",
    typeof audit.market.price === "number" ? `Price ~$${audit.market.price}${typeof audit.market.changePct3mo === "number" ? `, ${audit.market.changePct3mo.toFixed(1)}% over 3mo` : ""}` : "",
    audit.filings.last12mo ? `${audit.filings.last12mo} SEC filings in 12mo; latest ${audit.filings.lastForm} ${audit.filings.lastFilingDate}` : "no recent SEC filings found",
    typeof audit.fundamentals?.cash === "number" ? `Cash $${(audit.fundamentals.cash / 1e6).toFixed(1)}M` : "",
    typeof audit.fundamentals?.runwayQuarters === "number" ? `~${audit.fundamentals.runwayQuarters.toFixed(1)} quarters runway` : "",
    typeof audit.fundamentals?.sharesChangePct1y === "number" ? `share count ${audit.fundamentals.sharesChangePct1y >= 0 ? "+" : ""}${audit.fundamentals.sharesChangePct1y.toFixed(0)}% in 1yr` : "",
    audit.shortData ? `${audit.shortData.shortPct.toFixed(0)}% of daily volume short` : "",
    audit.insiders ? `${audit.insiders.buys} insider buys / ${audit.insiders.sells} sells (180d)` : "",
    audit.news.articles30d ? `${audit.news.articles30d} news articles in 30d` : "",
  ].filter(Boolean).join(". ");

  const ai = await claude(
    `You are a panel of distinct, CLEARLY-LABELED AI research lenses analyzing a public stock for retail investors. You are NOT pretending to be people — you are transparent AI perspectives. ` +
      `Each lens argues from its angle, fairly and measured, using ONLY the data provided. STRICT RULES for every lens: no stock-price predictions, no "buy"/"sell"/"undervalued"/"overvalued", no investment advice, no invented or non-public information. Ground every claim in the provided facts and point to EDGAR for specifics. The Skeptic must be genuinely candid about risks even if unflattering. ` +
      `Return ONLY JSON: {"value":"2-3 sentences","growth":"2-3 sentences","skeptic":"2-3 sentences","explainer":"2-3 sentences"}.`,
    `Company data: ${facts}`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        const lenses = PANEL_LENSES
          .filter((l) => v[l.key])
          .map((l) => ({ key: l.key, name: l.name, icon: l.icon, take: String(v[l.key]).slice(0, 600) }));
        if (lenses.length) return { lenses, engine: "claude" };
      }
    } catch {
      /* fall through */
    }
  }
  // Deterministic fallback (no AI key) — neutral, factual, still labeled.
  const co = audit.companyName ?? `$${audit.ticker}`;
  return {
    engine: "template",
    lenses: [
      { key: "value", name: "The Value Lens", icon: "💵", take: `${co}'s fundamentals are in its SEC filings — review cash, runway, and share count on EDGAR for the current picture.` },
      { key: "growth", name: "The Growth Optimist", icon: "🚀", take: `Any upside case for ${co} should be checked against its latest filings and news — confirm catalysts in the public record.` },
      { key: "skeptic", name: "The Skeptic", icon: "🧐", take: `Key risks for any small-cap include cash runway, dilution, and execution. Verify the latest figures before drawing conclusions.` },
      { key: "explainer", name: "The Explainer", icon: "📖", take: `${co} is an SEC-registered company. Start with its most recent filing on EDGAR to understand what it does and how it's performing.` },
    ],
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

// Writes the outreach note + fit summary + submission guidance for a REAL fund
// found in SEC 13F data. Does NOT invent contact details — those come from SEC.
export async function draftFundOutreach(
  company: Company,
  fund: { fund: string; peersHeld: string[] }
): Promise<{ positionNote: string; submissionCriteria: string; outreachDraft: string; engine: "claude" | "template" }> {
  const sector = company.sector || "its sector";
  const held = fund.peersHeld.length ? fund.peersHeld.map((p) => "$" + p).join(", ") : "comparable small-caps";
  const ai = await claude(
    `You help a small public company approach a REAL institutional investor that, per its SEC 13F filing, holds peer companies. ` +
      `Write three things, professional and compliant — the company sends the note ITSELF, you do not solicit. ` +
      `NO promises of returns, NO price predictions, NO investment advice. ` +
      `Return ONLY JSON: {"positionNote":"1 sentence on why they may be a fit, grounded in their reported peer holdings","submissionCriteria":"1-2 sentences on how a fund like this typically prefers to be approached (e.g. via IR contact, brief deck, no cold mass-email) — general best practice, not a claim about this specific fund","outreachDraft":"a 3-4 sentence intro note the company can personalize"}.`,
    `Company: ${company.name} ($${company.ticker}), sector: ${sector}. Fund: ${fund.fund}. It reported holding: ${held}.`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (v.outreachDraft) {
          return {
            positionNote: String(v.positionNote ?? "").slice(0, 300),
            submissionCriteria: String(v.submissionCriteria ?? "").slice(0, 300),
            outreachDraft: String(v.outreachDraft).slice(0, 800),
            engine: "claude",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return {
    positionNote: `Reported holding ${held} in its latest 13F — a fund already comfortable with companies like ${company.name}.`,
    submissionCriteria: `Confirm the firm's preferred contact and process before reaching out (check their website / Form ADV). Funds like this usually prefer a brief, factual intro from the company's IR contact over a cold mass-email.`,
    outreachDraft: `Hello — I'm reaching out on behalf of ${company.name} ($${company.ticker}), a public company in ${sector}. We noticed your firm holds peer companies (${held}) and thought our story may be relevant. Our latest filings are on SEC EDGAR; I'd welcome the chance to share a brief overview at your convenience. Thank you for your time.`,
    engine: "template",
  };
}

// ── Fund Finder ──
// Suggests institutional-investor TARGETS for a company to research and approach,
// based on the kinds of funds that hold its peers, and drafts a compliant intro
// note for each. These are RESEARCH STARTING POINTS the company verifies against
// real 13F filings — not a claim of current holdings. Compliance: flat-fee model,
// the company does its own outreach, no solicitation on its behalf, no promises.
export interface GeneratedInvestorTarget {
  fund: string;
  type: string;
  aum: string;
  peersHeld: string[];
  positionNote: string;
  outreachDraft: string;
}
export async function generateInvestorTargets(
  company: Company
): Promise<{ targets: GeneratedInvestorTarget[]; engine: "claude" | "template" }> {
  const peers = (company.peers ?? []).filter(Boolean);
  const sector = company.sector || company.description || "its sector";
  const ai = await claude(
    `You help a small public company build a RESEARCH LIST of institutional investors to approach. ` +
      `Suggest realistic fund TYPES and representative names of funds that typically hold small-cap companies in this sector, ` +
      `and for each write a short, professional intro note the company can personalize and send ITSELF. ` +
      `STRICT COMPLIANCE: these are research starting points to verify against real 13F filings — do NOT claim a fund currently holds a specific position as fact. ` +
      `The note must NOT promise returns, predict the stock price, give investment advice, or offer compensation. It simply introduces the company and points to its public filings. ` +
      `Return ONLY JSON: {"targets":[{"fund":"name","type":"Hedge Fund|Family Office|Small-Cap Fund|RIA","aum":"approx e.g. $250M","peersHeld":["TICKER"],"positionNote":"1 sentence why they may be a fit (framed as 'funds like this often hold...')","outreachDraft":"3-4 sentence intro note"}]}. Provide 5-8 targets.`,
    `Company: ${company.name} ($${company.ticker}). Sector: ${sector}. Peer companies: ${peers.length ? peers.join(", ") : "(none provided — suggest based on sector)"}.`
  );
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (Array.isArray(v.targets) && v.targets.length) {
          const targets: GeneratedInvestorTarget[] = v.targets.slice(0, 8).map((t: Record<string, unknown>) => ({
            fund: String(t.fund ?? "Institutional investor").slice(0, 120),
            type: String(t.type ?? "Fund").slice(0, 40),
            aum: String(t.aum ?? "—").slice(0, 40),
            peersHeld: Array.isArray(t.peersHeld) ? t.peersHeld.map((p: unknown) => String(p).toUpperCase().slice(0, 6)).slice(0, 6) : [],
            positionNote: String(t.positionNote ?? "").slice(0, 300),
            outreachDraft: String(t.outreachDraft ?? "").slice(0, 800),
          }));
          return { targets, engine: "claude" };
        }
      }
    } catch {
      /* fall through */
    }
  }
  // Template fallback — generic but usable research prompts.
  const types = ["Small-Cap Fund", "Family Office", "RIA", "Hedge Fund"];
  const targets: GeneratedInvestorTarget[] = types.map((type, i) => ({
    fund: `${sector.split(" ")[0] || "Small-cap"}-focused ${type} (research ${i + 1})`,
    type,
    aum: "verify in 13F",
    peersHeld: peers.slice(0, 2),
    positionNote: `Funds like this often hold small-caps in ${sector}. Verify current holdings in their latest 13F on EDGAR.`,
    outreachDraft: `Hello — I'm reaching out on behalf of ${company.name} ($${company.ticker}), a public company in ${sector}. We're expanding our investor outreach and thought our story may be relevant given your focus on companies like our peers. Our latest filings are on SEC EDGAR; I'd welcome the chance to share a brief overview. Thank you for your time.`,
  }));
  return { targets, engine: "template" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Social Content Engine generators (strategy → calendar → per-platform posts).
// All draft from the public record + the company's stated intent only. Every
// generated post still passes the compliance gate before any human sees it.
// See docs/social-engine-plan.md.
// ─────────────────────────────────────────────────────────────────────────────

// Pull the first {...} or [...] JSON block out of a model response.
function extractJson<T>(text: string | null): T | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

// Turn raw interview answers into a structured social strategy proposal. The
// client reviews/edits it before it's saved — this just seeds sensible defaults.
export async function proposeStrategy(
  contextBlock: string,
  interview: { goals?: string; audience?: string; tone?: string; frequency?: string; topics?: string; platforms?: string[] }
): Promise<{
  goals: string; audience: string; tone: string; themes: string[];
  dos: string[]; donts: string[]; postsPerWeek: number; engine: "claude" | "template";
}> {
  const ai = await claude(
    `You are an investor-relations social strategist for a public company. From the company context and the client's interview answers, produce a compliant social content strategy. ` +
      `Compliance is mandatory: never propose price talk, predictions, "undervalued", guarantees, or investment advice as themes. ` +
      `Return ONLY JSON: {"goals":"...","audience":"...","tone":"...","themes":["..."],"dos":["..."],"donts":["..."],"postsPerWeek":3}.`,
    `${contextBlock}\n\nINTERVIEW ANSWERS:\n` +
      `Goals: ${interview.goals ?? "(none)"}\nAudience: ${interview.audience ?? "(none)"}\n` +
      `Tone: ${interview.tone ?? "(none)"}\nDesired frequency: ${interview.frequency ?? "(none)"}\n` +
      `Topics they want to cover: ${interview.topics ?? "(none)"}`
  );
  const v = extractJson<Record<string, unknown>>(ai);
  if (v && (v.goals || v.themes)) {
    return {
      goals: String(v.goals ?? interview.goals ?? "").slice(0, 2000),
      audience: String(v.audience ?? interview.audience ?? "").slice(0, 1000),
      tone: String(v.tone ?? interview.tone ?? "professional").slice(0, 120),
      themes: Array.isArray(v.themes) ? v.themes.map(String).slice(0, 12) : [],
      dos: Array.isArray(v.dos) ? v.dos.map(String).slice(0, 20) : [],
      donts: Array.isArray(v.donts) ? v.donts.map(String).slice(0, 20) : [],
      postsPerWeek: Number(v.postsPerWeek) > 0 ? Math.min(21, Number(v.postsPerWeek)) : 3,
      engine: "claude",
    };
  }
  // Deterministic fallback so the interview always yields a usable starting point.
  return {
    goals: interview.goals ?? "Build awareness with retail and institutional investors using the public record.",
    audience: interview.audience ?? "Current and prospective shareholders.",
    tone: interview.tone ?? "professional",
    themes: ["Filing highlights (plain English)", "Company explainers", "Sector education", "Milestones & operational updates"],
    dos: ["Cite the SEC filing as the source", "Keep it factual and plain-language"],
    donts: ["No price predictions", "No 'undervalued' or valuation claims", "No investment advice or guarantees"],
    postsPerWeek: 3,
    engine: "template",
  };
}

// Plan a month of calendar slots (NOT yet drafted). Returns slot stubs the
// generator later turns into per-platform posts.
export interface CalendarSlotPlan {
  dayOffset: number;   // days from the calendar start date
  theme: string;       // which content pillar this slot serves
  angle: string;       // the specific idea for this post
  platforms: string[]; // ayrshare channel keys for this slot
}
export async function planCalendar(
  contextBlock: string,
  opts: { platforms: string[]; postsPerWeek: number; weeks: number }
): Promise<{ slots: CalendarSlotPlan[]; engine: "claude" | "template" }> {
  const total = Math.max(1, Math.min(40, opts.postsPerWeek * opts.weeks));
  const ai = await claude(
    `You plan a ${opts.weeks}-week investor-relations social calendar for a public company. ` +
      `Produce exactly ${total} post slots spread evenly across the period. Each slot draws ONLY on the public record + stated themes — ` +
      `no price talk, predictions, or advice. Vary the angles (don't repeat). ` +
      `Return ONLY JSON: an array of {"dayOffset":N,"theme":"...","angle":"..."} sorted by dayOffset ascending, dayOffset between 0 and ${opts.weeks * 7 - 1}.`,
    contextBlock
  );
  const arr = extractJson<Array<Record<string, unknown>>>(ai);
  if (Array.isArray(arr) && arr.length) {
    const slots = arr.slice(0, total).map((s) => ({
      dayOffset: Math.max(0, Math.min(opts.weeks * 7 - 1, Number(s.dayOffset) || 0)),
      theme: String(s.theme ?? "Update").slice(0, 120),
      angle: String(s.angle ?? "").slice(0, 280),
      platforms: opts.platforms,
    }));
    return { slots, engine: "claude" };
  }
  // Fallback: evenly spaced generic slots.
  const spacing = Math.max(1, Math.floor((opts.weeks * 7) / total));
  const slots: CalendarSlotPlan[] = Array.from({ length: total }, (_, i) => ({
    dayOffset: Math.min(opts.weeks * 7 - 1, i * spacing),
    theme: ["Filing highlight", "Company explainer", "Sector education", "Milestone"][i % 4],
    angle: "",
    platforms: opts.platforms,
  }));
  return { slots, engine: "template" };
}

// Generate a single post formatted for one platform. Returns the raw text only;
// the caller runs it through the compliance gate + image generation.
const PLATFORM_FORMAT: Record<string, string> = {
  twitter: "Format as an X (Twitter) thread: 3-4 tweets, max 270 chars each, separated by a blank line. Lead with a hook.",
  linkedin: "Format as a single LinkedIn post: 1-3 short paragraphs, professional, a clear opening line, 2-3 relevant hashtags at the end.",
  facebook: "Format as a single Facebook post: 1-2 short paragraphs, approachable but factual.",
  instagram: "Format as a short Instagram caption: 1 paragraph plus 3-5 hashtags.",
  gmb: "Format as a short Google Business post: 1 concise paragraph, factual.",
};
export async function generateSocialPost(
  contextBlock: string,
  slot: { theme: string; angle: string },
  platform: string
): Promise<{ text: string; engine: "claude" | "template" }> {
  const fmt = PLATFORM_FORMAT[platform] ?? PLATFORM_FORMAT.linkedin;
  const ai = await claude(
    `You write investor-relations social posts for a public company, using ONLY the public record provided. ` +
      `STRICT COMPLIANCE: never predict stock price, never say "undervalued", never give investment advice, never guarantee outcomes, never share non-public info. ` +
      `${fmt} Output ONLY the post text — no preamble, no labels, no explanation.`,
    `${contextBlock}\n\nTHIS POST — theme: ${slot.theme}. Angle: ${slot.angle || "company-appropriate update on this theme"}.`
  );
  if (ai && !isRefusal(ai)) return { text: ai.trim(), engine: "claude" };
  // Fallback handled by the caller (it has company data for a template).
  return { text: "", engine: "template" };
}

// Revise a piece of content per a user instruction (the Writing Studio's live-AI
// edit bar). Returns the full revised text — the model rewrites the whole doc so
// the editor can replace it wholesale. Compliance guardrails are always applied.
export async function reviseContent(
  current: string,
  instruction: string,
  company: Company
): Promise<{ text: string; engine: "claude" | "template" }> {
  const ai = await claude(
    `You are an editor helping ${company.name} ($${company.ticker}), a public company, revise investor-relations content. ` +
      `Apply the user's instruction to the document and return the COMPLETE revised document text (not a diff, not commentary). ` +
      `STRICT COMPLIANCE — never add: stock-price predictions, "undervalued"/valuation claims, investment advice, guarantees, or any non-public information. Keep it factual and grounded in the public record. ` +
      `Output ONLY the revised document text.`,
    `CURRENT DOCUMENT:\n${current.slice(0, 8000)}\n\nINSTRUCTION: ${instruction}`
  );
  if (ai && !isRefusal(ai)) return { text: ai.trim(), engine: "claude" };
  return { text: current, engine: "template" }; // no change if AI unavailable
}

// The floating in-app AI assistant. Multi-turn, grounded in the company's public
// context, with the same compliance guardrails. Flattens the short history into a
// single prompt (the private claude() helper takes one user turn).
export async function assistantReply(
  messages: { role: "user" | "assistant"; content: string }[],
  company: Company
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${String(m.content).slice(0, 1500)}`)
    .join("\n");
  const ai = await claude(
    `You are the in-app AI assistant for ${company.name} ($${company.ticker}), a public company using PubcoZone for investor relations. ` +
      `Help with IR questions, drafting, and how to use the app. Be concise and practical. ` +
      `STRICT COMPLIANCE: never give stock-price predictions, valuation claims, investment advice, guarantees, or non-public information; ground anything factual in the public record / SEC filings. If asked for something non-compliant, say so plainly and offer a compliant alternative.`,
    `${transcript}\nAssistant:`
  );
  return ai?.trim() || "I'm having trouble reaching the AI right now — try again in a moment.";
}

// Pick a concrete VISUAL CONCEPT for a post's image, so the generated image actually
// reflects what the post is about (instead of a fixed/abstract motif). Returns a short
// scene description (the SUBJECT) — the image prompt wraps it in the brand style.
// Falls back to null when AI is unavailable; callers then use a generic concept.
export async function pickVisualConcept(postText: string, company: Company): Promise<string | null> {
  const text = String(postText ?? "").slice(0, 600).trim();
  if (!text) return null;
  const out = await claude(
    `You choose a single visual concept for a social-media image that accompanies an investor-relations post for ${company.name} ($${company.ticker}) (sector: ${company.sector || "business"}). ` +
      `Read the post and describe ONE concrete, relevant image idea that visually represents WHAT THE POST IS ABOUT — a scene, subject, or metaphor. It may include people, places, objects, or symbolic imagery. ` +
      `Rules: 1 sentence, under 30 words, concrete and specific to the post's topic. Describe the SUBJECT/scene only — NOT the colors or art style (those are added separately). ` +
      `Do NOT include any words/text/numbers/logos/charts in the idea, and nothing implying a stock price, valuation, or return. Output ONLY the description, no preamble.`,
    `Post:\n"""${text}"""\n\nVisual concept:`
  );
  const concept = out?.trim().replace(/^["']|["']$/g, "").split("\n")[0];
  return concept && concept.length > 3 ? concept.slice(0, 200) : null;
}

// Polish a draft: fix spelling, grammar, punctuation, spacing, and line breaks —
// WITHOUT changing meaning, tone, or adding any claims/numbers/promotion. Used by the
// compose editor's "Polish" button. Returns the cleaned text, or null if unavailable.
export async function polishText(text: string): Promise<string | null> {
  const input = String(text ?? "").slice(0, 4000).trim();
  if (!input) return null;
  const out = await claude(
    `You are a careful copy editor for investor-relations social posts. Clean up the user's draft: fix spelling, grammar, punctuation, capitalization, awkward spacing, and line breaks; tighten only obviously clumsy wording. ` +
      `STRICT RULES: preserve the original MEANING, facts, and tone exactly. Do NOT add, remove, or change any facts, numbers, claims, predictions, or promotional language. Do NOT add hashtags, emojis, or calls to action that weren't there. Do NOT invent anything. If the draft is already clean, return it essentially unchanged. ` +
      `Output ONLY the corrected text — no preamble, no quotes, no explanation.`,
    `Draft:\n"""${input}"""\n\nCorrected:`
  );
  const cleaned = out?.trim().replace(/^["']|["']$/g, "");
  return cleaned && cleaned.length > 0 ? cleaned : null;
}

// Write a social post from a user's topic/idea. Compliance-safe: grounded in the
// company's public facts, never predicts price, never gives advice, never says
// "undervalued". Returns a single ready-to-edit post (the user reviews + approves).
export async function writePostFromTopic(topic: string, company: Company): Promise<string | null> {
  const t = String(topic ?? "").slice(0, 400).trim();
  if (!t) return null;
  const out = await claude(
    SYSTEM_PROMPT(company) +
      ` Write ONE concise, engaging social post (1–3 short paragraphs, not a numbered thread) suitable for X/LinkedIn. ` +
      `Plain, confident, factual. No hashtags spam, at most one tasteful emoji. Do NOT append disclosures (the app adds them).`,
    `Company: ${company.name} ($${company.ticker}), sector ${company.sector}. Description: ${company.description}. ` +
      `Write a post about this topic/idea: "${t}". Use only public, factual framing.`
  );
  if (!out || isRefusal(out)) return null;
  // Strip any preamble; return the post body as plain text.
  return out.trim().replace(/^(here'?s|sure|draft:?)[^\n]*\n+/i, "").trim().slice(0, 2000) || null;
}
