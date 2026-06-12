import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Admin-only: returns all companies + claim requests. Hard-gated on is_admin.
// Uses the service-role client (bypasses RLS) ONLY after confirming the caller is an admin.
export async function GET() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: meRow } = await svc.from("companies").select("is_admin").eq("id", mine.id).single();
  if (!meRow?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { data: companies } = await svc
    .from("companies")
    .select("id, name, ticker, tier, subscription_status, onboarding_complete, created_at, stripe_customer_id, stripe_subscription_id")
    .order("created_at", { ascending: false });
  const { data: claims } = await svc
    .from("claim_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const tierRevenue: Record<string, number> = { starter: 1500, growth: 3500, pro: 6000 };
  const mrr = (companies ?? [])
    .filter((c) => c.subscription_status === "active")
    .reduce((a, c) => a + (tierRevenue[c.tier ?? "growth"] ?? 0), 0);

  return NextResponse.json({
    companies: companies ?? [],
    claims: claims ?? [],
    stats: {
      total: companies?.length ?? 0,
      active: (companies ?? []).filter((c) => c.subscription_status === "active").length,
      pastDue: (companies ?? []).filter((c) => c.subscription_status === "past_due").length,
      mrr,
      pendingClaims: (claims ?? []).filter((c) => c.status === "pending").length,
    },
  });
}

// PATCH — verify/reject a claim request.
export async function PATCH(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const svc = createServiceClient();
  const { data: meRow } = await svc.from("companies").select("is_admin").eq("id", mine.id).single();
  if (!meRow?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !["verified", "rejected"].includes(status)) return NextResponse.json({ error: "Bad request" }, { status: 422 });
  await svc.from("claim_requests").update({ status }).eq("id", id);
  return NextResponse.json({ ok: true });
}
