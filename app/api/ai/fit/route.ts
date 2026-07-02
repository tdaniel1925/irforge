import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { fitToLimit } from "@/lib/ai";
import { buildChannelPost, CHANNEL_LIMITS, checkContent, hasBlockingFlags } from "@/lib/compliance";

export const dynamic = "force-dynamic";

// POST { text, channel } — rewrite the post BODY so that, once the channel's
// mandatory disclosure is appended, the whole thing fits that channel's limit.
// Returns { body } (the fitted body the user types) + { preview } (body + disclosure,
// what actually goes out) + { length, limit }. Compliance-safe: re-checks the fitted
// text for blocked language; never drops the disclosure.
export async function POST(req: Request) {
  const { text, channel } = (await req.json().catch(() => ({}))) as { text?: string; channel?: string };
  const body = String(text ?? "").trim().slice(0, 20_000); // cap so a huge paste can't burn tokens
  const ch = String(channel ?? "").trim();
  if (!body) return NextResponse.json({ error: "Nothing to fit." }, { status: 422 });
  const limit = CHANNEL_LIMITS[ch];
  if (!limit) return NextResponse.json({ error: "Unknown channel." }, { status: 422 });

  const { db, authed } = await getStore();
  if (process.env.AUTH_ENABLED === "1" && !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Reserve room for the disclosure: overhead = full-with-disclosure length minus
  // body length, so the rewritten body + disclosure lands under the channel limit.
  const withDisclosure = buildChannelPost(body, db.company, ch);
  const overhead = Math.max(0, withDisclosure.length - body.length);
  const targetBodyLimit = Math.max(20, limit - overhead);

  const fittedBody = await fitToLimit(body, targetBodyLimit, ch);
  if (!fittedBody) return NextResponse.json({ error: "Couldn't shorten it — edit it down manually." }, { status: 502 });

  // Re-run the blocked-language check on the rewritten body (an AI rewrite must not
  // introduce risky phrasing).
  const flags = checkContent([fittedBody]);
  if (hasBlockingFlags(flags)) {
    return NextResponse.json({ error: "The shortened version tripped a compliance flag — please edit it yourself." }, { status: 409 });
  }

  const preview = buildChannelPost(fittedBody, db.company, ch);
  return NextResponse.json({ body: fittedBody, preview, length: preview.length, limit });
}
