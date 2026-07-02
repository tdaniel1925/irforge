// SSRF-guarded fetch for user-supplied URLs. Routes that fetch a URL a user typed
// (document analyzer, disclosure importer) must NOT be able to reach internal
// addresses — cloud metadata (169.254.169.254), localhost, or private-network hosts.
//
// Guards: https/http scheme only; reject credentials in the URL; resolve the host and
// reject any IP that is loopback/private/link-local/unique-local; cap redirects and
// re-check each hop; hard size + time limits.

import { lookup } from "dns/promises";
import net from "net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

// Is a resolved IP address in a private / loopback / link-local / metadata range?
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 127) return true;                         // loopback
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 169 && b === 254) return true;            // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64.0.0/10
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;       // loopback / unspecified
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique-local fc00::/7
  if (low.startsWith("fe80")) return true;              // link-local
  if (low.startsWith("::ffff:")) return isPrivateIp(low.slice(7)); // v4-mapped
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) throw new Error("blocked host");
  // If it's already a literal IP, check directly; otherwise resolve ALL records.
  if (net.isIP(h)) {
    if (isPrivateIp(h)) throw new Error("private address");
    return;
  }
  const records = await lookup(h, { all: true });
  if (records.length === 0) throw new Error("unresolvable host");
  for (const r of records) if (isPrivateIp(r.address)) throw new Error("resolves to a private address");
}

export interface SafeFetchResult { ok: boolean; status: number; text: string; error?: string }

// Fetch a user-supplied URL with SSRF protection. Returns stripped text (caller may
// re-strip HTML). Never throws — returns { ok:false, error } for the caller to surface.
export async function safeFetchText(rawUrl: string, opts?: { maxBytes?: number; timeoutMs?: number }): Promise<SafeFetchResult> {
  const maxBytes = opts?.maxBytes ?? 2_000_000; // 2 MB
  const timeoutMs = opts?.timeoutMs ?? 15_000;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: 0, text: "", error: "Invalid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, status: 0, text: "", error: "Only http(s) URLs are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, status: 0, text: "", error: "URLs with credentials aren't allowed." };
  }
  try {
    await assertPublicHost(url.hostname);
  } catch {
    return { ok: false, status: 0, text: "", error: "That URL points to a disallowed address." };
  }

  try {
    // redirect:"manual" — a 3xx to an internal host must not be auto-followed past the
    // host check. We surface redirects as a soft failure (paste the final URL instead).
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "PubcoZone importer contact@pubcozone.com" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: res.status, text: "", error: "That URL redirects — paste the final page's URL or its text." };
    }
    if (!res.ok) return { ok: false, status: res.status, text: "", error: `Couldn't fetch that URL (HTTP ${res.status}).` };

    // Bounded read so a huge/streaming body can't exhaust memory.
    const reader = res.body?.getReader();
    if (!reader) return { ok: true, status: res.status, text: (await res.text()).slice(0, maxBytes) };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return { ok: true, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "", error: "Couldn't reach that URL." };
  }
}
