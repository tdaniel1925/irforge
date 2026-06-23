import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { draftCalendarBatch, listLatestCalendar } from "@/lib/social/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Drafting calls Claude + Gemini per slot — give it room.
export const maxDuration = 120;

// POST — draft the next batch of empty slots (capped per call). Returns progress;
// the client calls again while remaining > 0. Idempotent: only empty slots draft.
export async function POST() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  if (!(await companyHasFeature(mine.id, "social"))) {
    return NextResponse.json({ error: "Social Content Engine not enabled." }, { status: 403 });
  }

  const result = await draftCalendarBatch();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  // Return refreshed slots so the grid updates as drafting progresses.
  const calendar = await listLatestCalendar();
  return NextResponse.json({ ok: true, drafted: result.drafted, remaining: result.remaining, slots: calendar.slots });
}
