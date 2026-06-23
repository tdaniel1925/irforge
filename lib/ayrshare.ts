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

// The Ayrshare private key (PEM). Stored base64 in AYRSHARE_PRIVATE_KEY_B64 to
// avoid multiline-env mangling on hosts; falls back to the raw AYRSHARE_PRIVATE_KEY.
function ayrsharePrivateKey(): string {
  const b64 = process.env.AYRSHARE_PRIVATE_KEY_B64;
  if (b64) {
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      /* fall through */
    }
  }
  const raw = process.env.AYRSHARE_PRIVATE_KEY ?? "";
  // If a host flattened the PEM's newlines into literal "\n", restore them.
  return raw.includes("\\n") && !raw.includes("\n") ? raw.replace(/\\n/g, "\n") : raw;
}

// Multi-tenant: each company links its OWN socials via an Ayrshare "User Profile"
// (Business Plan). Requires both the API key and the private key (JWT SSO).
export function ayrshareMultiTenant(): boolean {
  return Boolean(process.env.AYRSHARE_API_KEY && ayrsharePrivateKey());
}

// NOTE: there is deliberately NO "recover profileKey by title" helper. Ayrshare's
// GET /profiles list exposes only `refId` (never `profileKey`), and refId is
// REJECTED by generateJWT and /post ("Profile Key is invalid"). The usable
// profileKey is returned ONLY in the create response — so the only correct way to
// obtain one is to create a profile and persist its key immediately (which we now
// do; see store.ts ayrshare_profile_key). Recovering by title would only ever
// yield a refId and silently break connect/posting.

// Create an Ayrshare user profile for a company. Returns its profileKey, which we
// store on the company and pass on every post so it goes to THAT company's socials.
export async function createAyrshareProfile(title: string, idSuffix?: string): Promise<{ ok: boolean; profileKey?: string; error?: string }> {
  const key = process.env.AYRSHARE_API_KEY;
  if (!key) return { ok: false, error: "Ayrshare not configured." };

  // CRITICAL: Ayrshare's profileKey (used for JWT/posting) is returned ONLY in the
  // create response. The /profiles LIST exposes only `refId`, which generateJWT and
  // /post REJECT ("Profile Key is invalid"). So we must NEVER recover a profile by
  // title from the list (it can only yield refId) — the only source of a usable key
  // is a fresh create. On a title collision we retry with a disambiguated title so
  // create always succeeds and returns a real profileKey. Any abandoned empty
  // profile is harmless (no linked socials) and can be cleaned up in the dashboard.
  const base = title.slice(0, 90);
  const attempts = [base, `${base} ·${idSuffix ?? ""}`.slice(0, 100), `${base} ·${idSuffix ?? ""}-2`.slice(0, 100)];

  let lastErr = "";
  for (const t of attempts) {
    try {
      const res = await fetch("https://api.ayrshare.com/api/profiles", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ title: t }),
      });
      const data = await res.json().catch(() => ({}));
      // Only profileKey is usable. Do NOT fall back to refId.
      if (res.ok && data.profileKey) return { ok: true, profileKey: data.profileKey };

      const msg = String(data?.message ?? "");
      lastErr = msg || `Ayrshare profile error (HTTP ${res.status})`;
      // On a duplicate-title collision, try the next disambiguated title.
      if (/already exists/i.test(msg)) continue;
      // Any other error: stop and report.
      return { ok: false, error: lastErr };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Ayrshare unreachable";
    }
  }
  return { ok: false, error: lastErr || "Couldn't create a social profile." };
}

// Generate a single-use SSO URL to Ayrshare's hosted "connect your socials" page,
// scoped to one company's profile. The company clicks it and links X/LinkedIn/etc.
export async function generateAyrshareLinkUrl(profileKey: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const key = process.env.AYRSHARE_API_KEY;
  const privateKey = ayrsharePrivateKey();
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
  // No per-company profile yet = nothing connected. Without a Profile-Key header
  // Ayrshare returns the PRIMARY account's socials, which would wrongly show another
  // company's (or our own) connections on a brand-new account. So bail to [].
  if (!profileKey) return [];
  try {
    const res = await fetch("https://api.ayrshare.com/api/user", {
      headers: { Authorization: `Bearer ${key}`, "Profile-Key": profileKey },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const accounts: string[] = data?.activeSocialAccounts ?? [];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

// Unlink ONE social network from a company's Ayrshare profile.
// CRITICAL: Ayrshare's DELETE /profiles/social unlinks the PRIMARY profile if no
// Profile-Key is sent — so we hard-require profileKey and refuse otherwise, to
// avoid ever disconnecting our own main account.
export async function disconnectAccount(platform: string, profileKey?: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.AYRSHARE_API_KEY;
  if (!key) return { ok: false, error: "Publishing isn't configured." };
  if (!profileKey) return { ok: false, error: "No social profile for this company — nothing to disconnect." };
  const plat = String(platform || "").trim().toLowerCase();
  if (!plat) return { ok: false, error: "No platform specified." };
  try {
    const res = await fetch("https://api.ayrshare.com/api/profiles/social", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Profile-Key": profileKey },
      body: JSON.stringify({ platform: plat }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    // Ayrshare returns 200 even if the platform wasn't linked — treat that as success.
    if (res.ok && (data?.status === "success" || data?.status === undefined)) return { ok: true };
    return { ok: false, error: data?.message ?? `Couldn't disconnect (${res.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach the publishing service. Try again." };
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
