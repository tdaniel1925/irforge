import { NextResponse } from "next/server";
import { runTickerAudit } from "@/lib/audit";
import { truthCheckPost } from "@/lib/truthCheck";
import { rateAllow } from "@/lib/publicStats";
import { checkDailyQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "anon").trim();
}

// Lazy, on-demand reality-check for a single board post.
// Truth-checking is expensive (a full live audit + an AI call), so it is NOT run on
// every post — it runs only when a reader clicks "Reality-check vs filings".
// Returns the verdict comparing the post's factual claim against the live public record.
export async function POST(req: Request) {
  const ip = clientIp(req);
  // Cheap path is Haiku, but a full audit hits many external APIs — rate-limit hard.
  if (!(await rateAllow(`truthcheck:${ip}`, 12))) {
    return NextResponse.json({ error: "Slow down a moment — reality-checks are rate-limited." }, { status: 429 });
  }
  // Daily quota: 3/day free (member or anonymous); Investor+ unlimited.
  const quota = await checkDailyQuota("truthcheck", ip, 3);
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: quota.signedIn
          ? "You've used today's 3 free reality-checks. Investor+ ($9/mo) is unlimited."
          : "You've used today's 3 free reality-checks. Sign in — or go Investor+ for unlimited.",
        needsUpgrade: true,
      },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const text = String(body.body ?? "").trim().slice(0, 600);

  if (!ticker || text.length < 2) {
    return NextResponse.json({ error: "Missing ticker or post body." }, { status: 422 });
  }

  try {
    const audit = await runTickerAudit(ticker, []);
    const result = await truthCheckPost(text, audit);
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the public record right now — try again shortly." }, { status: 502 });
  }
}
