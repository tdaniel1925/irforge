import { NextResponse } from "next/server";
import { resolveSessionActor } from "@/lib/services/context";
import { issueToken, listTokens, revokeToken, rotateToken } from "@/lib/services/tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Integration-token management — SESSION admins only (never a token itself, so a
// leaked integration token can't mint more tokens or escalate). All operations
// are scoped to the admin's own company.
async function adminCtx() {
  const ctx = await resolveSessionActor();
  if (!ctx) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (ctx.authMethod !== "session") return { error: NextResponse.json({ error: "Session required." }, { status: 403 }) };
  if (ctx.role !== "admin") return { error: NextResponse.json({ error: "Admin only." }, { status: 403 }) };
  return { ctx };
}

export async function GET() {
  const g = await adminCtx();
  if (g.error) return g.error;
  return NextResponse.json({ tokens: await listTokens(g.ctx!) });
}

// POST { action: "issue"|"revoke"|"rotate", ... }
export async function POST(req: Request) {
  const g = await adminCtx();
  if (g.error) return g.error;
  const ctx = g.ctx!;
  const b = await req.json().catch(() => ({}));

  if (b.action === "revoke") {
    if (!b.tokenId) return NextResponse.json({ error: "Missing tokenId." }, { status: 422 });
    const ok = await revokeToken(ctx, String(b.tokenId));
    return NextResponse.json({ ok });
  }
  if (b.action === "rotate") {
    if (!b.tokenId) return NextResponse.json({ error: "Missing tokenId." }, { status: 422 });
    const issued = await rotateToken(ctx, String(b.tokenId));
    if (!issued) return NextResponse.json({ error: "Token not found or already revoked." }, { status: 404 });
    // Plaintext returned ONCE.
    return NextResponse.json({ ok: true, token: issued });
  }
  // default: issue
  if (!b.subject) return NextResponse.json({ error: "Missing subject." }, { status: 422 });
  const issued = await issueToken(ctx, {
    subject: String(b.subject),
    role: b.role === "admin" ? "admin" : "member",
    scopes: Array.isArray(b.scopes) ? b.scopes.map(String) : [],
    expiresInDays: typeof b.expiresInDays === "number" ? b.expiresInDays : undefined,
    connectorId: typeof b.connectorId === "string" ? b.connectorId : undefined,
  });
  // Plaintext token is in the response body exactly once — never stored, never
  // retrievable again.
  return NextResponse.json({ ok: true, token: issued });
}
