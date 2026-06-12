import type { Database, Draft, Filing, ScoreSnapshot, WeeklyMetric } from "./types";

const DAY = 86400000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const isoDate = (daysAgo: number) => iso(daysAgo).slice(0, 10);

export function buildSeed(): Database {
  const filings: Filing[] = [
    {
      id: "fil_001", form: "8-K", source: "demo",
      title: "Phase 2 Drill Program Results — High-Grade Lithium Intercepts at Clearwater",
      filedAt: iso(2), url: "https://www.sec.gov/cgi-bin/browse-edgar",
      summary: "Reported 14 drill holes at the Clearwater project; 11 intersected lithium-bearing pegmatite, headline intercept of 1.42% Li2O over 38m. Phase 3 program planned for Q3.",
      draftId: "drf_001",
    },
    {
      id: "fil_002", form: "10-Q", source: "demo",
      title: "Quarterly Report — Q1 2026",
      filedAt: iso(18), url: "https://www.sec.gov/cgi-bin/browse-edgar",
      summary: "Cash position of $11.2M, no debt. Quarterly burn of $1.8M. Exploration spend up 22% QoQ as Phase 2 drilling accelerated.",
      draftId: "drf_002",
    },
    {
      id: "fil_003", form: "8-K", source: "demo",
      title: "Appointment of Chief Operating Officer",
      filedAt: iso(34), url: "https://www.sec.gov/cgi-bin/browse-edgar",
      summary: "Appointed Dana Whitfield as COO; 18 years of lithium processing experience, previously VP Operations at a producing spodumene mine.",
      draftId: "drf_003",
    },
    {
      id: "fil_004", form: "8-K", source: "demo",
      title: "Offtake Memorandum of Understanding with Battery Manufacturer",
      filedAt: iso(55), url: "https://www.sec.gov/cgi-bin/browse-edgar",
      summary: "Non-binding MOU covering up to 40% of planned Phase 1 spodumene concentrate production, subject to feasibility study completion.",
    },
    {
      id: "fil_005", form: "10-K", source: "demo",
      title: "Annual Report — Fiscal 2025",
      filedAt: iso(95), url: "https://www.sec.gov/cgi-bin/browse-edgar",
      summary: "Year-end resource estimate of 18.4Mt @ 1.21% Li2O (indicated). Completed $14M financing. Outlined three-phase development plan for Clearwater.",
    },
  ];

  const drafts: Draft[] = [
    {
      id: "drf_001", kind: "filing_thread", filingId: "fil_001", aiEngine: "template",
      title: "Thread: Phase 2 Drill Results",
      tweets: [
        "We just published Phase 2 drill results from Clearwater — and 11 of 14 holes hit lithium-bearing pegmatite. Headline intercept: 1.42% Li2O over 38 meters. Here's what that means. 🧵 $MLTH",
        "Why it matters: grade and thickness are what move a lithium project toward economic viability. 1.42% over 38m is consistent with the zones that supported our 18.4Mt indicated resource.",
        "What's next: Phase 3 drilling is planned for Q3 2026, targeting extensions along strike to the northeast. Full results and drill tables are in our 8-K filing.",
        "Read the complete filing here: sec.gov → MLTH 8-K (June 9, 2026). Questions? Ask below — we answer from the public record.",
      ],
      status: "pending", complianceFlags: [], createdAt: iso(2),
    },
    {
      id: "drf_002", kind: "filing_thread", filingId: "fil_002", aiEngine: "template",
      title: "Thread: Q1 2026 Financials",
      tweets: [
        "Our Q1 2026 10-Q is filed. The three numbers shareholders ask about most: cash, burn, and runway. 🧵 $MLTH",
        "Cash: $11.2M, zero debt. Quarterly burn: $1.8M — up 22% as Phase 2 drilling accelerated. That's deliberate: drilling season is when the money should be working.",
        "At current burn, runway extends well into 2027 — past the planned Phase 3 program and feasibility milestones. Full statements in the 10-Q.",
      ],
      status: "posted", complianceFlags: [], createdAt: iso(18), decidedAt: iso(17), decidedBy: "Sarah Okafor (CFO)", postedAt: iso(17),
    },
    {
      id: "drf_003", kind: "filing_thread", filingId: "fil_003", aiEngine: "template",
      title: "Thread: COO Appointment",
      tweets: [
        "Meridian welcomes Dana Whitfield as Chief Operating Officer. 18 years in lithium processing, most recently VP Operations at a producing spodumene mine. $MLTH",
        "Why this hire now: moving Clearwater from resource definition toward development requires operating experience, not just exploration success. Dana has taken a project through exactly this transition.",
      ],
      status: "posted", complianceFlags: [], createdAt: iso(34), decidedAt: iso(33), decidedBy: "Sarah Okafor (CFO)", postedAt: iso(33),
    },
    {
      id: "drf_004", kind: "cadence", aiEngine: "template",
      title: "Explainer: What is spodumene?",
      tweets: [
        "Lithium 101 for our shareholders: what actually is spodumene, and why do we talk about it so much? 🧵 $MLTH",
        "Spodumene is the hard-rock mineral that hosts lithium at Clearwater. Hard-rock projects typically reach production faster than brine projects and produce concentrate battery makers can use directly.",
        "Our December 2025 resource estimate: 18.4Mt @ 1.21% Li2O (indicated). All technical details are in our Fiscal 2025 10-K on EDGAR.",
      ],
      status: "pending", complianceFlags: [], createdAt: iso(1),
    },
    {
      id: "drf_005", kind: "cadence", aiEngine: "template",
      title: "Cadence post — blocked example",
      tweets: [
        "With lithium demand set for explosive growth, $MLTH is deeply undervalued at these levels. Don't miss this one — our Clearwater project is a game-changer.",
      ],
      status: "blocked",
      complianceFlags: [
        { rule: "Valuation claim", excerpt: "undervalued", severity: "block" },
        { rule: "Investment advice", excerpt: "Don't miss", severity: "block" },
        { rule: "Forward-looking without basis", excerpt: "explosive growth", severity: "warn" },
        { rule: "Unverifiable superlative", excerpt: "game-changer", severity: "warn" },
      ],
      createdAt: iso(6),
    },
  ];

  const metrics: WeeklyMetric[] = [];
  let followers = 2140;
  for (let w = 11; w >= 0; w--) {
    const drillWeek = w === 0 || w === 5; // news weeks spike
    followers += drillWeek ? 320 + w * 4 : 60 + Math.round(w * 7.3);
    metrics.push({
      weekStart: isoDate(w * 7 + ((new Date().getDay() + 6) % 7)),
      followers,
      impressions: drillWeek ? 148000 - w * 900 : 31000 + (11 - w) * 1850,
      engagements: drillWeek ? 5200 - w * 40 : 980 + (11 - w) * 85,
      mentions: drillWeek ? 214 : 38 + (11 - w) * 6,
      sentimentScore: Number((0.18 + (11 - w) * 0.028 + (drillWeek ? 0.12 : 0)).toFixed(2)),
    });
  }

  // Demo score history: a believable climb from D to B over ten weeks.
  const scoreHistory: ScoreSnapshot[] = [48, 51, 50, 56, 60, 58, 64, 67, 71, 74].map((score, i) => ({
    ts: iso((9 - i) * 7),
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F",
    pillars: [
      { key: "visibility", label: "Investor Visibility", score: Math.min(100, score - 8 + i) },
      { key: "conversation", label: "Conversation Volume", score: Math.min(100, score - 4 + i * 2) },
      { key: "engine", label: "Your IR Engine", score: Math.min(100, score + 10 + i) },
    ],
  }));

  const calendar = [
    { id: "cal_001", date: isoDate(-21), title: "Q2 2026 earnings release", type: "earnings" as const, note: "Before market open" },
    { id: "cal_002", date: isoDate(-28), title: "Quiet period begins", type: "quiet_start" as const, note: "Auto-locks publishing 14 days before earnings" },
    { id: "cal_003", date: isoDate(-10), title: "10-Q filing deadline", type: "filing_deadline" as const },
    { id: "cal_004", date: isoDate(-45), title: "Lithium & Battery Metals Conference", type: "conference" as const, note: "Non-deal roadshow, NYC" },
  ];

  const contacts = [
    {
      id: "con_001", name: "Tidewater Resource Partners", firm: "Tidewater Resource Partners", type: "fund" as const,
      stage: "contacted" as const, peersHeld: ["PLL", "SGML"], aum: "$1.4B",
      notes: "Concentrated small-cap lithium book. Initiated PLL Q3 2025.",
      interactions: [
        { id: "int_1", ts: iso(12), kind: "email" as const, summary: "Sent intro deck referencing their PLL/SGML positions." },
        { id: "int_2", ts: iso(4), kind: "call" as const, summary: "20-min intro call with PM. Interested post-Phase 3 results." },
      ],
      nextFollowUp: isoDate(-7), createdAt: iso(14),
    },
    {
      id: "con_002", name: "Aldercrest Family Office", firm: "Aldercrest Family Office", type: "fund" as const,
      stage: "identified" as const, peersHeld: ["LAC"], aum: "$600M",
      notes: "Long-term LAC holder. Patient capital, pre-feasibility appetite.",
      interactions: [], nextFollowUp: isoDate(-3), createdAt: iso(8),
    },
    {
      id: "con_003", name: "Dana Reyes", firm: "Cormark Securities", type: "analyst" as const,
      stage: "meeting" as const, email: "dreyes@example.com",
      notes: "Covers junior lithium names. Open to initiating coverage after next resource update.",
      interactions: [{ id: "int_3", ts: iso(6), kind: "meeting" as const, summary: "Coffee in Toronto. Walked through Clearwater economics." }],
      nextFollowUp: isoDate(-10), createdAt: iso(20),
    },
    {
      id: "con_004", name: "Bluffview Capital Management", firm: "Bluffview Capital", type: "fund" as const,
      stage: "holder" as const, peersHeld: ["PLL"], aum: "$340M",
      notes: "Took a starter position after our last raise. Now a holder.",
      interactions: [{ id: "int_4", ts: iso(30), kind: "meeting" as const, summary: "Closed — participated in the financing." }],
      createdAt: iso(35),
    },
  ];

  const documents = [
    { id: "doc_001", name: "Q1 2026 10-Q", category: "filing" as const, url: "https://www.sec.gov/cgi-bin/browse-edgar", filedDate: isoDate(18), uploadedAt: iso(18), source: "edgar" as const },
    { id: "doc_002", name: "Phase 2 Drill Results 8-K", category: "filing" as const, url: "https://www.sec.gov/cgi-bin/browse-edgar", filedDate: isoDate(2), uploadedAt: iso(2), source: "edgar" as const },
    { id: "doc_003", name: "Insider Trading Policy", category: "policy" as const, note: "Board-approved Jan 2026. Blackout windows defined.", uploadedAt: iso(120), source: "uploaded" as const },
    { id: "doc_004", name: "Disclosure & Reg FD Policy", category: "policy" as const, note: "Designates @MeridianLithium and the company page as disclosure channels.", uploadedAt: iso(120), source: "uploaded" as const },
    { id: "doc_005", name: "Audit Committee Charter", category: "governance" as const, uploadedAt: iso(200), source: "uploaded" as const },
    { id: "doc_006", name: "December 2025 Financing — Subscription Docs", category: "financing" as const, note: "$14M raise. Closed.", uploadedAt: iso(95), source: "uploaded" as const },
    { id: "doc_007", name: "Corporate Investor Deck (v12)", category: "ir_material" as const, note: "Current version used for NDRs.", uploadedAt: iso(10), source: "uploaded" as const },
  ];

  return {
    scoreHistory,
    pressReleases: [],
    disclosureChecks: [],
    calendar,
    contacts,
    documents,
    publicQuestions: [
      {
        id: "puq_001", ticker: "MLTH", author: "Ray (retail investor)",
        question: "Does the 18.4Mt resource estimate include the new Phase 2 intercepts, or is an updated estimate coming?",
        ts: iso(1), status: "open",
      },
      {
        id: "puq_002", ticker: "MLTH", author: "M. Chen",
        question: "What's the planned use of the remaining cash — more drilling or feasibility work?",
        ts: iso(9), status: "answered",
        answerText: "Per our Q1 10-Q: the budget prioritizes Phase 3 drilling (Q3 2026) alongside ongoing feasibility workstreams. Full breakdown is in the filing on EDGAR. — Meridian Lithium (verified)",
        answeredAt: iso(8),
      },
    ],
    company: {
      name: "Meridian Lithium Corp.",
      ticker: "MLTH",
      exchange: "NASDAQ",
      cik: "", // fictional demo company — no real EDGAR record (never borrow another company's CIK)
      city: "Houston",
      state: "TX",
      sector: "Lithium Exploration & Development",
      description: "Meridian Lithium is advancing the Clearwater hard-rock lithium project toward feasibility, with an 18.4Mt indicated resource at 1.21% Li2O.",
      approverName: "Sarah Okafor",
      approverTitle: "CFO",
      quietMode: false,
      disclosureText: "Disclosure: This account is operated on behalf of Meridian Lithium Corp. via PubcoZone, a compensated service provider. Not investment advice. See SEC filings at sec.gov for complete information.",
      flsText: "This post contains forward-looking statements subject to risks and uncertainties described in our SEC filings. Actual results may differ materially.",
      peers: ["PLL", "SGML", "LAC", "ALB"],
      xHandle: "@MeridianLithium",
      onboarded: true,
      tier: "growth",
      onboarding_complete: true,
    },
    filings,
    drafts,
    audit: [
      { id: "aud_001", ts: iso(33), actor: "Sarah Okafor (CFO)", action: "DRAFT_APPROVED", detail: "Approved 'Thread: COO Appointment' (drf_003)" },
      { id: "aud_002", ts: iso(33), actor: "system", action: "PUBLISHED", detail: "Posted drf_003 to X with mandatory disclosures appended" },
      { id: "aud_003", ts: iso(18), actor: "system", action: "DRAFT_CREATED", detail: "Generated thread from 10-Q filing fil_002" },
      { id: "aud_004", ts: iso(17), actor: "Sarah Okafor (CFO)", action: "DRAFT_APPROVED", detail: "Approved 'Thread: Q1 2026 Financials' (drf_002)" },
      { id: "aud_005", ts: iso(17), actor: "system", action: "PUBLISHED", detail: "Posted drf_002 to X with mandatory disclosures appended" },
      { id: "aud_006", ts: iso(6), actor: "compliance-engine", action: "DRAFT_BLOCKED", detail: "drf_005 blocked: Valuation claim ('undervalued'), Investment advice ('Don't miss')" },
      { id: "aud_007", ts: iso(2), actor: "system", action: "FILING_DETECTED", detail: "New 8-K detected: Phase 2 Drill Program Results (fil_001)" },
      { id: "aud_008", ts: iso(2), actor: "system", action: "DRAFT_CREATED", detail: "Generated thread from 8-K filing fil_001 — awaiting approval" },
    ],
    investors: [
      {
        id: "inv_001", fund: "Tidewater Resource Partners", type: "Hedge Fund", aum: "$1.4B",
        peersHeld: ["PLL", "SGML"], positionNote: "Initiated PLL Q3 2025 (~$18M), added SGML Q4. Concentrated small-cap lithium book.",
        stage: "identified",
        outreachDraft: "Hi — noticed Tidewater holds Piedmont and Sigma. Meridian's Clearwater project (18.4Mt @ 1.21% Li2O, indicated) just reported Phase 2 results: 1.42% over 38m. Happy to set up 20 minutes with our CFO if hard-rock lithium pre-feasibility fits the mandate. All materials: ir.meridianlithium.com",
      },
      {
        id: "inv_002", fund: "Aldercrest Family Office", type: "Family Office", aum: "$600M",
        peersHeld: ["LAC"], positionNote: "Long-term LAC holder since 2023. History of pre-feasibility entries in battery metals.",
        stage: "outreach_drafted",
        outreachDraft: "Hi — Aldercrest's LAC position suggests battery-metals conviction with patience for the development cycle. Meridian is earlier-stage: 18.4Mt indicated, fully funded into 2027, feasibility track underway. Our CFO would welcome a short intro call.",
      },
      {
        id: "inv_003", fund: "Sable Point Capital", type: "Hedge Fund", aum: "$2.2B",
        peersHeld: ["ALB", "SGML"], positionNote: "Large-cap anchored (ALB) with selective small-cap satellites. Entered SGML after maiden resource.",
        stage: "contacted",
        outreachDraft: "Follow-up sent June 3 — referenced Phase 2 drill timeline. Awaiting response; flag again after Phase 3 announcement.",
      },
      {
        id: "inv_004", fund: "Bluffview Capital Management", type: "RIA", aum: "$340M",
        peersHeld: ["PLL"], positionNote: "Small PLL starter position Q1 2026. Newsletter mentions interest in 'pre-production lithium with US exposure.'",
        stage: "meeting",
        outreachDraft: "Meeting scheduled June 17, 2:00 PM CT with CFO. Deck: auto-updated investor deck v12 (June edition).",
      },
    ],
    mentions: [
      {
        id: "men_001", author: "@LithiumScout", ts: iso(1), sentiment: "question", requiresNonPublicInfo: false,
        text: "$MLTH solid intercepts. When does Phase 3 drilling actually start and how many meters planned?",
      },
      {
        id: "men_002", author: "@smallcap_sam", ts: iso(1), sentiment: "question", requiresNonPublicInfo: true,
        text: "@MeridianLithium are you in talks with any other offtake partners beyond the MOU? Anything close to signing?",
      },
      {
        id: "men_003", author: "@batterymetalsbull", ts: iso(2), sentiment: "positive", requiresNonPublicInfo: false,
        text: "11 of 14 holes hitting pegmatite at $MLTH Clearwater. Quietly one of the better Phase 2 programs this year in hard rock.",
      },
      {
        id: "men_004", author: "@shortsighted_cap", ts: iso(3), sentiment: "negative", requiresNonPublicInfo: false,
        text: "$MLTH burning $1.8M a quarter with no revenue. Another lithium story stock that will need to dilute by year end.",
      },
    ],
    metrics,
  };
}
