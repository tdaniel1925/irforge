// Security headers. Notes:
// - HSTS: Vercel already sends Strict-Transport-Security on *.vercel.app and
//   custom domains with HTTPS — not duplicated here.
// - CSP: a full Content-Security-Policy is DEFERRED — Next.js inline runtime
//   scripts require nonce propagation through the app shell, and Stripe.js,
//   Supabase, Vercel Analytics, and social embeds each need vetted allowlist
//   entries. Shipping a wrong CSP breaks checkout silently. Tracked for Phase 2.
// - /embed/* is the one route MEANT to be iframed by third-party sites, so the
//   clickjacking block (frame-ancestors) applies everywhere EXCEPT /embed.
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
];
const frameBlock = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      // Embeddable widget: framing allowed, everything else still hardened.
      { source: "/embed/:path*", headers: baseSecurityHeaders },
      // All other routes: hardened + clickjacking-blocked. Next matches the most
      // specific source per header key, and both rules carry the base set.
      { source: "/((?!embed).*)", headers: [...baseSecurityHeaders, ...frameBlock] },
    ];
  },
  async redirects() {
    return [
      // Team management moved out from under the /admin super-admin wall (it's
      // company-admin, not platform-admin). This redirect runs BEFORE the admin
      // layout's super-admin gate, so old /admin/team links reach /team instead of
      // bouncing company admins to Home.
      { source: "/admin/team", destination: "/team", permanent: false },
    ];
  },
};

export default nextConfig;
