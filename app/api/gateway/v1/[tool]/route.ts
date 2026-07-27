import { NextResponse } from "next/server";
import crypto from "crypto";
import { actorFromToken } from "@/lib/services/tokens";
import { getTool } from "@/lib/gateway/tools";
import { ServiceError } from "@/lib/services/context";
import { rateAllow } from "@/lib/publicStats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // publish tools call Ayrshare inline

// ── Integration gateway: POST /api/gateway/v1/<tool> ──
// Bearer-token auth (company + scopes come from the token, never the body),
// per-token rate limiting, correlation ids, structured audit (inside services),
// and safe error envelopes. This is the ONLY door the Jordyn control plane uses
// — no DB access, no session cookies, no service-role key on the client side.

const errStatus: Record<string, number> = {
  unauthorized: 401, forbidden: 403, not_found: 404, invalid: 422, conflict: 409,
};

export async function POST(req: Request, { params }: { params: { tool: string } }) {
  const requestId = crypto.randomUUID();
  const headers = { "x-request-id": requestId };

  // 1) Bearer token → ActorContext.
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return NextResponse.json({ error: "Missing bearer token.", requestId }, { status: 401, headers });

  const ctx = await actorFromToken(bearer, requestId);
  if (!ctx) return NextResponse.json({ error: "Invalid, expired, or revoked token.", requestId }, { status: 401, headers });

  // 2) Per-token rate limit (keyed by the token's actor id, not anything the
  //    caller can spoof — the id is derived server-side from the token hash).
  if (!(await rateAllow(`gw:${ctx.actorId}`, 60))) {
    return NextResponse.json({ error: "Rate limited — try again in a minute.", requestId }, { status: 429, headers });
  }

  // 3) Resolve the tool.
  const tool = getTool(params.tool);
  if (!tool) return NextResponse.json({ error: `Unknown tool "${params.tool}".`, requestId }, { status: 404, headers });

  // 4) Scope check happens inside each service via requireScope, but gate here
  //    too for a clean early 403 before we parse anything expensive.
  if (!ctx.scopes.includes(tool.scope)) {
    return NextResponse.json({ error: `This token lacks the ${tool.scope} scope.`, requestId }, { status: 403, headers });
  }

  const body = await req.json().catch(() => ({}));
  const input = (body && typeof body === "object" && body.input && typeof body.input === "object") ? body.input : {};

  // 5) Execute. Domain errors map to statuses; anything else is a generic 500
  //    with NO internal detail leaked.
  try {
    const result = await tool.handler(ctx, input);
    return NextResponse.json({ ok: true, requestId, result }, { headers });
  } catch (e) {
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message, code: e.code, requestId }, { status: errStatus[e.code] ?? 400, headers });
    }
    const code = (e as { code?: string })?.code;
    if (code === "conflict") {
      return NextResponse.json({ error: (e as Error).message, code: "conflict", requestId }, { status: 409, headers });
    }
    console.error(`[gateway] ${params.tool} failed (req ${requestId}):`, e);
    return NextResponse.json({ error: "The operation failed.", requestId }, { status: 500, headers });
  }
}
