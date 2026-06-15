import { NextResponse } from "next/server";
import { recordApproval } from "@/lib/iros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
}

// POST { postId, stage, decision, comment } — record an approval/counsel decision.
// For RED posts at the counsel stage, captures a tamper-evident signature.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const stage = body.stage === "counsel" ? "counsel" : "approver";
  const decision = ["approved", "rejected", "changes"].includes(body.decision) ? body.decision : null;
  const postId = String(body.postId ?? "");
  if (!postId || !decision) return NextResponse.json({ error: "Bad request." }, { status: 422 });

  const result = await recordApproval({
    postId,
    stage,
    decision,
    comment: body.comment,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "Not signed in." ? 401 : 422 });
  return NextResponse.json({ ok: true });
}
