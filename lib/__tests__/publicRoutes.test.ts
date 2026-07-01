import { describe, it, expect } from "vitest";
import { isPublic } from "@/lib/publicRoutes";

// This exact matcher once had a startsWith bug that exempted /team, /ticker-audit,
// and /embeds from the auth gate ("/t" and "/embed" prefixes). These tests pin the
// whole-segment behavior so it can't regress.

describe("isPublic — public routes stay public", () => {
  it.each([
    "/",
    "/login",
    "/terms",
    "/privacy",
    "/t",
    "/t/AMFN",
    "/embed/hub/AMFN",
    "/welcome/AMFN",
    "/api/health/auth",
    "/api/board",
    "/api/board/questions", // in-route auth handles 401 (getMyCompany)
    "/api/cron/board-digest",
    "/api/billing/webhook",
  ])("%s is public", (p) => {
    expect(isPublic(p)).toBe(true);
  });
});

describe("isPublic — protected routes are NOT exempted by prefix collisions", () => {
  it.each([
    "/team",          // was exempted by "/t" startsWith
    "/ticker-audit",  // was exempted by "/t" startsWith
    "/embeds",        // was exempted by "/embed" startsWith
    "/app",
    "/admin",
    "/admin/customers",
    "/settings",
    "/company",
    "/compose",
    "/posts",
    "/api/team",
    "/api/state",
    "/api/admin",
    "/api/iros/publish",
  ])("%s requires auth", (p) => {
    expect(isPublic(p)).toBe(false);
  });
});
