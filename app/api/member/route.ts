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

  const patch: Record<string, string | boolean> = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName.trim().slice(0, 60);
  if (typeof body.bio === "string") patch.bio = body.bio.trim().slice(0, 280);
  if (typeof body.avatarUrl === "string") patch.avatarUrl = body.avatarUrl.slice(0, 500);
  let handleOk = false;
  if (typeof body.handle === "string") {
    const h = body.handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (h.length >= 3) { patch.handle = h; handleOk = true; }
  }
  // Only an EXPLICIT username submission completes the profile — that's the gate for
  // posting to a discussion board. Members get an auto-generated handle at signup, so
  // checking the stored handle (or any other field save) would self-grant the gate
  // without the investor ever choosing a name.
  if (handleOk) {
    patch.profileComplete = true;
  }

  const updated = await updateMyMember(patch as Partial<import("@/lib/members").Member>);
  if (!updated) {
    // Most likely a duplicate handle.
    return Response.json({ error: "Couldn't save — that handle may be taken." }, { status: 409 });
  }
  return Response.json({ ok: true, member: updated });
}
