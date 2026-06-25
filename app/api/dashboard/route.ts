import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listTeamProfiles, saveMyProfile, listTeamUpdates, postTeamUpdate, deleteTeamUpdate, saveDashboardLayout } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  return { mine };
}

// GET — team presence + recent updates (the live parts of the home dashboard).
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const [profiles, updates] = await Promise.all([listTeamProfiles(), listTeamUpdates()]);
  return NextResponse.json({ profiles, updates });
}

// POST — { action: "status"|"profile"|"update"|"deleteUpdate", ... }
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));

  if (b.action === "update") {
    const result = await postTeamUpdate(String(b.body ?? ""), String(b.authorName ?? "Teammate"));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    return NextResponse.json({ ok: true, updates: await listTeamUpdates() });
  }

  if (b.action === "deleteUpdate") {
    if (b.id) await deleteTeamUpdate(String(b.id));
    return NextResponse.json({ ok: true, updates: await listTeamUpdates() });
  }

  if (b.action === "layout") {
    await saveDashboardLayout({ order: Array.isArray(b.order) ? b.order.map(String) : [], hidden: Array.isArray(b.hidden) ? b.hidden.map(String) : [] });
    return NextResponse.json({ ok: true });
  }

  // status / profile save (in/out, reason, name, birthday)
  await saveMyProfile({
    displayName: typeof b.displayName === "string" ? b.displayName : undefined,
    officeStatus: b.officeStatus === "out" ? "out" : b.officeStatus === "in" ? "in" : undefined,
    statusReason: typeof b.statusReason === "string" ? b.statusReason : undefined,
    birthday: b.birthday === null || typeof b.birthday === "string" ? b.birthday : undefined,
  });
  return NextResponse.json({ ok: true, profiles: await listTeamProfiles() });
}
