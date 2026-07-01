// Shared auth for cron endpoints. Requires CRON_SECRET — provided either as
// `Authorization: Bearer <secret>` (Vercel sends this automatically on cron
// invocations when the CRON_SECRET env var is set) or `?secret=` for manual runs.
//
// We deliberately do NOT trust the `x-vercel-cron` header: any client can send it,
// which let anyone trigger email blasts and AI-cost burn. Fail closed when the
// secret isn't configured.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}
