// Social publishing client — backed by Zernio (https://zernio.com).
// Replaced Ayrshare with Zernio: a unified REST API to connect a company's socials
// (X / LinkedIn / Facebook / Instagram / + more) and publish/schedule posts.
//
// The exported names keep the legacy "ayrshare"/"profileKey" wording so the ~20
// callers across the app stay unchanged. Internally "profileKey" is now a Zernio
// PROFILE ID (prof_…), stored in the same companies.ayrshare_profile_key column.
//
// Auth: ZERNIO_API_KEY (Bearer sk_…). No private key / domain / JWT needed.

const ZERNIO = "https://zernio.com/api/v1";

export interface PostResult {
  ok: boolean;
  posted: boolean; // true = went to the real network now
  scheduled?: boolean; // true = accepted for a future scheduledFor time
  postUrl?: string;
  externalId?: string;
  error?: string;
}

function apiKey(): string | undefined {
  return process.env.ZERNIO_API_KEY;
}

export function ayrshareConfigured(): boolean {
  return Boolean(apiKey());
}

// Zernio needs only the API key for the full multi-tenant flow (profiles + hosted
// connect). No separate private key, so multi-tenant == configured.
export function ayrshareMultiTenant(): boolean {
  return Boolean(apiKey());
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" };
}

// Create a Zernio PROFILE for a company. Returns its id (prof_…), which we store on
// the company and use to scope connect + publishing to THAT company's socials.
export async function createAyrshareProfile(title: string, idSuffix?: string): Promise<{ ok: boolean; profileKey?: string; error?: string; code?: string }> {
  if (!apiKey()) return { ok: false, error: "Publishing isn't configured." };
  const name = `${title}`.slice(0, 100);
  try {
    const res = await fetch(`${ZERNIO}/profiles`, {
      method: "POST",
      headers: authHeaders(),
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ name, description: idSuffix ? `Company ${idSuffix}` : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    const id = data?.profile?._id ?? data?.profile?.id ?? data?._id ?? data?.id ?? data?.profileId;
    if (res.ok && id) return { ok: true, profileKey: String(id) };

    const msg = String(data?.message ?? data?.error ?? `HTTP ${res.status}`);
    // Account/plan cap reached — surface a clear, actionable error (mirrors the old
    // Ayrshare cap handling so the connect route's messaging still works).
    if (/limit|maximum|max.*(account|profile)|upgrade your plan|quota/i.test(msg)) {
      return { ok: false, error: "Your Zernio plan's account limit is reached. Upgrade the plan or free up an account, then try connecting again.", code: "profile_cap" };
    }
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Publishing service unreachable." };
  }
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pubcozone.com";

// Start the OAuth connect flow for ONE network and return the authUrl to send the
// user to. Zernio is per-platform: GET /connect/{platform}?profileId&redirect_url
// returns { authUrl, state }. After the user authorizes, Zernio redirects back to
// redirect_url with the connection result. Defaults to X (twitter); pass `platform`
// to connect a different network. (Signature kept compatible with the old hosted
// single-link flow; callers that want a specific network pass it.)
export async function generateAyrshareLinkUrl(profileKey: string, platform: string = "twitter"): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!apiKey()) return { ok: false, error: "Publishing isn't configured." };
  if (!profileKey) return { ok: false, error: "No social profile for this company yet." };
  const plat = normalizePlatform(platform) === "twitter" ? "twitter" : normalizePlatform(platform);
  const redirect = `${SITE_URL}/settings?connected=1`;
  try {
    const url = new URL(`${ZERNIO}/connect/${plat}`);
    url.searchParams.set("profileId", profileKey);
    url.searchParams.set("redirect_url", redirect);
    const res = await fetch(url.toString(), { headers: authHeaders(), signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => ({}));
    const authUrl = data?.authUrl ?? data?.url;
    if (res.ok && authUrl) return { ok: true, url: String(authUrl) };
    const msg = String(data?.error ?? data?.message ?? `HTTP ${res.status}`);
    if (/payment|plan|upgrade|402/i.test(msg) || res.status === 402) {
      return { ok: false, error: "Connecting accounts requires a paid Zernio plan. Upgrade the plan, then try again." };
    }
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Publishing service unreachable." };
  }
}

// The connected accounts for a profile. Zernio exposes a single account-level list
// (GET /accounts); we filter to the ones belonging to this profile. Each entry has
// its accountId (needed to target publishing) + a normalized platform key.
interface LinkedAccount { platform: string; accountId: string }

// Zernio returns profileId as EITHER a bare id string OR a populated object
// { _id, name }. Pull the id out of either shape (the old String(profileId)
// comparison stringified the object to "[object Object]" and silently dropped
// every account — a real bug that hid connections from the UI).
function profileIdOf(a: any): string {
  const p = a?.profileId;
  if (!p) return "";
  return String(typeof p === "object" ? (p._id ?? p.id ?? "") : p);
}

async function fetchAccounts(profileKey: string): Promise<any[]> {
  if (!apiKey() || !profileKey) return [];
  try {
    const res = await fetch(`${ZERNIO}/accounts?profileId=${encodeURIComponent(profileKey)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const arr: any[] = data?.accounts ?? data?.data ?? (Array.isArray(data) ? data : []);
    // Scope to this profile when the server didn't already filter. Accept accounts
    // whose profileId matches OR that carry no profileId at all.
    return arr.filter((a) => { const pid = profileIdOf(a); return !pid || pid === String(profileKey); });
  } catch {
    return [];
  }
}

async function listProfileAccounts(profileKey: string): Promise<LinkedAccount[]> {
  const arr = await fetchAccounts(profileKey);
  return arr
    .map((a) => ({
      platform: normalizePlatform(String(a.platform ?? a.provider ?? a.network ?? "")),
      accountId: String(a.accountId ?? a._id ?? a.id ?? ""),
    }))
    .filter((a) => a.platform && a.accountId);
}

// Rich, UI-facing view of one connected account: who it is, whether it's live, and
// whether it can actually post. Surfaced in Settings so a connection is CONFIRMED
// (handle + avatar) and its health is visible (active / token / post-capable).
export interface SocialAccount {
  platform: string;          // normalized channel key (twitter, linkedin, …)
  accountId: string;
  displayName?: string;      // "AmericanFusion"
  username?: string;         // "FusionAMFN"
  profilePicture?: string;
  followersCount?: number;
  isActive: boolean;         // Zernio isActive && enabled
  platformStatus?: string;   // "active" | … (platform-level)
  tokenExpiresAt?: string;   // ISO; null/absent when N/A
  autoRefreshes?: boolean;   // token rotates server-side → past expiry ≠ "expired"
  tokenValid: boolean;       // best-effort from active + non-expired (refined by /health)
  canPost: boolean;          // has the write scope + active (refined by /health)
}

// Per-platform OAuth scope that grants "can publish a post". Each network names it
// differently — LinkedIn uses w_member_social (no "write" substring), so a generic
// /write/ check wrongly flagged it as not-postable. Matched against the granted scopes.
const POST_SCOPE: Record<string, RegExp> = {
  twitter: /tweet\.write/i,
  linkedin: /w_member_social|w_organization_social/i,
  facebook: /pages_manage_posts|publish_pages|pages_manage_engagement/i,
  // IG returns instagram_business_content_publish (note the _business_ infix) — the
  // old /instagram_content_publish/ missed it and falsely flagged "check posting".
  instagram: /content_publish|instagram_(business_)?basic/i,
  youtube: /youtube\.upload|youtube(\.|$)/i,
  tiktok: /video\.publish|video\.upload/i,
  reddit: /submit/i,
  telegram: /.*/i, // bot token posts directly; no per-scope gate
};

// Platforms whose access token auto-refreshes server-side (the provider rotates it),
// so a PAST tokenExpiresAt in the list is NOT "expired" — it just means a refresh is
// due. Showing these as "Token expired" is a false alarm (the live /health check
// reports them valid + auto-refreshing).
const AUTO_REFRESH_PLATFORMS = new Set(["twitter"]);

function deriveCanPost(a: any): boolean {
  const perms: string[] = a?.permissions ?? (a?.metadata?.scope ? String(a.metadata.scope).split(/\s+/) : []);
  const plat = normalizePlatform(String(a.platform ?? ""));
  // Match the platform's real publish scope; fall back to a broad write/publish grant.
  const needle = POST_SCOPE[plat] ?? /publish|write|manage|content|social/i;
  const active = Boolean(a.isActive) && a.enabled !== false;
  // If the provider didn't return scopes at all, don't punish an otherwise-active
  // account — treat active as post-capable (the live /health test is the source of truth).
  if (perms.length === 0) return active;
  return active && perms.some((p) => needle.test(String(p)));
}

// Detailed accounts for a profile — the confirmation + status the Settings UI shows.
export async function getLinkedAccountsDetailed(profileKey?: string): Promise<SocialAccount[]> {
  if (!profileKey) return [];
  const arr = await fetchAccounts(profileKey);
  return arr
    .map((a) => {
      const plat = normalizePlatform(String(a.platform ?? a.provider ?? a.network ?? ""));
      const autoRefreshes = AUTO_REFRESH_PLATFORMS.has(plat);
      const expIso = a.tokenExpiresAt ?? null;
      const expMs = expIso ? Date.parse(expIso) : NaN;
      // Auto-refresh platforms are never "expired" from a past timestamp — the token
      // rotates server-side. Only treat a past expiry as expired for platforms that
      // DON'T auto-refresh.
      const notExpired = autoRefreshes || Number.isNaN(expMs) ? true : expMs > Date.now();
      return {
        platform: plat,
        accountId: String(a.accountId ?? a._id ?? a.id ?? ""),
        displayName: a.displayName ?? a.metadata?.profileData?.displayName ?? a.name ?? undefined,
        username: a.username ?? a.metadata?.profileData?.username ?? a.handle ?? undefined,
        profilePicture: a.profilePicture ?? a.metadata?.profileData?.profilePicture ?? undefined,
        followersCount: typeof a.followersCount === "number" ? a.followersCount : undefined,
        isActive: Boolean(a.isActive) && a.enabled !== false,
        platformStatus: a.platformStatus ?? undefined,
        tokenExpiresAt: expIso ?? undefined,
        autoRefreshes,
        tokenValid: Boolean(a.isActive) && notExpired,
        canPost: deriveCanPost(a),
      } as SocialAccount;
    })
    .filter((a) => a.platform && a.accountId);
}

// Result of a live "Test connection" check for one account.
export interface AccountHealth {
  ok: boolean;               // reachable + healthy enough to post
  status?: string;           // "healthy" | "degraded" | …
  canPost: boolean;
  tokenValid: boolean;
  tokenExpiresAt?: string;
  needsRefresh?: boolean;
  username?: string;
  displayName?: string;
  missingScopes?: string[];  // required posting scopes not granted
  error?: string;
}

// Live health check via Zernio's GET /accounts/{id}/health — used by "Test
// connection". Returns a clear pass/fail with the reason, so the UI can say
// exactly why an account can't post (token expired, missing write scope, etc.).
export async function getAccountHealth(accountId: string): Promise<AccountHealth> {
  if (!apiKey()) return { ok: false, canPost: false, tokenValid: false, error: "Publishing isn't configured." };
  if (!accountId) return { ok: false, canPost: false, tokenValid: false, error: "No account to test." };
  try {
    const res = await fetch(`${ZERNIO}/accounts/${encodeURIComponent(accountId)}/health`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { ok: false, canPost: false, tokenValid: false, error: "This account is no longer connected. Reconnect it." };
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, canPost: false, tokenValid: false, error: String(d?.message ?? d?.error ?? `Health check failed (${res.status}).`) };

    const tokenStatus = d?.tokenStatus ?? {};
    const tokenValid = tokenStatus.valid !== false;
    const posting: any[] = d?.permissions?.posting ?? [];
    const missingScopes = posting.filter((p) => p?.required && !p?.granted).map((p) => String(p.scope));
    const canPost = tokenValid && missingScopes.length === 0 && String(d?.status ?? "").toLowerCase() !== "disconnected";
    return {
      ok: canPost,
      status: d?.status,
      canPost,
      tokenValid,
      tokenExpiresAt: tokenStatus.expiresAt,
      needsRefresh: tokenStatus.needsRefresh,
      username: d?.username,
      displayName: d?.displayName,
      missingScopes: missingScopes.length ? missingScopes : undefined,
    };
  } catch (e) {
    return { ok: false, canPost: false, tokenValid: false, error: e instanceof Error ? e.message : "Couldn't reach the publishing service." };
  }
}

// Map our channel keys <-> Zernio platform names. We use "twitter" internally;
// Zernio may use "x" or "twitter" — accept both.
function normalizePlatform(p: string): string {
  const s = p.toLowerCase();
  if (s === "x" || s === "twitter") return "twitter";
  return s;
}
function toZernioPlatform(channel: string): string {
  // Zernio's X platform key — send "twitter" (Zernio accepts it; many of their
  // examples use "twitter").
  return channel;
}

// Which social networks a company has actually linked (UI status). Returns the
// normalized channel keys (twitter, linkedin, …).
export async function getLinkedAccounts(profileKey?: string): Promise<string[]> {
  if (!profileKey) return [];
  const accounts = await listProfileAccounts(profileKey);
  return Array.from(new Set(accounts.map((a) => a.platform)));
}

export interface AyrPostStatus {
  found: boolean;
  status: "scheduled" | "pending" | "success" | "error" | "deleted" | "unknown";
  postUrl?: string;
  error?: string;
}
// Live status of one previously-submitted post by its Zernio post id.
export async function getPostStatus(ayrPostId: string, _profileKey?: string): Promise<AyrPostStatus> {
  if (!apiKey() || !ayrPostId) return { found: false, status: "unknown" };
  try {
    const res = await fetch(`${ZERNIO}/posts/${encodeURIComponent(ayrPostId)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { found: false, status: "unknown" };
    const data = await res.json().catch(() => ({}));
    const post = data?.post ?? data;
    const raw = String(post?.status ?? "").toLowerCase();
    const plats: any[] = post?.platforms ?? [];
    const postUrl = plats.find((p) => p?.postUrl || p?.url)?.postUrl ?? plats[0]?.url ?? post?.url;
    let status: AyrPostStatus["status"] = "unknown";
    if (raw.includes("schedul")) status = "scheduled";
    else if (raw === "pending" || raw.includes("process") || raw === "queued") status = "pending";
    else if (raw === "published" || raw === "success" || raw === "posted" || raw === "completed") status = "success";
    else if (raw === "error" || raw === "failed") status = "error";
    else if (raw.includes("delet")) status = "deleted";
    return { found: true, status, postUrl, error: post?.error ?? plats.find((p) => p?.error)?.error };
  } catch {
    return { found: false, status: "unknown" };
  }
}

// Unlink ONE social network from a company's profile.
export async function disconnectAccount(platform: string, profileKey?: string): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey()) return { ok: false, error: "Publishing isn't configured." };
  if (!profileKey) return { ok: false, error: "No social profile for this company — nothing to disconnect." };
  const plat = normalizePlatform(String(platform || "").trim());
  if (!plat) return { ok: false, error: "No platform specified." };
  // Find the account id for that platform within this profile, then delete it.
  const accounts = await listProfileAccounts(profileKey);
  const acct = accounts.find((a) => a.platform === plat);
  if (!acct) return { ok: true }; // already not linked — treat as success
  try {
    // Zernio disconnects at the ACCOUNT level: DELETE /accounts/{accountId}. (The
    // old /profiles/{id}/accounts/{id} path doesn't exist and returned 404.)
    const res = await fetch(`${ZERNIO}/accounts/${encodeURIComponent(acct.accountId)}`, {
      method: "DELETE",
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok || res.status === 404) return { ok: true }; // 404 = already gone
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data?.message ?? data?.error ?? `Couldn't disconnect (${res.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach the publishing service. Try again." };
  }
}

// Channels we support (subset of Zernio's 15). Used by the publishing UI.
export const AYRSHARE_CHANNELS = [
  { key: "twitter", label: "X (Twitter)" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "telegram", label: "Telegram" },
  { key: "reddit", label: "Reddit" },
] as const;

export interface PublishOptions {
  scheduleDate?: string;  // ISO 8601; when set, schedules instead of posting now
  mediaUrls?: string[];   // public image/video URLs to attach
}

// Build the Zernio platforms[] payload (each linked account that matches a chosen
// channel). Returns [] if none of the chosen channels are linked on this profile.
async function targetsFor(channels: string[], profileKey?: string): Promise<{ platform: string; accountId: string }[]> {
  if (!profileKey) return [];
  const wanted = new Set(channels.map(normalizePlatform));
  const accounts = await listProfileAccounts(profileKey);
  return accounts.filter((a) => wanted.has(a.platform)).map((a) => ({ platform: toZernioPlatform(a.platform), accountId: a.accountId }));
}

function mediaItems(urls: string[]): { type: string; url: string }[] {
  return urls.filter(Boolean).map((url) => ({ type: /\.(mp4|mov|webm)$/i.test(url) ? "video" : "image", url }));
}

// Generic publish: one post out to any set of channels for a company's profile.
export async function publishToChannels(text: string, channels: string[], profileKey?: string, opts?: PublishOptions): Promise<PostResult> {
  const valid = channels.filter((c) => AYRSHARE_CHANNELS.some((a) => a.key === c));
  if (valid.length === 0) return { ok: false, posted: false, error: "No channels selected." };
  if (!apiKey()) return { ok: true, posted: false, scheduled: Boolean(opts?.scheduleDate) }; // simulate when not configured

  const scheduled = Boolean(opts?.scheduleDate);
  const platforms = await targetsFor(valid, profileKey);
  if (platforms.length === 0) {
    return { ok: false, posted: false, error: "None of the selected networks are connected for this company. Connect them in Settings first." };
  }
  const media = mediaItems(opts?.mediaUrls ?? []);
  try {
    const res = await fetch(`${ZERNIO}/posts`, {
      method: "POST",
      headers: authHeaders(),
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        content: text,
        platforms,
        ...(media.length ? { mediaItems: media } : {}),
        ...(scheduled ? { scheduledFor: opts!.scheduleDate } : { publishNow: true }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    const post = data?.post ?? data;
    if (!res.ok || post?.status === "error" || post?.status === "failed") {
      const detail = post?.error ?? data?.message ?? (post?.platforms ?? []).map((p: any) => p?.error).filter(Boolean).join("; ") ?? `HTTP ${res.status}`;
      return { ok: false, posted: false, error: `Zernio: ${detail}` };
    }
    const id = post?._id ?? post?.id;
    const url = (post?.platforms ?? []).find((p: any) => p?.postUrl || p?.url)?.postUrl;
    return { ok: true, posted: !scheduled, scheduled, postUrl: url, externalId: id ? String(id) : undefined };
  } catch (e) {
    return { ok: false, posted: false, error: e instanceof Error ? `Zernio unreachable: ${e.message}` : "Zernio unreachable" };
  }
}

// Post an X thread. Zernio takes a single content body; we join the tweets and
// target the company's linked X account.
export async function postThreadToX(tweets: string[], profileKey?: string): Promise<PostResult> {
  if (!apiKey()) return { ok: true, posted: false }; // simulate
  return publishToChannels(tweets.join("\n\n"), ["twitter"], profileKey);
}
