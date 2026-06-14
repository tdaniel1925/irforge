import { addWatch } from "@/lib/publicStats";
import { rateAllow } from "@/lib/publicStats";
import { sendWatchConfirmation } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let payload: { ticker?: string; email?: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const ticker = (payload.ticker ?? "").toUpperCase().trim().slice(0, 8);
  const email = (payload.email ?? "").trim().toLowerCase();
  if (!ticker) return Response.json({ error: "Missing ticker." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });

  // Light abuse guard.
  const allowed = await rateAllow(`watch:${email}`, 10);
  if (!allowed) return Response.json({ error: "Too many requests — try again in a minute." }, { status: 429 });

  const { already } = await addWatch({ ticker, email, ts: new Date().toISOString() });

  // Confirmation email is best-effort: a send failure must not fail the subscribe.
  if (!already) {
    try {
      await sendWatchConfirmation(email, ticker);
    } catch (e) {
      console.error("[watch] confirmation email failed:", e);
    }
  }

  return Response.json({ ok: true, already });
}
