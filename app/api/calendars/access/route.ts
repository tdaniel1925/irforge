import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { getCalendarAccess, setCalendarAccess } from "@/lib/calendars";
import { listTeam } from "@/lib/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  return { mine };
}

// GET ?calendarId=… — the team roster + which members currently have access to
// this calendar (so the admin UI can render checkboxes).
export async function GET(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const calendarId = new URL(req.url).searchParams.get("calendarId");
  const { members, isAdmin } = await listTeam();
  if (!isAdmin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const access = calendarId ? await getCalendarAccess(calendarId) : [];
  return NextResponse.json({ members, access });
}

// POST — { calendarId, userIds: [] } : replace who can see this calendar.
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const { isAdmin } = await listTeam();
  if (!isAdmin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.calendarId) return NextResponse.json({ error: "Missing calendarId." }, { status: 422 });
  const result = await setCalendarAccess(String(b.calendarId), Array.isArray(b.userIds) ? b.userIds.map(String) : []);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
