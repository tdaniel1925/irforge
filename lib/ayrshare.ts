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
export async function publishToChannels(text: string, channels: string[]): Promise<PostResult> {
  const key = process.env.AYRSHARE_API_KEY;
  const platforms = channels.filter((c) => AYRSHARE_CHANNELS.some((a) => a.key === c));
  if (platforms.length === 0) return { ok: false, posted: false, error: "No channels selected." };
  if (!key) return { ok: true, posted: false }; // simulate when not configured

  try {
    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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

export async function postThreadToX(tweets: string[]): Promise<PostResult> {
  const key = process.env.AYRSHARE_API_KEY;
  if (!key) return { ok: true, posted: false }; // simulate

  try {
    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
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
