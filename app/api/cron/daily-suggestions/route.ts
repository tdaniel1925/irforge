import { generateDailySuggestions } from "@/lib/social/calendar";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Daily cron: draft one fresh suggested post per active company into the
// Needs-approval queue, so Posts always has something new to review or reject.
// Runs via the service-role client (no session). Time-budgeted for serverless.
// Auth: CRON_SECRET only (shared cronAuthorized — x-vercel-cron is client-spoofable).

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Leave headroom under the 120s function limit.
  const result = await generateDailySuggestions(100_000);
  return Response.json({ ok: true, ...result });
}
