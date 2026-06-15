import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { isQuietPeriodActive, startQuietPeriod, endQuietPeriods } from "@/lib/iros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — is a quiet period active for the caller's company?
export async function GET() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  return NextResponse.json({ active: await isQuietPeriodActive() });
}

// POST { action: 'start'|'end', description?, expiresAt? }
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  if (!(await companyHasFeature(mine.id, "compliance"))) {
    return NextResponse.json({ error: "Compliance feature not enabled." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.action === "start") {
    await startQuietPeriod(String(body.description ?? "Quiet period"), body.expiresAt ?? null);
    return NextResponse.json({ ok: true, active: true });
  }
  if (body.action === "end") {
    await endQuietPeriods();
    return NextResponse.json({ ok: true, active: false });
  }
  return NextResponse.json({ error: "Bad request." }, { status: 422 });
}
