import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

// Admin-only: returns all companies + claim requests. Hard-gated on super-admin
// (platform_admins). Uses the service-role client (bypasses RLS) ONLY after
// confirming the caller is a platform super-admin.
export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const svc = createServiceClient();
  const { data: companies } = await svc
    .from("companies")
    .select("id, name, ticker, tier, subscription_status, onboarding_complete, created_at, stripe_customer_id, stripe_subscription_id")
    .order("created_at", { ascending: false });
  const { data: claimsRaw } = await svc
    .from("claim_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  // Sign the private proof documents so an admin can open them (1-hour links).
  const claims = await Promise.all(
    (claimsRaw ?? []).map(async (c) => {
      const paths: string[] = Array.isArray(c.doc_paths) ? c.doc_paths : [];
      const docs: { name: string; url: string }[] = [];
      for (const p of paths) {
        const { data } = await svc.storage.from("claim-docs").createSignedUrl(p, 3600);
        if (data?.signedUrl) docs.push({ name: p.split("/").pop() ?? "document", url: data.signedUrl });
      }
      return { ...c, docs };
    })
  );

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
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const svc = createServiceClient();

  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !["verified", "rejected"].includes(status)) return NextResponse.json({ error: "Bad request" }, { status: 422 });
  await svc.from("claim_requests").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
