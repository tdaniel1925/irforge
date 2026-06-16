// Seeds a public SAMPLE Sponsored Research Brief for a real, well-known ticker
// (default $MSFT) so site visitors can see what the paid product produces.
//
// Run: node scripts/seed-sample-brief.mjs [TICKER]
// Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
//
// Idempotent: removes any existing sample brief for the ticker, then inserts a
// fresh one with published=true, is_sample=true, company_id=null.

import { createClient } from "@supabase/supabase-js";

const TICKER = (process.argv[2] || "MSFT").toUpperCase();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

if (!URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Well-known public facts about the company (a real customer brief is generated
// from a live audit; for a sample we hand the model accurate public context).
const COMPANIES = {
  MSFT: {
    name: "Microsoft Corporation",
    ticker: "MSFT",
    exchange: "NASDAQ",
    sector: "Technology — Software & Cloud",
    facts:
      "Microsoft Corporation ($MSFT), NASDAQ-listed, HQ Redmond, Washington. " +
      "Operates in three reportable segments: Productivity and Business Processes (Microsoft 365, Office, LinkedIn, Dynamics), " +
      "Intelligent Cloud (Azure, server products, enterprise services), and More Personal Computing (Windows, devices, gaming/Xbox, search). " +
      "Files annual 10-K and quarterly 10-Q reports with the SEC. Pays a quarterly dividend and runs an ongoing share-repurchase program. " +
      "Significant AI investment including a large strategic stake in OpenAI and Copilot products across its portfolio. " +
      "Completed the acquisition of Activision Blizzard. Large, diversified, profitable enterprise software and cloud business.",
  },
};

const profile = COMPANIES[TICKER];
if (!profile) {
  console.error(`No sample profile defined for ${TICKER}. Add one to COMPANIES in this script.`);
  process.exit(1);
}

const disclosure =
  `SAMPLE BRIEF. This is an illustrative example of a PubcoZone Sponsored Research Brief, prepared from public information about ` +
  `${profile.name} ($${profile.ticker}) to demonstrate the format and depth of the product. ${profile.name} did NOT commission or pay for this brief. ` +
  `A real Sponsored Research Brief is commissioned and paid for by the subject company and prepared by PubcoZone from that company's public SEC filings. ` +
  `It is a company-sponsored profile, not independent research or a rating, and it is not investment advice or a recommendation to buy or sell any security. ` +
  `Verify all figures against the company's filings at sec.gov.`;

async function claude(system, user) {
  if (!ANTHROPIC_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      console.error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const j = await res.json();
    return j?.content?.[0]?.text ?? null;
  } catch (e) {
    console.error("Anthropic call failed:", e.message);
    return null;
  }
}

async function generate() {
  const ai = await claude(
    `You write a thorough, factual COMPANY-SPONSORED research brief about a public company, prepared from its public filings. ` +
      `This is paid content the company will publish, so it must be accurate, balanced, and squarely compliant: NO price targets, NO buy/sell/hold, NO "undervalued", NO predictions or guidance, NO forward-looking promises. ` +
      `Present the business, the financials, the recent filings, the catalysts, AND the risks (a sponsored brief that hides risk is misleading — include a real risk section). ` +
      `Use only widely-known public facts + the context provided; for specific current figures, point readers to EDGAR rather than inventing numbers. ` +
      `Return ONLY JSON: {"title":"...","markdown":"a structured brief in markdown with ## sections: Overview, Business, Financial Snapshot, Recent Filings, Catalysts, Risks"}.`,
    `Company data: ${profile.facts}`
  );
  if (ai) {
    const m = ai.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const v = JSON.parse(m[0]);
        if (v.markdown) {
          return {
            title: String(v.title ?? `${profile.name} — Sample Company Brief`).slice(0, 160),
            markdown: String(v.markdown).slice(0, 8000),
          };
        }
      } catch (e) {
        console.error("JSON parse failed, using fallback.", e.message);
      }
    }
  }
  // Fallback (no/failed AI): still a usable sample.
  return {
    title: `${profile.name} ($${profile.ticker}) — Sample Company Brief`,
    markdown:
      `## Overview\n${profile.name} is an SEC-registered public company in ${profile.sector}, listed on ${profile.exchange}.\n\n` +
      `## Business\n${profile.facts}\n\n` +
      `## Financial Snapshot\nReview the latest 10-K and 10-Q on EDGAR for current revenue, margins, cash, and segment detail.\n\n` +
      `## Recent Filings\nThe company files annual (10-K) and quarterly (10-Q) reports with the SEC. See sec.gov for the latest.\n\n` +
      `## Catalysts\nOngoing product cycles, cloud and AI investment, and capital-return programs. Confirm specifics in the filings.\n\n` +
      `## Risks\nAs with any company, review competition, regulatory exposure, large acquisitions/integration, and macro sensitivity in the risk-factors section of the latest 10-K.`,
  };
}

const supabase = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

console.log(`Generating sample brief for $${TICKER}…`);
const brief = await generate();

// Remove any existing sample for this ticker so re-runs replace cleanly.
const { error: delErr } = await supabase
  .from("sponsored_briefs")
  .delete()
  .eq("ticker", TICKER)
  .eq("is_sample", true);
if (delErr) {
  console.error("Cleanup of prior sample failed:", delErr.message);
  process.exit(1);
}

const { data, error } = await supabase
  .from("sponsored_briefs")
  .insert({
    company_id: null,
    ticker: TICKER,
    title: brief.title,
    markdown: brief.markdown,
    disclosure,
    status: "published",
    published: true,
    is_sample: true,
  })
  .select("id")
  .single();

if (error) {
  console.error("Insert failed:", error.message);
  process.exit(1);
}

console.log(`✓ Sample brief published for $${TICKER}`);
console.log(`  id:    ${data.id}`);
console.log(`  title: ${brief.title}`);
console.log(`  view:  /briefs/sample  and  /t/${TICKER}`);
