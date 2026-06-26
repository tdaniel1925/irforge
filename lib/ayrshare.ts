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
async function listProfileAccounts(profileKey: string): Promise<LinkedAccount[]> {
  if (!apiKey() || !profileKey) return [];
  try {
    const res = await fetch(`${ZERNIO}/accounts?profileId=${encodeURIComponent(profileKey)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const arr: any[] = data?.accounts ?? data?.data ?? (Array.isArray(data) ? data : []);
    return arr
      .filter((a) => !a.profileId || String(a.profileId) === String(profileKey)) // scope to this profile
      .map((a) => ({
        platform: normalizePlatform(String(a.platform ?? a.provider ?? a.network ?? "")),
        accountId: String(a.accountId ?? a._id ?? a.id ?? ""),
      }))
      .filter((a) => a.platform && a.accountId);
  } catch {
    return [];
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
    const res = await fetch(`${ZERNIO}/profiles/${encodeURIComponent(profileKey)}/accounts/${encodeURIComponent(acct.accountId)}`, {
      method: "DELETE",
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data?.message ?? `Couldn't disconnect (${res.status}).` };
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
