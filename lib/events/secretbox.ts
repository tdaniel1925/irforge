import crypto from "crypto";

// AES-256-GCM encryption for event signing secrets at rest. Mirror of Jordyn's
// lib/crypto-box.ts. Key from EVENT_ENC_KEY (32-byte base64). Format stored in a
// single column: base64(iv).base64(tag).base64(ciphertext).

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  const raw = process.env.EVENT_ENC_KEY;
  if (!raw) throw new Error("EVENT_ENC_KEY is not set (32-byte base64). Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\".");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("EVENT_ENC_KEY must decode to exactly 32 bytes.");
  return k;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptSecret(packed: string): string {
  const [ivB64, tagB64, ctB64] = packed.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed encrypted secret");
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
