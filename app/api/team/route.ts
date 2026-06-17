import { NextResponse } from "next/server";
import { listTeam, inviteTeammate, changeRole, removeMember } from "@/lib/team";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listTeam();
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string };
  const role = body.role === "admin" ? "admin" : "member";
  const res = await inviteTeammate(String(body.email ?? ""), role);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; role?: string };
  if (!body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const role = body.role === "admin" ? "admin" : "member";
  const res = await changeRole(String(body.id), role);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const res = await removeMember(id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
