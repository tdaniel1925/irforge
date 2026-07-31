import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";

// EVENT_ENC_KEY must exist before secretbox is imported/used.
process.env.EVENT_ENC_KEY = Buffer.from(crypto.randomBytes(32)).toString("base64");

import { encryptSecret, decryptSecret } from "../events/secretbox";

describe("event secretbox (AES-256-GCM)", () => {
  it("round-trips a secret", () => {
    const s = "pzevt_" + crypto.randomBytes(16).toString("hex");
    const packed = encryptSecret(s);
    expect(packed).not.toContain(s);           // ciphertext, not plaintext
    expect(packed.split(".")).toHaveLength(3); // iv.tag.ct
    expect(decryptSecret(packed)).toBe(s);
  });
  it("a tampered ciphertext fails the auth tag", () => {
    const packed = encryptSecret("hello");
    const [iv, tag, ct] = packed.split(".");
    const flipped = Buffer.from(ct, "base64"); flipped[0] ^= 0xff;
    expect(() => decryptSecret(`${iv}.${tag}.${flipped.toString("base64")}`)).toThrow();
  });
  it("fresh IV per encrypt (same input → different ciphertext)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
});

// The outbound HMAC signature scheme the receiver (Jordyn) must verify. Pinned
// here so both sides stay in lockstep: signed = `${ts}.${eventId}.${rawBody}`.
describe("outbound signature scheme", () => {
  const secret = "s3cr3t";
  const sign = (ts: string, id: string, body: string) =>
    crypto.createHmac("sha256", secret).update(`${ts}.${id}.${body}`).digest("hex");

  it("signature is stable and order-sensitive", () => {
    const body = JSON.stringify({ id: "evt_1", type: "investor_question_received" });
    const a = sign("1700000000", "evt_1", body);
    const b = sign("1700000000", "evt_1", body);
    expect(a).toBe(b);
    // any component change → different signature
    expect(sign("1700000001", "evt_1", body)).not.toBe(a);
    expect(sign("1700000000", "evt_2", body)).not.toBe(a);
    expect(sign("1700000000", "evt_1", body + " ")).not.toBe(a);
  });
});
