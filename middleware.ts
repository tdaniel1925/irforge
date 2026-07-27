import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Refreshes the Supabase session cookie on every request and gates the app routes.
// Public routes (landing, login, public ticker pages, public APIs) stay open —
// the allowlist + matcher live in lib/publicRoutes.ts so they're unit-testable.
import { isPublic } from "@/lib/publicRoutes";
import { decideAuthGate, readAuthGateEnv } from "@/lib/authGate";

export async function middleware(request: NextRequest) {
  // Fail-closed gate decision (see lib/authGate.ts): deployed = enforce unless
  // explicitly disabled; local dev = open. "unconfigured" (deployed without
  // Supabase env) blocks protected routes with 503 instead of falling open.
  const gate = decideAuthGate(readAuthGateEnv());
  if (gate === "open") return NextResponse.next();
  if (gate === "unconfigured") {
    if (isPublic(request.nextUrl.pathname)) return NextResponse.next();
    return NextResponse.json({ error: "Auth is not configured on this deployment." }, { status: 503 });
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
