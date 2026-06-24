import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Auth callback — the URL Supabase sends users to from confirmation / magic-link /
// password-reset emails. It exchanges the one-time code (or token_hash) for a real
// session cookie, then routes the user to the right home by account type.
//
// Supabase must list this route under Auth → URL Configuration → Redirect URLs:
//   https://pubcozone.com/auth/callback   (+ http://localhost:3000/auth/callback for dev)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type"); // signup | recovery | magiclink | email_change
  const next = url.searchParams.get("next");

  const supabase = await createServerSupabase();
  let ok = false;

  if (code) {
    // PKCE flow (default for email confirmation): exchange the code for a session.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    // OTP / token_hash flow (some email templates use this instead of ?code).
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "recovery" | "magiclink" | "email_change" | "invite",
      token_hash: tokenHash,
    });
    ok = !error;
  }

  if (!ok) {
    // Couldn't establish a session — send them to login with a friendly note.
    const back = new URL("/login", url.origin);
    back.searchParams.set("error", "We couldn't confirm that link. It may have expired — try signing in, or request a new email.");
    return NextResponse.redirect(back);
  }

  // Password-reset links should land on a set-new-password screen, not the app.
  if (type === "recovery") {
    return NextResponse.redirect(new URL("/login?mode=reset", url.origin));
  }

  // Honor an explicit ?next=, otherwise route by account type stamped at signup.
  if (next && next.startsWith("/")) {
    return NextResponse.redirect(new URL(next, url.origin));
  }
  const { data: { user } } = await supabase.auth.getUser();
  const accountType = user?.user_metadata?.account_type;
  const dest = accountType === "member" ? "/member" : "/onboarding";
  return NextResponse.redirect(new URL(dest, url.origin));
}
