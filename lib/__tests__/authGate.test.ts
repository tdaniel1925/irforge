import { describe, it, expect } from "vitest";
import { decideAuthGate } from "../authGate";

const SUPA = "https://example.supabase.co";

describe("decideAuthGate — fail-closed matrix", () => {
  // ── Today's real production config keeps working unchanged ──
  it("enforces with AUTH_ENABLED=1 on Vercel production", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, authEnabled: "1", vercelEnv: "production", vercel: "1" })).toBe("enforce");
  });

  // ── The bug the old logic had: missing/empty flag on a deployment ──
  it("enforces on Vercel production when AUTH_ENABLED is EMPTY (old logic fell open)", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, authEnabled: "", vercelEnv: "production", vercel: "1" })).toBe("enforce");
  });
  it("enforces on Vercel production when AUTH_ENABLED is missing entirely", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, vercelEnv: "production", vercel: "1" })).toBe("enforce");
  });
  it("enforces on preview deployments that did not inherit env vars", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, vercelEnv: "preview", vercel: "1" })).toBe("enforce");
  });

  // ── Explicit opt-out: allowed off-prod, never for production itself ──
  it("AUTH_ENABLED=0 opens a preview deployment", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, authEnabled: "0", vercelEnv: "preview", vercel: "1" })).toBe("open");
  });
  it("AUTH_ENABLED=0 does NOT open Vercel production", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, authEnabled: "0", vercelEnv: "production", vercel: "1" })).toBe("enforce");
  });

  // ── Deployed without Supabase env: block, don't fall open ──
  it("unconfigured when deployed without a Supabase URL", () => {
    expect(decideAuthGate({ vercelEnv: "production", vercel: "1" })).toBe("unconfigured");
  });
  it("unconfigured when AUTH_ENABLED=1 but Supabase URL is missing (any host)", () => {
    expect(decideAuthGate({ authEnabled: "1" })).toBe("unconfigured");
  });

  // ── Local dev stays open (demo mode) ──
  it("open locally with no flags", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA })).toBe("open");
  });
  it("open locally with empty AUTH_ENABLED (current .env.local)", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, authEnabled: "" })).toBe("open");
  });
  it("local dev can still opt IN with AUTH_ENABLED=1", () => {
    expect(decideAuthGate({ supabaseUrl: SUPA, authEnabled: "1" })).toBe("enforce");
  });
});
