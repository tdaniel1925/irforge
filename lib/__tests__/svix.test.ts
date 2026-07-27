import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifySvix } from "../svix";

// Build a genuine Svix-style signature so the valid-path test exercises the real HMAC.
const SECRET_BYTES = crypto.randomBytes(24);
const SECRET = "whsec_" + SECRET_BYTES.toString("base64");
const sign = (id: string, ts: string, payload: string) =>
  crypto.createHmac("sha256", SECRET_BYTES).update(`${id}.${ts}.${payload}`).digest("base64");

const headers = (h: Record<string, string>) => new Headers(h);
const PAYLOAD = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });

describe("verifySvix", () => {
  it("accepts a correctly signed payload", () => {
    const sig = sign("msg_1", "1700000000", PAYLOAD);
    const h = headers({ "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": `v1,${sig}` });
    expect(verifySvix(SECRET, h, PAYLOAD)).toBe(true);
  });

  it("accepts when the valid signature is second in a multi-sig header", () => {
    const sig = sign("msg_1", "1700000000", PAYLOAD);
    const h = headers({ "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": `v1,${Buffer.from("wrong-signature-padding==").toString("base64")} v1,${sig}` });
    expect(verifySvix(SECRET, h, PAYLOAD)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const sig = sign("msg_1", "1700000000", PAYLOAD);
    const h = headers({ "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": `v1,${sig}` });
    expect(verifySvix(SECRET, h, PAYLOAD.replace("delivered", "bounced"))).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const wrong = crypto.createHmac("sha256", crypto.randomBytes(24)).update(`msg_1.1700000000.${PAYLOAD}`).digest("base64");
    const h = headers({ "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": `v1,${wrong}` });
    expect(verifySvix(SECRET, h, PAYLOAD)).toBe(false);
  });

  it("rejects when signature headers are missing", () => {
    expect(verifySvix(SECRET, headers({}), PAYLOAD)).toBe(false);
    expect(verifySvix(SECRET, headers({ "svix-id": "msg_1", "svix-timestamp": "1700000000" }), PAYLOAD)).toBe(false);
  });

  it("rejects when the id or timestamp is altered (signed content mismatch)", () => {
    const sig = sign("msg_1", "1700000000", PAYLOAD);
    const h = headers({ "svix-id": "msg_2", "svix-timestamp": "1700000000", "svix-signature": `v1,${sig}` });
    expect(verifySvix(SECRET, h, PAYLOAD)).toBe(false);
  });

  it("survives malformed signature values without throwing", () => {
    const h = headers({ "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": "v1,short v1, garbage,,," });
    expect(verifySvix(SECRET, h, PAYLOAD)).toBe(false);
  });
});
