import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { setBriefPublished } from "@/lib/briefs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { id, published } — publish/unpublish a generated brief (owner only).
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 422 });
  await setBriefPublished(String(b.id), Boolean(b.published));
  return NextResponse.json({ ok: true });
}
