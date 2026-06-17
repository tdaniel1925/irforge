import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/team";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) return NextResponse.json({ error: "Missing token." }, { status: 400 });
  const res = await acceptInvite(String(body.token));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
