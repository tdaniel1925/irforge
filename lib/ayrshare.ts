// Ayrshare client — real X (Twitter) posting.
// With AYRSHARE_API_KEY set, publish actually posts; without it, publishing is simulated locally.

export interface PostResult {
  ok: boolean;
  posted: boolean; // true = went to the real network
  postUrl?: string;
  externalId?: string;
  error?: string;
}

export function ayrshareConfigured(): boolean {
  return Boolean(process.env.AYRSHARE_API_KEY);
}

// Multi-tenant: each company links its OWN socials via an Ayrshare "User Profile"
// (Business Plan). Requires both the API key and the private key (JWT SSO).
export function ayrshareMultiTenant(): boolean {
  return Boolean(process.env.AYRSHARE_API_KEY && process.env.AYRSHARE_PRIVATE_KEY);
}

// Create an Ayrshare user profile for a company. Returns its profileKey, which we
// store on the company and pass on every post so it goes to THAT company's socials.
export async function createAyrshareProfile(title: string): Promise<{ ok: boolean; profileKey?: string; error?: string }> {
  const key = process.env.AYRSHARE_API_KEY;
  if (!key) return { ok: false, error: "Ayrshare not configured." };
  try {
    const res = await fetch("https://api.ayrshare.com/api/profiles", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ title: title.slice(0, 100) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.profileKey) {
      return { ok: false, error: data?.message ?? `Ayrshare profile error (HTTP ${res.status})` };
    }
    return { ok: true, profileKey: data.profileKey };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ayrshare unreachable" };
  }
}

// Generate a single-use SSO URL to Ayrshare's hosted "connect your socials" page,
// scoped to one company's profile. The company clicks it and links X/LinkedIn/etc.
export async function generateAyrshareLinkUrl(profileKey: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const key = process.env.AYRSHARE_API_KEY;
  const privateKey = process.env.AYRSHARE_PRIVATE_KEY;
  // Ayrshare's Business Plan assigns a domain ID (e.g. "id-1MW7j"); it's the prefix
  // on your private-key filename in the integration package.
  const domain = process.env.AYRSHARE_DOMAIN || "id-1MW7j";
  if (!key || !privateKey) return { ok: false, error: "Ayrshare multi-account is not configured (missing private key)." };
  try {
    // generateJWT expects an application/x-www-form-urlencoded body, NOT JSON.
    const form = new URLSearchParams();
    form.set("domain", domain);
    form.set("privateKey", privateKey);
    form.set("profileKey", profileKey);
    const res = await fetch("https://api.ayrshare.com/api/profiles/generateJWT", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(20000),
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      return { ok: false, error: data?.message ?? `Ayrshare JWT error (HTTP ${res.status})` };
    }
    return { ok: true, url: data.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ayrshare unreachable" };
  }
}

// Which social networks a company has actually linked (so the UI can show status).
export async function getLinkedAccounts(profileKey?: string): Promise<string[]> {
  const key = process.env.AYRSHARE_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.ayrshare.com/api/user", {
      headers: { Authorization: `Bearer ${key}`, ...(profileKey ? { "Profile-Key": profileKey } : {}) },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const accounts: string[] = data?.activeSocialAccounts ?? [];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

// Channels Ayrshare supports (one integration, many networks). Used by the
// publishing UI so companies just tick the boxes.
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

// Generic publish: one post text out to any set of Ayrshare channels.
export async function publishToChannels(text: string, channels: string[], profileKey?: string): Promise<PostResult> {
  const key = process.env.AYRSHARE_API_KEY;
  const platforms = channels.filter((c) => AYRSHARE_CHANNELS.some((a) => a.key === c));
  if (platforms.length === 0) return { ok: false, posted: false, error: "No channels selected." };
  if (!key) return { ok: true, posted: false }; // simulate when not configured

  try {
    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(profileKey ? { "Profile-Key": profileKey } : {}) },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ post: text, platforms }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === "error") {
      const detail = data?.errors?.map((e: any) => e?.message ?? JSON.stringify(e)).join("; ") ?? data?.message ?? `HTTP ${res.status}`;
      return { ok: false, posted: false, error: `Ayrshare: ${detail}` };
    }
    const first = (data.postIds ?? [])[0];
    return { ok: true, posted: true, postUrl: first?.postUrl, externalId: first?.id ?? data.id };
  } catch (e) {
    return { ok: false, posted: false, error: e instanceof Error ? `Ayrshare unreachable: ${e.message}` : "Ayrshare unreachable" };
  }
}

export async function postThreadToX(tweets: string[], profileKey?: string): Promise<PostResult> {
  const key = process.env.AYRSHARE_API_KEY;
  if (!key) return { ok: true, posted: false }; // simulate

  try {
    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(profileKey ? { "Profile-Key": profileKey } : {}),
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        post: tweets.join("\n\n"),
        platforms: ["twitter"],
        twitterOptions: {
          thread: true,
          threadNumber: true,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.status === "error") {
      const detail =
        data?.errors?.map((e: any) => e?.message ?? JSON.stringify(e)).join("; ") ??
        data?.message ??
        `HTTP ${res.status}`;
      return { ok: false, posted: false, error: `Ayrshare: ${detail}` };
    }

    const twitterPost = (data.postIds ?? []).find((p: any) => p.platform === "twitter");
    return {
      ok: true,
      posted: true,
      postUrl: twitterPost?.postUrl,
      externalId: twitterPost?.id ?? data.id,
    };
  } catch (e) {
    return { ok: false, posted: false, error: e instanceof Error ? `Ayrshare unreachable: ${e.message}` : "Ayrshare unreachable" };
  }
}
