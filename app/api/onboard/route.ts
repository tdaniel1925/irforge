import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import { fetchEdgarFilings } from "@/lib/edgar";
import { generateFilingThread } from "@/lib/ai";
import { checkContent, hasBlockingFlags } from "@/lib/compliance";
import { sendCompanyWelcomeGuide } from "@/lib/email";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Company, Draft, Filing } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Final onboarding step — write the confirmed profile AND regenerate demo content so it
// matches the real company: real EDGAR filings + AI-drafted posts about them. No stale
// mock data from a different company ever survives onboarding.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const { db, save, authed } = await getStore();

  // When auth is enforced, onboarding must run against a real logged-in company.
  // getStore() returns the shared local store only in demo mode (AUTH_ENABLED off).
  if (process.env.AUTH_ENABLED === "1" && !authed) {
    return NextResponse.json({ error: "Sign in to set up your company." }, { status: 401 });
  }

  // CIK comes ONLY from the verified lookup. If the lookup found no CIK (ticker not on
  // EDGAR), we store an EMPTY cik — never inherit a previous company's CIK, or we'd pull
  // the wrong company's filings (the Apple-as-Tonner bug).
  const cik = String(b.cik ?? "").replace(/\D/g, "");

  const patch: Partial<Company> = {
    name: String(b.name ?? db.company.name).slice(0, 120),
    ticker: String(b.ticker ?? db.company.ticker).toUpperCase().slice(0, 8),
    exchange: String(b.exchange ?? db.company.exchange).slice(0, 40),
    cik,
    sector: String(b.sector ?? db.company.sector).slice(0, 120),
    description: String(b.description ?? db.company.description).slice(0, 600),
    approverName: String(b.approverName ?? db.company.approverName).slice(0, 80),
    approverTitle: String(b.approverTitle ?? db.company.approverTitle).slice(0, 60),
    xHandle: String(b.xHandle ?? db.company.xHandle).slice(0, 40),
    tier: ["free", "starter", "growth", "pro"].includes(b.tier) ? b.tier : db.company.tier,
    peers: Array.isArray(b.peers) ? b.peers.map((p: string) => String(p).toUpperCase().trim()).filter(Boolean).slice(0, 6) : db.company.peers,
    onboarding_complete: true,
  };
  if (b.disclosureText) patch.disclosureText = String(b.disclosureText).slice(0, 600);
  if (b.flsText) patch.flsText = String(b.flsText).slice(0, 600);

  db.company = { ...db.company, ...patch };

  // Wipe content tied to the previous (or seed) company — it must never bleed through.
  // scoreHistory + metrics are kept (generic trend numbers, no company-specific text).
  db.drafts = [];
  db.filings = [];
  db.publicQuestions = [];
  db.investors = [];
  db.mentions = [];
  db.audit = [];
  db.pressReleases = [];
  db.disclosureChecks = [];
  db.calendar = [];
  db.contacts = [];
  db.documents = [];
  db.docAnalyses = [];
  db.convertibleNotes = [];
  db.capTable = [];

  // Pull the new company's REAL filings from EDGAR and draft real posts about them.
  let draftedCount = 0;
  if (db.company.cik) {
    const result = await fetchEdgarFilings(db.company.cik);
    if (!("error" in result) && result.length > 0) {
      db.filings = result.slice(0, 6).sort((a, b) => b.filedAt.localeCompare(a.filedAt));

      // Draft posts for the 2 most recent filings so the approval inbox isn't empty.
      for (const filing of db.filings.slice(0, 2)) {
        try {
          // Fetch the actual filing document so the AI drafts from real content, not just a title.
          if (filing.url) {
            try {
              const docRes = await fetch(filing.url, {
                headers: { "User-Agent": "PubcoZone IR tool contact@irforge.app" },
                signal: AbortSignal.timeout(12000),
              });
              if (docRes.ok) {
                const raw = await docRes.text();
                const text = raw
                  .replace(/<script[\s\S]*?<\/script>/gi, " ")
                  .replace(/<style[\s\S]*?<\/style>/gi, " ")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/&[a-z#0-9]+;/gi, " ")
                  .replace(/\s+/g, " ")
                  .trim();
                if (text.length > 200) {
                  filing.fullText = text.slice(0, 6000);
                  filing.summary = text.slice(0, 400) + "…";
                }
              }
            } catch {
              /* keep the title-only summary if the doc fetch fails */
            }
          }
          const { tweets, engine } = await generateFilingThread(filing, db.company);
          const flags = checkContent(tweets);
          const draft: Draft = {
            id: newId("drf"),
            kind: "filing_thread",
            filingId: filing.id,
            title: `Thread: ${filing.form} — ${filing.title.slice(0, 50)}`,
            tweets,
            status: hasBlockingFlags(flags) ? "blocked" : "pending",
            complianceFlags: flags,
            createdAt: new Date().toISOString(),
            aiEngine: engine,
          };
          db.drafts.unshift(draft);
          filing.draftId = draft.id;
          draftedCount++;
        } catch {
          /* skip a filing that fails to draft */
        }
      }
    }
  }

  // Always give them one welcome cadence post so the inbox has content even with no filings.
  if (draftedCount === 0) {
    const welcome: Draft = {
      id: newId("drf"),
      kind: "cadence",
      title: "Welcome post",
      tweets: [
        `${db.company.name} ($${db.company.ticker}) is now sharing updates here. ${db.company.description?.slice(0, 150) ?? ""} Follow for news straight from the company. ${db.company.exchange ? `Listed on ${db.company.exchange}.` : ""}`.trim(),
      ],
      status: "pending",
      complianceFlags: [],
      createdAt: new Date().toISOString(),
      aiEngine: "template",
    };
    db.drafts.unshift(welcome);
  }

  logAudit(db, "system", "ONBOARDED", `${db.company.name} ($${db.company.ticker}) set up on the ${db.company.tier} tier — ${db.filings.length} filings imported, ${db.drafts.length} post(s) drafted`);
  await save();

  // Email the new company a welcome/setup guide (best-effort; never blocks onboarding).
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) await sendCompanyWelcomeGuide(user.email, db.company.name);
  } catch (e) {
    console.error("[onboard] welcome email failed:", e);
  }

  return NextResponse.json({ ok: true, company: db.company, filings: db.filings.length, drafts: db.drafts.length });
}
