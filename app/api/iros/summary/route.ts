import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature, writeAudit } from "@/lib/platform";
import { getMetrics } from "@/lib/iros";
import { weeklySummary } from "@/lib/ai";
import { sendEmail, emailEnabled } from "@/lib/email";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { email? } — generate this week's summary; optionally email it.
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  if (!(await companyHasFeature(mine.id, "intelligence"))) return NextResponse.json({ error: "Intelligence not enabled." }, { status: 403 });

  const m = await getMetrics();
  const metricsText = [
    `Posts published (7d): ${m.publishedLast7}`,
    `Pipeline: ${Object.entries(m.postsByStatus).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}`,
    `Reg FD mix: ${m.classByLevel.green} green / ${m.classByLevel.yellow} yellow / ${m.classByLevel.red} red`,
    `Inbound this week: ${m.inboundLast7} (${m.inboundOpen} still open)`,
    `Stakeholders tracked: ${m.stakeholders}`,
    `Quiet period: ${m.quietActive ? "ACTIVE" : "off"}`,
  ].join("\n");

  const summary = await weeklySummary(metricsText, mine.company);

  // Optionally email the requester (or their account email).
  const body = await req.json().catch(() => ({}));
  let emailed = false;
  let to = String(body.email ?? "").trim();
  if (!to) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    to = user?.email ?? "";
  }
  if (to && emailEnabled()) {
    try {
      const html = `<div style="font-family:system-ui,sans-serif"><h2>${mine.company.name} — Weekly IR summary</h2><pre style="white-space:pre-wrap;font-family:inherit">${summary.markdown.replace(/[<>]/g, "")}</pre></div>`;
      await sendEmail({ to, subject: `${mine.company.name}: weekly IR summary`, html });
      emailed = true;
    } catch (e) {
      console.error("[summary] email failed:", e);
    }
  }

  await writeAudit({ companyId: mine.id, action: "summary.generated", entityType: "summary", payload: { emailed } });
  return NextResponse.json({ ok: true, markdown: summary.markdown, metrics: m, emailed });
}
