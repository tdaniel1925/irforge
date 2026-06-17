import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { generateInvestorTargets, draftFundOutreach } from "@/lib/ai";
import { findRealFunds } from "@/lib/fundFinder";
import type { InvestorTarget } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// POST — build a research list of institutional-investor targets for this company.
// Primary path: REAL funds from SEC 13F filings that hold the company's peers, with
// real address/phone/EDGAR/ADV links. Fallback: AI-suggested target types when
// there are no peers set or SEC returns nothing.
export async function POST() {
  const { db, save } = await getStore();
  const now = Date.now();
  let investors: InvestorTarget[] = [];
  let engine = "sec_13f";

  // 1) Real funds from SEC 13F data (needs peer tickers).
  let realFunds: Awaited<ReturnType<typeof findRealFunds>> = [];
  try {
    realFunds = await findRealFunds(db.company);
  } catch {
    realFunds = [];
  }

  if (realFunds.length > 0) {
    investors = await Promise.all(
      realFunds.map(async (f, i) => {
        const note = await draftFundOutreach(db.company, { fund: f.fund, peersHeld: f.peersHeld });
        return {
          id: `inv_${now}_${i}`,
          fund: f.fund,
          type: f.type,
          aum: f.lastFiling ? `13F filer · last filed ${f.lastFiling}` : "13F filer",
          peersHeld: f.peersHeld,
          positionNote: note.positionNote,
          stage: "identified",
          outreachDraft: note.outreachDraft,
          cik: f.cik,
          address: f.address,
          phone: f.phone,
          edgarUrl: f.edgarUrl,
          advSearchUrl: f.advSearchUrl,
          lastFiling: f.lastFiling,
          submissionCriteria: note.submissionCriteria,
          source: "sec_13f",
        } satisfies InvestorTarget;
      })
    );
  } else {
    // 2) Fallback: AI-suggested target TYPES (clearly research starting points).
    engine = "ai_research";
    const { targets } = await generateInvestorTargets(db.company);
    investors = targets.map((t, i) => ({
      id: `inv_${now}_${i}`,
      fund: t.fund,
      type: t.type,
      aum: t.aum,
      peersHeld: t.peersHeld,
      positionNote: t.positionNote,
      stage: "identified",
      outreachDraft: t.outreachDraft,
      advSearchUrl: `https://adviserinfo.sec.gov/search/genericsearch/grid?searchText=${encodeURIComponent(t.fund)}`,
      submissionCriteria: "AI-suggested target type — confirm a real firm and its preferred contact via SEC IAPD / the firm's website before outreach.",
      source: "ai_research",
    }) satisfies InvestorTarget);
  }

  if (!investors.length) {
    return NextResponse.json({ error: "Couldn't build a target list right now. Add peer tickers in Settings for SEC-based results, then try again." }, { status: 502 });
  }

  db.investors = investors;
  logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "INVESTORS_GENERATED", `Generated ${investors.length} fund targets (${engine})`);
  await save();

  return NextResponse.json({ ok: true, count: investors.length, engine });
}
