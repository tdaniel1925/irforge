import { reconcileAllScheduled } from "@/lib/social/calendar";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Confirm delivery of scheduled social posts: ask Ayrshare each post's live status
// and flip rows to published (with the live URL) or record a failure. Runs across
// all companies via the service-role client. Time-budgeted for serverless.
// Auth: CRON_SECRET only (shared cronAuthorized — x-vercel-cron is client-spoofable).

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await reconcileAllScheduled(110_000);
  return Response.json({ ok: true, ...result });
}
