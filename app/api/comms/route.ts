import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listTeamProfiles, saveMyProfile, listChat, postChat, deleteChat } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  return { mine };
}

// GET — presence (who's in/out) + chat messages for the right comms sidebar.
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const [profiles, chat] = await Promise.all([listTeamProfiles(), listChat()]);
  return NextResponse.json({ profiles, chat });
}

// POST — { action: "status"|"chat"|"deleteChat", ... }
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));

  if (b.action === "chat") {
    const r = await postChat(String(b.body ?? ""));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json({ ok: true, chat: await listChat() });
  }
  if (b.action === "deleteChat") {
    if (b.id) await deleteChat(String(b.id));
    return NextResponse.json({ ok: true, chat: await listChat() });
  }
  // status toggle (in/out + optional reason)
  await saveMyProfile({
    officeStatus: b.officeStatus === "out" ? "out" : "in",
    statusReason: typeof b.statusReason === "string" ? b.statusReason : undefined,
  });
  return NextResponse.json({ ok: true, profiles: await listTeamProfiles() });
}
