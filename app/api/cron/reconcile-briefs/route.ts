import { fulfillBriefBySession, listStuckPaidBriefs } from "@/lib/briefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Backstop for the $3,500 Sponsored Brief pipeline: re-attempt generation for any
// order stuck in 'paid' (money arrived, generation failed, and Stripe's webhook
// retries have been exhausted). Idempotent — fulfillBriefBySession no-ops on
// generated/published orders.
//
// Auth: CRON_SECRET bearer/query only. We deliberately do NOT trust the
// x-vercel-cron header (client-spoofable). Set CRON_SECRET in Vercel env — Vercel
// sends it as `Authorization: Bearer <secret>` on cron invocations.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const stuck = await listStuckPaidBriefs();
  let fulfilled = 0;
  const failures: { id: string; reason: string }[] = [];
  for (const order of stuck) {
    try {
      const r = await fulfillBriefBySession(order.stripeSessionId);
      if (r.ok) fulfilled++;
      else failures.push({ id: order.id, reason: r.reason ?? "unknown" });
    } catch (e) {
      failures.push({ id: order.id, reason: e instanceof Error ? e.message : "threw" });
    }
  }

  if (failures.length) console.error("[reconcile-briefs] still stuck:", JSON.stringify(failures));
  return Response.json({ ok: true, stuck: stuck.length, fulfilled, stillStuck: failures.length });
}
