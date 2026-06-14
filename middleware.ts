import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request and gates the app routes.
// Public routes (landing, login, public ticker pages, public APIs) stay open.
const PUBLIC_PREFIXES = ["/", "/login", "/auth", "/privacy", "/terms", "/how-its-legal", "/t", "/discover", "/api/board", "/api/claim", "/api/questions", "/api/ticker-audit", "/api/sec-feed", "/api/chart", "/api/trending", "/api/movers", "/api/buzz", "/api/risk", "/api/og", "/api/badge", "/api/watch", "/_next", "/img", "/favicon"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p));
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

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|img/).*)"],
};
