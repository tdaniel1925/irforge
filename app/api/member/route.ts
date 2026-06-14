import { getMyMember, updateMyMember } from "@/lib/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getMyMember();
  if (!me) return Response.json({ error: "Not signed in." }, { status: 401 });
  return Response.json({ ok: true, member: me.member });
}

export async function POST(req: Request) {
  const me = await getMyMember();
  if (!me) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: { displayName?: string; bio?: string; handle?: string; avatarUrl?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName.trim().slice(0, 60);
  if (typeof body.bio === "string") patch.bio = body.bio.trim().slice(0, 280);
  if (typeof body.avatarUrl === "string") patch.avatarUrl = body.avatarUrl.slice(0, 500);
  if (typeof body.handle === "string") {
    const h = body.handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (h.length >= 3) patch.handle = h;
  }

  const updated = await updateMyMember(patch);
  if (!updated) {
    // Most likely a duplicate handle.
    return Response.json({ error: "Couldn't save — that handle may be taken." }, { status: 409 });
  }
  return Response.json({ ok: true, member: updated });
}
