import { generateDailySuggestions } from "@/lib/social/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Daily cron: draft one fresh suggested post per active company into the
// Needs-approval queue, so Posts always has something new to review or reject.
// Runs via the service-role client (no session). Time-budgeted for serverless.
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
  // Leave headroom under the 120s function limit.
  const result = await generateDailySuggestions(100_000);
  return Response.json({ ok: true, ...result });
}
