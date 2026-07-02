import { describe, it, expect } from "vitest";
import { safeFetchText } from "@/lib/safeFetch";

// SSRF guard: user-supplied URLs (doc analyzer, disclosure importer) must never be
// able to reach internal/metadata/private hosts. These assert the URL-level rejections
// (no network needed — they fail before any fetch).

describe("safeFetchText — rejects dangerous URLs before fetching", () => {
  it.each([
    ["cloud metadata IP", "http://169.254.169.254/latest/meta-data/"],
    ["ipv4 loopback", "http://127.0.0.1/"],
    ["0.0.0.0", "http://0.0.0.0/"],
    ["private 10.x", "http://10.0.0.5/admin"],
    ["private 192.168.x", "http://192.168.1.1/"],
    ["private 172.16.x", "http://172.16.0.1/"],
    ["ipv6 loopback", "http://[::1]/"],
    ["unique-local ipv6", "http://[fd00::1]/"],
    ["localhost hostname", "http://localhost:8080/"],
    ["gcp metadata hostname", "http://metadata.google.internal/"],
    ["credentials in url", "http://user:pass@example.com/"],
    ["file scheme", "file:///etc/passwd"],
    ["gopher scheme", "gopher://127.0.0.1:11211/"],
    ["not a url", "just some text"],
  ])("rejects %s", async (_label, url) => {
    const r = await safeFetchText(url);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
