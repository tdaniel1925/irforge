import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request and gates the app routes.
// Public routes (landing, login, public ticker pages, public APIs) stay open.
const PUBLIC_PREFIXES = ["/", "/login", "/auth", "/privacy", "/terms", "/how-its-legal", "/t", "/discover", "/sample-brief", "/snapshot", "/for-investors", "/for-companies", "/accept-invite", "/embed", "/welcome", "/api/health", "/api/board", "/api/claim", "/api/questions", "/api/ticker-audit", "/api/sec-feed", "/api/chart", "/api/trending", "/api/movers", "/api/buzz", "/api/risk", "/api/og", "/api/badge", "/api/promo", "/api/watch", "/api/billing/webhook", "/api/member-billing/webhook", "/api/email/webhook", "/api/cron", "/_next", "/img", "/favicon"];

// Whole-segment matching: "/t" must match "/t" and "/t/AMFN" but NOT "/team" or
// "/ticker-audit" (a bare startsWith exempted those authenticated pages from the auth
// gate). Exact path or prefix followed by "/" only.
function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")));
}

export async function middleware(request: NextRequest) {
  // Auth gating is OFF until the data layer is migrated to Supabase. Flip AUTH_ENABLED=1
  // (env) to turn on login enforcement. Until then the app runs in single-company mode
  // and only the session cookie is refreshed.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.AUTH_ENABLED !== "1") {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() validates the token with Supabase and, when the access token has
  // expired but the refresh token is still valid, rotates the session — the new
  // cookies are written to `response` via the setAll callback above. We must carry
  // those refreshed cookies onto ANY response we return (401 / redirect included),
  // otherwise the just-refreshed session is dropped and the user bounces to /login.
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    // API routes get a clean JSON 401 — never redirect an API call to the HTML
    // login page (that yields "<" instead of JSON and surfaces as a fake 500).
    if (pathname.startsWith("/api/")) {
      const json = NextResponse.json({ error: "Not signed in." }, { status: 401 });
      response.cookies.getAll().forEach((c) => json.cookies.set(c));
      return json;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectRes = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
    return redirectRes;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|img/).*)"],
};
