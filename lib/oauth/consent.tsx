import { resolveSessionActor } from "@/lib/services/context";
import { getClient, redirectAllowed, capGrantedScopes } from "@/lib/oauth/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { Scope } from "@/lib/services/context";

// ── Shared consent-screen rendering ──
// Used by the /oauth/authorize server page. Validation lives here so the page and
// the POST accept handler (app/api/oauth/authorize) agree on the exact rules:
// EXACT redirect match, response_type=code, PKCE S256 required, scope cap.

export const SCOPE_LABELS: Record<Scope, string> = {
  "posts:read": "Read your posts and drafts",
  "posts:write": "Create and edit drafts (not publish)",
  "posts:approve": "Record approval decisions",
  "posts:publish": "Schedule and publish approved content",
  "company:read": "Read company status and compliance posture",
  "crm:read": "Read your CRM contacts and tasks",
  "crm:write": "Add CRM notes and tasks (never delete)",
};

export interface AuthorizeParams {
  clientId: string; redirectUri: string; responseType: string; scope: string;
  state: string; codeChallenge: string; codeChallengeMethod: string;
}

export function paramsFrom(sp: Record<string, string | string[] | undefined>): AuthorizeParams {
  const g = (k: string) => { const v = sp[k]; return Array.isArray(v) ? (v[0] ?? "") : (v ?? ""); };
  return {
    clientId: g("client_id"), redirectUri: g("redirect_uri"), responseType: g("response_type"),
    scope: g("scope"), state: g("state"), codeChallenge: g("code_challenge"),
    codeChallengeMethod: g("code_challenge_method"),
  };
}

export type ValidateResult =
  | { ok: true; clientName: string }
  | { ok: false; title: string; detail: string };

// Protocol validation. NEVER surfaces a redirect to an unvalidated redirect_uri —
// on any failure it returns an error to render in-page.
export async function validateAuthorize(p: AuthorizeParams): Promise<ValidateResult> {
  if (!p.clientId) return { ok: false, title: "Invalid request", detail: "Missing client_id." };
  const client = await getClient(p.clientId);
  if (!client) return { ok: false, title: "Unknown client", detail: "This application is not registered." };
  if (!p.redirectUri || !redirectAllowed(client, p.redirectUri)) {
    return { ok: false, title: "Invalid redirect URI", detail: "The redirect_uri does not exactly match a registered URI for this client. For your safety we will not redirect." };
  }
  if (p.responseType !== "code") return { ok: false, title: "Unsupported response_type", detail: 'Only response_type="code" is supported.' };
  if (!p.codeChallenge) return { ok: false, title: "PKCE required", detail: "A code_challenge is required (PKCE)." };
  if (p.codeChallengeMethod !== "S256") return { ok: false, title: "Unsupported PKCE method", detail: 'Only code_challenge_method="S256" is supported.' };
  const { data } = await createServiceClient().from("oauth_clients").select("client_name").eq("client_id", p.clientId).maybeSingle();
  return { ok: true, clientName: String(data?.client_name ?? "").trim() || p.clientId };
}

export interface ConsentView {
  clientName: string; companyName: string; ticker: string; actorEmail: string;
  granted: Scope[]; sensitiveDropped: boolean;
}

// Resolve the session + company + capped scopes for the consent screen. Returns
// null when not signed in (page redirects to /login).
export async function consentView(p: AuthorizeParams, clientName: string): Promise<ConsentView | null> {
  const actor = await resolveSessionActor();
  if (!actor) return null;
  const requested = p.scope.split(/\s+/).filter(Boolean);
  const granted = capGrantedScopes(requested, actor.role);
  const { data: co } = await createServiceClient().from("companies").select("name, ticker").eq("id", actor.companyId).maybeSingle();
  const requestedSensitive = requested.some((s) => s === "posts:approve" || s === "posts:publish");
  const grantedSensitive = granted.some((s) => s === "posts:approve" || s === "posts:publish");
  return {
    clientName,
    companyName: String(co?.name ?? "your company"),
    ticker: String(co?.ticker ?? ""),
    actorEmail: actor.actorEmail,
    granted,
    sensitiveDropped: requestedSensitive && !grantedSensitive,
  };
}
