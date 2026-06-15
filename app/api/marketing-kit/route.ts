import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { announcementPosts } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE = "https://pubcozone.com";

// GET — the company's marketing kit: AI announcement posts + ready snippets,
// email template, and copy blocks. Free for any claimed (logged-in) company.
export async function GET() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  const ticker = (mine.company.ticker || "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: "Add your ticker in Settings first." }, { status: 422 });

  const name = mine.company.name || `$${ticker}`;
  const welcome = `${SITE}/welcome/${ticker}`;
  const report = `${SITE}/t/${ticker}`;

  const { posts, engine } = await announcementPosts(mine.company, welcome);

  // Copy-paste replies for the noisy platforms (the judo move).
  const replySnippets = [
    `We answer this for real, on the record 👉 ${welcome}`,
    `Straight answer (not an anonymous guess) here: ${report}`,
    `Happy to address this directly — we engage investors openly at ${welcome}`,
  ];

  // Investor email announcement.
  const emailTemplate = `Subject: Where to get straight answers about ${name}

Hi [investor],

We know it's hard to separate signal from noise on the usual message boards. So we've made it simple: we now engage with investors openly and on the record at PubcoZone — with real filings, fair AI-balanced information, and direct answers to your questions.

See our page and ask us anything:
${welcome}

Thanks for following ${name}.

— The ${name} team`;

  // Paste-in HTML block for their IR website.
  const irHtmlBlock = `<a href="${welcome}" target="_blank" rel="noopener" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;border-radius:10px;font-weight:700;text-decoration:none;font-family:sans-serif">💬 Ask ${name} on PubcoZone →</a>`;

  return NextResponse.json({
    ticker,
    name,
    welcome,
    report,
    posts,
    engine,
    replySnippets,
    emailTemplate,
    irHtmlBlock,
    graphics: [
      { type: "card", label: "Social card (1200×630)", url: `${SITE}/api/promo/${ticker}?type=card` },
      { type: "xheader", label: "X header (1500×500)", url: `${SITE}/api/promo/${ticker}?type=xheader` },
      { type: "linkedin", label: "LinkedIn banner (1584×396)", url: `${SITE}/api/promo/${ticker}?type=linkedin` },
    ],
  });
}
