import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { generateCalendar, listLatestCalendar } from "@/lib/social/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Planning a whole month is an LLM call; give it room so the platform doesn't
// kill the request and return a non-JSON error page. Matches month/route.ts.
export const maxDuration = 60;

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "social"))) return { error: NextResponse.json({ error: "Social Content Engine not enabled." }, { status: 403 }) };
  return { mine };
}

// GET — the most recent generated calendar (slots grouped by batch).
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json(await listLatestCalendar());
}

// POST { startDate?, weeks? } — plan + create a new calendar of draft slots.
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const result = await generateCalendar({
    startDate: typeof body.startDate === "string" ? body.startDate : undefined,
    weeks: typeof body.weeks === "number" ? body.weeks : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  const calendar = await listLatestCalendar();
  return NextResponse.json({ ok: true, created: result.created, ...calendar });
}
