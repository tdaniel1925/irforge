"use client";

import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

// Quick Post — compose a post, pick channels, preview (with disclosures + compliance
// checks), then publish immediately. Same guardrails as the Do queue: disclosures are
// always appended, blocked language stops the post, and a Reg-FD "red" requires
// explicit acknowledgement before sending. Inline-only (no popups/toasts).

const NETWORKS: { key: string; label: string; icon: string }[] = [
  { key: "twitter", label: "X (Twitter)", icon: "𝕏" },
  { key: "linkedin", label: "LinkedIn", icon: "in" },
  { key: "facebook", label: "Facebook", icon: "f" },
  { key: "instagram", label: "Instagram", icon: "◎" },
  { key: "youtube", label: "YouTube", icon: "▶" },
  { key: "tiktok", label: "TikTok", icon: "♪" },
  { key: "telegram", label: "Telegram", icon: "✈" },
  { key: "reddit", label: "Reddit", icon: "r/" },
];

interface ConnectedAccount { platform: string; displayName?: string; username?: string; profilePicture?: string; canPost: boolean }
interface Preview {
  preview: string;
  bodies?: Record<string, string>;   // per-channel final text (X differs from the rest)
  channels: string[];
  mediaUrls: string[];
  flags: { level?: string; message?: string; severity?: string }[];
  blocked: boolean;
  notConnected: string[];
  regFd: { classification: string; flags: string[]; reasoning: string } | null;
  quietMode: boolean;
  tooLong?: { channel: string; len: number; limit: number; over: number }[];
}

export default function QuickPostPage() {
  const { db, error } = useAppState();
  const [text, setText] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [media, setMedia] = useState<{ url: string; kind: "image" | "video" }[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loadingAccts, setLoadingAccts] = useState(true);

  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState<{ posted: boolean; postUrl?: string; channels: string[] } | null>(null);
  const [aiImageOff, setAiImageOff] = useState(false);
  const [previewTab, setPreviewTab] = useState<string | null>(null);
  const [brandColors, setBrandColors] = useState("");
  const [imgVariant, setImgVariant] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/social/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d.accounts) ? d.accounts : []))
      .catch(() => {})
      .finally(() => setLoadingAccts(false));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const connectedKeys = new Set(accounts.map((a) => a.platform));
  const toggleChannel = (k: string) => {
    setPreview(null); setDone(null);
    setChannels((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  };

  // Any edit invalidates a prior preview/approval.
  const onText = (v: string) => { setText(v); setPreview(null); setDone(null); setAck(false); };

  const uploadFile = async (file: File) => {
    setErr(""); setMediaBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/social/quickpost/media", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Upload failed.");
      setMedia((m) => [...m, { url: d.url, kind: d.kind }]);
      setPreview(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setMediaBusy(false);
    }
  };

  const generateImage = async () => {
    setErr(""); setMediaBusy(true);
    try {
      const r = await fetch("/api/social/quickpost/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // brandColors biases the palette; variant rotates composition so each
        // regenerate looks different; layout picks the branded template style.
        body: JSON.stringify({ generate: true, text, brandColors: brandColors.trim() || undefined, variant: imgVariant }),
      });
      const d = await r.json();
      if (r.status === 503) { setAiImageOff(true); return; } // not configured — hide the button, don't alarm
      if (!r.ok) throw new Error(d.error ?? "Couldn't generate an image.");
      setMedia((m) => [...m, { url: d.url, kind: "image" }]);
      setImgVariant((v) => v + 1);
      setPreview(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't generate an image.");
    } finally {
      setMediaBusy(false);
    }
  };

  const removeMedia = (url: string) => { setMedia((m) => m.filter((x) => x.url !== url)); setPreview(null); };

  const doPreview = async () => {
    setErr(""); setBusy(true); setDone(null);
    try {
      const r = await fetch("/api/social/quickpost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", text, channels, mediaUrls: media.map((m) => m.url) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Couldn't build preview.");
      setPreview(d);
      setPreviewTab(Array.isArray(d.channels) ? d.channels[0] : null);
      setAck(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't build preview.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/social/quickpost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", text, channels, mediaUrls: media.map((m) => m.url), acknowledgeRisk: ack }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.requiresAcknowledgement) {
          // Surface the Reg-FD stop inline and let the user acknowledge.
          setPreview((p) => (p ? { ...p, regFd: d.regFd } : p));
          throw new Error(d.error ?? "This post needs review before it can go out.");
        }
        throw new Error(d.error ?? "Couldn't publish.");
      }
      setDone({ posted: d.posted, postUrl: d.postUrl, channels: d.channels });
      setPreview(null); setText(""); setMedia([]); setChannels([]); setAck(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't publish.");
    } finally {
      setBusy(false);
    }
  };

  const canPreview = text.trim().length > 0 && channels.length > 0 && !busy;
  const regRed = preview?.regFd?.classification === "red";
  const overLimit = preview?.tooLong ?? [];
  const canPublish = preview && !preview.blocked && !preview.quietMode && preview.notConnected.length === 0 && overLimit.length === 0 && (!regRed || ack) && !busy;
  const labelFor = (k: string) => NETWORKS.find((n) => n.key === k)?.label ?? k;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Quick Post" subtitle="Write a post, choose channels, preview it with disclosures, and publish now — same compliance checks as the rest of PubcoZone." />

      {db.company.quietMode && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
          ⏸ Quiet mode is ON — publishing is suspended until you turn it off in Settings.
        </div>
      )}

      {done && (
        <Card className="mb-4 border-emerald-500/40 bg-emerald-500/5">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ {done.posted ? "Published" : "Posted (simulated — no live connection)"} to {done.channels.join(", ")}.
          </p>
          {done.postUrl && <a href={done.postUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-emerald-600 underline dark:text-emerald-400">View the live post →</a>}
        </Card>
      )}

      {err && <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{err}</div>}

      {/* 1 — compose */}
      <Card className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">Your post</label>
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={5}
          placeholder="What do you want to share with investors?"
          className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-faint">{text.length} characters · a forward-looking-statements note is appended automatically (a short version + link on X).</p>

        {/* media */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={mediaBusy}>{mediaBusy ? "…" : "📎 Add image / video"}</Button>
          {!aiImageOff && (
            <Button variant="ghost" onClick={generateImage} disabled={mediaBusy || !text.trim()} title={!text.trim() ? "Write some text first" : "Generate a cinematic, on-brand image from your text"}>
              {mediaBusy ? "Creating…" : media.some((m) => m.kind === "image") ? "✨ Regenerate image" : "✨ AI image"}
            </Button>
          )}
        </div>
        {!aiImageOff && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={brandColors}
              onChange={(e) => setBrandColors(e.target.value)}
              placeholder="Brand colors (optional) — e.g. navy blue and red"
              className="w-64 rounded-lg border border-app bg-surface-2 px-3 py-1.5 text-xs text-app focus:border-emerald-500 focus:outline-none"
            />
            <span className="text-[11px] text-faint">AI-generated · click again to regenerate a fresh look</span>
          </div>
        )}
        {media.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {media.map((m) => (
              <div key={m.url} className="relative">
                <MediaThumb url={m.url} kind={m.kind} />
                <button onClick={() => removeMedia(m.url)} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] text-white">✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 2 — channels */}
      <Card className="mb-4">
        <label className="mb-2 block text-xs font-medium text-muted">Post to</label>
        {loadingAccts ? (
          <p className="text-sm text-faint">Checking your connected accounts…</p>
        ) : connectedKeys.size === 0 ? (
          <p className="rounded-lg border border-dashed border-app bg-surface-2/40 px-3 py-2 text-sm text-muted">
            No accounts connected yet. <a href="/settings" className="text-emerald-600 underline dark:text-emerald-400">Connect accounts in Settings</a> first.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NETWORKS.filter((n) => connectedKeys.has(n.key)).map((n) => {
              const on = channels.includes(n.key);
              return (
                <button key={n.key} onClick={() => toggleChannel(n.key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${on ? "border-emerald-500/60 bg-emerald-500/10 text-app" : "border-app bg-surface-2/40 text-muted hover:bg-app-hover"}`}>
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-app-hover text-[10px] font-bold text-app">{n.icon}</span>
                  <span className="flex-1 text-left">{n.label}</span>
                  {on && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* 3 — preview / approve / send */}
      {!preview ? (
        <Button onClick={doPreview} disabled={!canPreview}>{busy ? "Building preview…" : "Preview post →"}</Button>
      ) : (
        <Card className="border-sky-500/30">
          <h2 className="mb-3 font-semibold text-app">Preview — this is how it&apos;ll look on each channel</h2>

          {/* Channel tabs — switch between how the post renders on each network. */}
          {preview.channels.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {preview.channels.map((c) => (
                <button
                  key={c}
                  onClick={() => setPreviewTab(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    (previewTab ?? preview.channels[0]) === c
                      ? "border-emerald-500/60 bg-emerald-500/10 text-app"
                      : "border-app bg-surface-2/40 text-muted hover:bg-app-hover"
                  }`}
                >
                  {labelFor(c)}
                </button>
              ))}
            </div>
          )}

          <ChannelMockup
            channel={previewTab ?? preview.channels[0]}
            text={preview.bodies?.[previewTab ?? preview.channels[0]] ?? preview.preview}
            mediaUrls={preview.mediaUrls}
            account={accounts.find((a) => a.platform === (previewTab ?? preview.channels[0]))}
            companyName={db.company.name}
          />
          <p className="mt-2 text-xs text-faint">Going to: {preview.channels.map(labelFor).join(", ")}</p>

          {/* warnings */}
          {preview.blocked && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              ✕ This contains blocked language and can&apos;t be published. Edit the text and preview again.
            </div>
          )}
          {preview.notConnected.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              ⚠ Not connected for: {preview.notConnected.join(", ")}. Remove those channels or connect them in Settings.
            </div>
          )}
          {overLimit.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              ✕ Too long for {overLimit.map((x) => labelFor(x.channel)).join(", ")}.
              <span className="mt-1 block text-xs">
                {overLimit.map((x) => `${labelFor(x.channel)}: ${x.len}/${x.limit} (over by ${x.over})`).join(" · ")}. Shorten your text, or uncheck that channel.
              </span>
            </div>
          )}
          {preview.flags.length > 0 && !preview.blocked && (
            <ul className="mt-3 space-y-1">
              {preview.flags.map((f, i) => (
                <li key={i} className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">⚠ {f.message ?? "Compliance note"}</li>
              ))}
            </ul>
          )}
          {regRed && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <p className="font-semibold">⚠ Possible material non-public information</p>
              <p className="mt-1 text-xs">{preview.regFd?.reasoning}</p>
              <label className="mt-2 flex items-start gap-2 text-xs">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                <span>I&apos;ve had this reviewed / I understand the Reg-FD risk and take responsibility for publishing it.</span>
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={publish} disabled={!canPublish}>{busy ? "Publishing…" : "✓ Approve & publish now"}</Button>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy}>← Edit</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Channel preview mockups ──────────────────────────────────────────────────
// Render the post the way it'll appear on each network: profile chrome + text with
// links highlighted + media + that network's footer icons.

const isVideo = (u: string) => /\.(mp4|mov|webm)$/i.test(u);

// Self-healing media thumbnail. A just-generated image can 404 for a moment while
// it propagates on the storage CDN; instead of showing a broken icon forever, this
// shows a spinner, then retries a few times with cache-busting before giving up.
function MediaThumb({ url, kind }: { url: string; kind: "image" | "video" }) {
  const [tries, setTries] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = tries === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}r=${tries}`;
  const onError = () => {
    if (tries < 4) setTimeout(() => setTries((t) => t + 1), 600 * (tries + 1));
    else setFailed(true);
  };
  const cls = "h-20 w-20 rounded-lg border border-app object-cover bg-surface-2";
  if (failed) return <div className={`${cls} flex items-center justify-center text-center text-[9px] text-faint`}>image still processing — refresh</div>;
  if (kind === "video") return <video src={src} className={cls} muted onError={onError} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={cls} onError={onError} />;
}

// Split text into runs, highlighting URLs and $TICKER / #tag / @handle in link color.
// `inherit` forces plain-text runs to color:inherit via inline style — beating any
// global theme CSS that would otherwise force the app's text color (which made the
// X mockup's text dark-on-black).
function RichText({ text, color = "#1d9bf0", inherit = false }: { text: string; color?: string; inherit?: boolean }) {
  const parts = text.split(/(\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?|[$#@][A-Za-z0-9_]+)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^(https?:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,}|[$#@])/i.test(p) && p.trim()
          ? <span key={i} style={{ color }}>{p}</span>
          : <span key={i} style={inherit ? { color: "inherit" } : undefined}>{p}</span>
      )}
    </span>
  );
}

function Avatar({ account, fallback }: { account?: ConnectedAccount; fallback: string }) {
  if (account?.profilePicture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={account.profilePicture} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{fallback.slice(0, 1).toUpperCase()}</div>;
}

function Media({ urls, rounded = "rounded-xl" }: { urls: string[]; rounded?: string }) {
  if (urls.length === 0) return null;
  const u = urls[0];
  return (
    <div className={`mt-2 overflow-hidden border border-black/10 ${rounded}`}>
      {isVideo(u)
        ? <video src={u} className="max-h-80 w-full object-cover" muted controls />
        /* eslint-disable-next-line @next/next/no-img-element */
        : <img src={u} alt="" className="max-h-80 w-full object-cover" />}
    </div>
  );
}

function ChannelMockup({
  channel, text, mediaUrls, account, companyName,
}: {
  channel: string;
  text: string;
  mediaUrls: string[];
  account?: ConnectedAccount;
  companyName: string;
}) {
  const name = account?.displayName || companyName || "Your Company";
  const handle = account?.username ? `@${account.username}` : "";

  // X (Twitter)
  if (channel === "twitter") {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-black p-4" style={{ color: "#e7e9ea" }}>
        <div className="flex gap-3">
          <Avatar account={account} fallback={name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[15px]">
              <span className="font-bold" style={{ color: "#ffffff" }}>{name}</span>
              <span style={{ color: "#71767b" }}>{handle} · 1m</span>
            </div>
            <div className="mt-0.5 text-[15px] leading-snug" style={{ color: "#e7e9ea" }}><RichText text={text} color="#1d9bf0" inherit /></div>
            <Media urls={mediaUrls} />
            <div className="mt-3 flex max-w-xs justify-between" style={{ color: "#71767b" }}>
              <span>💬</span><span>🔁</span><span>♡</span><span>📊</span><span>🔖</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LinkedIn
  if (channel === "linkedin") {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-4 text-[#1d2226] shadow-sm">
        <div className="flex gap-2">
          <Avatar account={account} fallback={name} />
          <div>
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs text-gray-500">Investor Relations · Now</p>
          </div>
        </div>
        <div className="mt-2 text-sm leading-snug"><RichText text={text} color="#0a66c2" /></div>
        <Media urls={mediaUrls} rounded="rounded-md" />
        <div className="mt-3 flex justify-around border-t border-gray-100 pt-2 text-xs font-medium text-gray-500">
          <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span><span>➤ Send</span>
        </div>
      </div>
    );
  }

  // Instagram
  if (channel === "instagram") {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-gray-200 bg-white text-[#262626]">
        <div className="flex items-center gap-2 p-3">
          <Avatar account={account} fallback={name} />
          <span className="text-sm font-semibold">{account?.username || name}</span>
        </div>
        {mediaUrls.length > 0
          ? <Media urls={mediaUrls} rounded="rounded-none" />
          : <div className="flex aspect-square items-center justify-center bg-gray-100 px-4 text-center text-sm text-gray-400">Instagram needs an image or video</div>}
        <div className="px-3 py-2">
          <div className="flex gap-3 text-lg">♡ 💬 ➤</div>
          <p className="mt-1 text-sm leading-snug"><span className="font-semibold">{account?.username || name} </span><RichText text={text} color="#00376b" /></p>
        </div>
      </div>
    );
  }

  // Facebook
  if (channel === "facebook") {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-4 text-[#050505] shadow-sm">
        <div className="flex gap-2">
          <Avatar account={account} fallback={name} />
          <div>
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs text-gray-500">Just now · 🌐</p>
          </div>
        </div>
        <div className="mt-2 text-sm leading-snug"><RichText text={text} color="#216fdb" /></div>
        <Media urls={mediaUrls} rounded="rounded-md" />
        <div className="mt-3 flex justify-around border-t border-gray-100 pt-2 text-xs font-medium text-gray-500">
          <span>👍 Like</span><span>💬 Comment</span><span>↪ Share</span>
        </div>
      </div>
    );
  }

  // Generic fallback (YouTube/TikTok/Telegram/Reddit/etc.)
  return (
    <div className="mx-auto max-w-md rounded-lg border border-app bg-surface-2 p-4">
      <div className="flex items-center gap-2">
        <Avatar account={account} fallback={name} />
        <span className="text-sm font-semibold text-app">{name} {handle && <span className="font-normal text-muted">{handle}</span>}</span>
      </div>
      <div className="mt-2 text-sm text-app"><RichText text={text} color="#10b981" /></div>
      <Media urls={mediaUrls} />
    </div>
  );
}
