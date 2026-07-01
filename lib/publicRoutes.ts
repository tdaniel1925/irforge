// Public-route allowlist for the auth middleware. Lives here (not in middleware.ts)
// so it can be unit-tested without pulling in next/server — the exact matching rule
// below has already bitten us once: a bare startsWith let "/t" exempt /team and
// /ticker-audit from the auth gate.
export const PUBLIC_PREFIXES = ["/", "/login", "/auth", "/privacy", "/terms", "/how-its-legal", "/t", "/discover", "/sample-brief", "/snapshot", "/for-investors", "/for-companies", "/accept-invite", "/embed", "/welcome", "/api/health", "/api/board", "/api/claim", "/api/questions", "/api/ticker-audit", "/api/sec-feed", "/api/chart", "/api/trending", "/api/movers", "/api/buzz", "/api/risk", "/api/og", "/api/badge", "/api/promo", "/api/watch", "/api/billing/webhook", "/api/member-billing/webhook", "/api/email/webhook", "/api/cron", "/_next", "/img", "/favicon"];

// Whole-segment matching: "/t" matches "/t" and "/t/AMFN" but NOT "/team" or
// "/ticker-audit". Exact path, or the prefix followed by "/".
export function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")));
}
