// Summarize raw Resend webhook event counts into an HONEST deliverability view.
//
// The old admin metric tallied raw status strings and showed e.g. "sent 645,
// delivered 3, failed 56" — leaving 586 unexplained and implying a 0.5% delivery
// rate that isn't real. In practice "sent" is logged on hand-off while
// "delivered" only lands if Resend's delivery webhook fires; a broken webhook
// makes delivered look near-zero. This groups the raw statuses into meaningful
// buckets, computes rates against a sensible denominator, and surfaces the
// "awaiting confirmation" gap explicitly instead of hiding it.

export interface EmailSummary {
  sent: number;          // total hand-offs we recorded
  delivered: number;     // confirmed in an inbox
  failed: number;        // bounced / dropped / complained
  pending: number;       // sent but no delivered/failed confirmation yet (the gap)
  deliveryRate: number | null;   // delivered / (delivered + failed), 0..100, null if none resolved
  resolvedRate: number | null;   // (delivered + failed) / sent, 0..100 — how much we've heard back on
  health: "ok" | "warn" | "unknown";
  raw: Record<string, number>;   // original per-status counts, for the detail view
}

// Which raw statuses map to which bucket. Resend emits: sent, delivered, opened,
// clicked, bounced, complained, delivery_delayed, etc.
const DELIVERED = new Set(["delivered", "opened", "clicked"]);
const FAILED = new Set(["bounced", "complained", "failed", "dropped", "rejected"]);

export function summarizeEmail(raw: Record<string, number>): EmailSummary {
  const g = (k: string) => raw[k] ?? 0;
  const sent = g("sent") || Object.values(raw).reduce((s, n) => s + n, 0);
  let delivered = 0, failed = 0;
  for (const [status, n] of Object.entries(raw)) {
    if (DELIVERED.has(status)) delivered += n;
    else if (FAILED.has(status)) failed += n;
  }
  const resolved = delivered + failed;
  const pending = Math.max(0, sent - resolved);

  const deliveryRate = resolved > 0 ? Math.round((delivered / resolved) * 100) : null;
  const resolvedRate = sent > 0 ? Math.round((resolved / sent) * 100) : null;

  // Health: if we sent a meaningful volume but heard back on almost none, the
  // delivery WEBHOOK is likely broken (not the sending). Flag it, don't imply a
  // 0% delivery rate.
  let health: EmailSummary["health"] = "ok";
  if (sent >= 20 && resolvedRate !== null && resolvedRate < 25) health = "warn";
  else if (resolved === 0 && sent > 0) health = "unknown";

  return { sent, delivered, failed, pending, deliveryRate, resolvedRate, health, raw };
}
