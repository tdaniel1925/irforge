import { reconcileAllScheduled } from "@/lib/social/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Confirm delivery of scheduled social posts: ask Ayrshare each post's live status
// and flip rows to published (with the live URL) or record a failure. Runs across
// all companies via the service-role client. Time-budgeted for serverless.
function authorized(req: Request): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await reconcileAllScheduled(110_000);
  return Response.json({ ok: true, ...result });
}
