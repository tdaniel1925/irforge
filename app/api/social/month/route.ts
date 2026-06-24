import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { getMonthCalendar, createManualPost } from "@/lib/social/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "social"))) return { error: NextResponse.json({ error: "Social Content Engine not enabled." }, { status: 403 }) };
  return { mine };
}

// GET ?start=ISO&end=ISO — posts + IR events + quiet windows for the month grid.
export async function GET(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "Missing start/end." }, { status: 422 });
  return NextResponse.json(await getMonthCalendar(start, end));
}

// POST — create a manual post. Body: { body, platform, scheduledAt, theme?, withImage? }.
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  const result = await createManualPost({
    body: String(b.body ?? ""),
    platform: String(b.platform ?? "linkedin"),
    scheduledAt: String(b.scheduledAt ?? ""),
    theme: typeof b.theme === "string" ? b.theme : undefined,
    withImage: Boolean(b.withImage),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true, postId: result.postId });
}
