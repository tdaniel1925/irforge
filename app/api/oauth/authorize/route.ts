import { NextResponse } from "next/server";
import { resolveSessionActor } from "@/lib/services/context";
import { getClient, redirectAllowed, issueAuthCode, capGrantedScopes } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── OAuth consent ACCEPT handler, POST /api/oauth/authorize ──
// The consent screen (the /oauth/authorize server page) POSTs here. This route is
// intentionally NON-public so the middleware session gate applies.
//
// CSRF / session-binding: this is a POST carrying the browser's session cookie;
// the handler re-runs resolveSessionActor() and re-derives companyId + role
// SERVER-SIDE. Nothing authorization-relevant is trusted from the form — it only
// carries the (already-validated) OAuth protocol params (client_id, redirect_uri,
// scope, state, PKCE challenge). An attacker cannot forge a cross-site POST that
// grants access: they can't mint a valid signed-in session for the victim, and
// company/role/subject always come from the session, never the request body.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function errorPage(title: string, detail: string, status = 400): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Authorization error</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:440px;padding:32px;background:#111a2e;border:1px solid #1f2b45;border-radius:14px}
h1{font-size:18px;margin:0 0 8px;color:#f87171}p{color:#9aa7bd;line-height:1.5}</style></head>
<body><div class="card"><h1>${esc(title)}</h1><p>${esc(detail)}</p></div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

// Merge query params onto the (already exact-matched) redirect_uri.
function backTo(redirectUri: string, params: Record<string, string>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const decision = url.searchParams.get("decision") ?? "";
  const form = await req.formData().catch(() => null);
  if (!form) return errorPage("Invalid request", "Malformed form submission.");

  const p = {
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    responseType: String(form.get("response_type") ?? "code"),
    scope: String(form.get("scope") ?? ""),
    state: String(form.get("state") ?? ""),
    codeChallenge: String(form.get("code_challenge") ?? ""),
    codeChallengeMethod: String(form.get("code_challenge_method") ?? ""),
  };

  // Re-validate client + EXACT redirect match BEFORE any redirect can happen.
  const client = await getClient(p.clientId);
  if (!client || !redirectAllowed(client, p.redirectUri)) {
    return errorPage("Invalid redirect URI", "The redirect_uri does not match a registered URI. Not redirecting.");
  }

  // Re-validate the session server-side (the CSRF + auth gate).
  const actor = await resolveSessionActor();
  if (!actor) {
    const back = `/oauth/authorize?client_id=${encodeURIComponent(p.clientId)}&redirect_uri=${encodeURIComponent(p.redirectUri)}&response_type=code&scope=${encodeURIComponent(p.scope)}&state=${encodeURIComponent(p.state)}&code_challenge=${encodeURIComponent(p.codeChallenge)}&code_challenge_method=S256`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, url.origin));
  }

  if (decision !== "allow") {
    return NextResponse.redirect(backTo(p.redirectUri, { error: "access_denied", state: p.state }));
  }

  // Re-validate PKCE + response_type on the POST too.
  if (!p.codeChallenge || p.codeChallengeMethod !== "S256" || p.responseType !== "code") {
    return NextResponse.redirect(backTo(p.redirectUri, { error: "invalid_request", state: p.state }));
  }

  // Cap scopes AGAIN server-side (role ceiling + safe-route cap).
  const granted = capGrantedScopes(p.scope.split(/\s+/).filter(Boolean), actor.role);

  const code = await issueAuthCode({
    clientId: p.clientId,
    companyId: actor.companyId,      // from the SESSION, never the form
    subjectUser: actor.actorId,
    subjectEmail: actor.actorEmail,
    role: actor.role,
    scopes: granted,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
  });

  return NextResponse.redirect(backTo(p.redirectUri, { code, state: p.state }), { status: 302 });
}
