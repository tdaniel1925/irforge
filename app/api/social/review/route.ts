import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { bulkDecision, updatePostFields, getPost } from "@/lib/iros";
import { listLatestCalendar } from "@/lib/social/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "social"))) return { error: NextResponse.json({ error: "Social Content Engine not enabled." }, { status: 403 }) };
  return { mine };
}

// GET — the latest calendar's drafted slots for the review screen.
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json(await listLatestCalendar());
}

// POST — actions on the review screen:
//   { action: "bulk", decision: "approved"|"rejected", ids: [...] }
//   { action: "edit", id, body }
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));

  if (body.action === "edit") {
    if (!body.id || typeof body.body !== "string") return NextResponse.json({ error: "Missing id or body." }, { status: 422 });
    const post = await getPost(String(body.id));
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    await updatePostFields(String(body.id), { body: String(body.body).slice(0, 4000) });
    const calendar = await listLatestCalendar();
    return NextResponse.json({ ok: true, slots: calendar.slots });
  }

  if (body.action === "bulk") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const decision = body.decision === "rejected" ? "rejected" : "approved";
    if (!ids.length) return NextResponse.json({ error: "No posts selected." }, { status: 422 });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;
    const result = await bulkDecision({ postIds: ids, decision, ip, userAgent });
    const calendar = await listLatestCalendar();
    return NextResponse.json({ ok: true, ...result, slots: calendar.slots });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 422 });
}
