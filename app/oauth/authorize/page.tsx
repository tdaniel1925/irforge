import { redirect } from "next/navigation";
import { paramsFrom, validateAuthorize, consentView, SCOPE_LABELS, type AuthorizeParams } from "@/lib/oauth/consent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── OAuth Authorization Endpoint (consent screen) ──
// This is the advertised authorization_endpoint (/oauth/authorize). It is a
// SESSION-authed server page (NOT in publicRoutes) — the middleware gate ensures
// a signed-in user; if somehow unauthenticated we also bounce to /login here.
// The Authorize/Deny buttons POST to /api/oauth/authorize, which re-validates the
// session server-side and issues the code (see that route for the CSRF story).

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0b1220", color: "#e5e7eb", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, padding: 32, background: "#111a2e", border: "1px solid #1f2b45", borderRadius: 14 }}>
        <h1 style={{ fontSize: 18, margin: "0 0 8px", color: "#f87171" }}>{title}</h1>
        <p style={{ color: "#9aa7bd", lineHeight: 1.5 }}>{detail}</p>
      </div>
    </div>
  );
}

function backUrl(p: AuthorizeParams): string {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code",
    scope: p.scope, state: p.state, code_challenge: p.codeChallenge, code_challenge_method: "S256",
  });
  return `/oauth/authorize?${q.toString()}`;
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = paramsFrom(sp);

  const v = await validateAuthorize(p);
  if (!v.ok) return <ErrorCard title={v.title} detail={v.detail} />;

  const view = await consentView(p, v.clientName);
  if (!view) {
    // Not signed in → login, then return here.
    redirect(`/login?next=${encodeURIComponent(backUrl(p))}`);
  }

  const hidden: Array<[string, string]> = [
    ["client_id", p.clientId], ["redirect_uri", p.redirectUri], ["response_type", "code"],
    ["scope", p.scope], ["state", p.state], ["code_challenge", p.codeChallenge], ["code_challenge_method", "S256"],
  ];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0b1220", color: "#e5e7eb", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, width: "100%", padding: 32, background: "#111a2e", border: "1px solid #1f2b45", borderRadius: 16 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Authorize {view.clientName}</h1>
        <p style={{ color: "#9aa7bd", margin: "0 0 20px", fontSize: 14 }}>This application is requesting access to:</p>
        <div style={{ background: "#0b1220", border: "1px solid #1f2b45", borderRadius: 10, padding: "12px 14px", marginBottom: 18 }}>
          <b style={{ color: "#fff" }}>{view.companyName}</b>
          {view.ticker ? <span style={{ color: "#6b7a94", fontSize: 13 }}> ({view.ticker})</span> : null}
          <div style={{ color: "#6b7a94", fontSize: 13 }}>Signed in as {view.actorEmail}</div>
        </div>
        <p style={{ color: "#9aa7bd", margin: "0 0 20px", fontSize: 14 }}>It will be able to:</p>
        <ul style={{ margin: "8px 0 20px", paddingLeft: 20, lineHeight: 1.7, color: "#cbd5e1" }}>
          {view.granted.length ? view.granted.map((s) => <li key={s}>{SCOPE_LABELS[s] ?? s}</li>) : <li>Basic read access</li>}
        </ul>
        {view.sensitiveDropped ? (
          <p style={{ color: "#fbbf24", fontSize: 13, background: "#1c1708", border: "1px solid #3f3410", borderRadius: 8, padding: "10px 12px", margin: "0 0 18px" }}>
            Approve and publish permissions are not granted over this connection yet (safe-mode).
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 12 }}>
          <form method="POST" action="/api/oauth/authorize?decision=deny" style={{ margin: 0, flex: 1 }}>
            <input type="hidden" name="client_id" value={p.clientId} />
            <input type="hidden" name="redirect_uri" value={p.redirectUri} />
            <input type="hidden" name="state" value={p.state} />
            <button type="submit" style={{ width: "100%", padding: "11px 16px", borderRadius: 10, border: 0, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#1f2b45", color: "#cbd5e1" }}>Deny</button>
          </form>
          <form method="POST" action="/api/oauth/authorize?decision=allow" style={{ margin: 0, flex: 1 }}>
            {hidden.map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
            <button type="submit" style={{ width: "100%", padding: "11px 16px", borderRadius: 10, border: 0, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#dc2626", color: "#fff" }}>Authorize</button>
          </form>
        </div>
      </div>
    </div>
  );
}
