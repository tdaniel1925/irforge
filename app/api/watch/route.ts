import { addWatch, rateAllow, removeWatchByMember } from "@/lib/publicStats";
import { sendWatchConfirmation } from "@/lib/email";
import { getMyMember } from "@/lib/members";
import { createServerSupabase } from "@/lib/supabase/server";
import { optInInvestorByTicker } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let payload: { ticker?: string; email?: string; irOptin?: boolean; name?: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const ticker = (payload.ticker ?? "").toUpperCase().trim().slice(0, 8);
  if (!ticker) return Response.json({ error: "Missing ticker." }, { status: 400 });

  // If a member is logged in, tie the watch to their account + account email.
  const me = await getMyMember();
  let email = (payload.email ?? "").trim().toLowerCase();
  let memberId: string | undefined;
  if (me) {
    memberId = me.id;
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) email = user.email.toLowerCase();
  }

  if (!EMAIL_RE.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });

  // Per-IP cap in ADDITION to per-email — the confirmation email is sent to an
  // attacker-controlled address, so an email-only limit is bypassed by rotating the
  // target (email-bombing from our domain).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await rateAllow(`watch-ip:${ip}`, 10)) || !(await rateAllow(`watch:${email}`, 10))) {
    return Response.json({ error: "Too many requests — try again in a minute." }, { status: 429 });
  }

  const { already } = await addWatch({ ticker, email, ts: new Date().toISOString(), memberId });

  if (!already) {
    try {
      await sendWatchConfirmation(email, ticker);
    } catch (e) {
      console.error("[watch] confirmation email failed:", e);
    }
  }

  // If they also opted in to updates DIRECTLY from the company, record that as an
  // opted-in investor contact in the company's CRM (best-effort; never fails the
  // watch). No-op if the ticker isn't a claimed company.
  let optedIn = false;
  if (payload.irOptin) {
    const r = await optInInvestorByTicker(ticker, email, payload.name);
    optedIn = r.ok;
  }

  return Response.json({ ok: true, already, optedIn });
}

// Remove a watch (members only — from their watchlist).
export async function DELETE(req: Request) {
  const me = await getMyMember();
  if (!me) return Response.json({ error: "Not signed in." }, { status: 401 });
  let payload: { ticker?: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const ticker = (payload.ticker ?? "").toUpperCase().trim().slice(0, 8);
  if (!ticker) return Response.json({ error: "Missing ticker." }, { status: 400 });
  await removeWatchByMember(me.id, ticker);
  return Response.json({ ok: true });
}
