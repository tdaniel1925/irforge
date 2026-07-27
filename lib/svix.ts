import crypto from "crypto";

// Svix webhook signature verification (the scheme Resend uses). Extracted from
// app/api/email/webhook/route.ts so it's unit-testable. The signed content is
// `${id}.${timestamp}.${payload}`, HMAC-SHA256 with the base64 secret (after the
// "whsec_" prefix), compared constant-time against any of the space-separated
// `v1,<sig>` values in the svix-signature header.
export function verifySvix(secret: string, headers: Headers, payload: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // Header looks like: "v1,<sig1> v1,<sig2>"
  for (const part of sigHeader.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    try {
      if (sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
    } catch {
      /* length mismatch — try next */
    }
  }
  return false;
}
