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

interface ConnectedAccount { platform: string; displayName?: string; username?: string; canPost: boolean }
interface Preview {
  preview: string;
  channels: string[];
  mediaUrls: string[];
  flags: { level?: string; message?: string; severity?: string }[];
  blocked: boolean;
  notConnected: string[];
  regFd: { classification: string; flags: string[]; reasoning: string } | null;
  quietMode: boolean;
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
        body: JSON.stringify({ generate: true, text }),
      });
      const d = await r.json();
      if (r.status === 503) { setAiImageOff(true); return; } // not configured — hide the button, don't alarm
      if (!r.ok) throw new Error(d.error ?? "Couldn't generate an image.");
      setMedia((m) => [...m, { url: d.url, kind: "image" }]);
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
  const canPublish = preview && !preview.blocked && !preview.quietMode && preview.notConnected.length === 0 && (!regRed || ack) && !busy;

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
        <p className="mt-1 text-xs text-faint">{text.length} characters · disclosures are appended automatically on publish.</p>

        {/* media */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={mediaBusy}>{mediaBusy ? "…" : "📎 Add image / video"}</Button>
          {!aiImageOff && (
            <Button variant="ghost" onClick={generateImage} disabled={mediaBusy || !text.trim()} title={!text.trim() ? "Write some text first" : "Generate an on-brand image from your text"}>✨ AI image</Button>
          )}
        </div>
        {media.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {media.map((m) => (
              <div key={m.url} className="relative">
                {m.kind === "video"
                  ? <video src={m.url} className="h-20 w-20 rounded-lg border border-app object-cover" muted />
                  /* eslint-disable-next-line @next/next/no-img-element */
                  : <img src={m.url} alt="" className="h-20 w-20 rounded-lg border border-app object-cover" />}
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
          <h2 className="mb-2 font-semibold text-app">Preview — approve before it goes out</h2>
          <div className="rounded-lg border border-app bg-surface-2 p-3">
            <p className="whitespace-pre-wrap text-sm text-app">{preview.preview}</p>
            {preview.mediaUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {preview.mediaUrls.map((u) => (
                  /\.(mp4|mov|webm)$/i.test(u)
                    ? <video key={u} src={u} className="h-24 w-24 rounded border border-app object-cover" muted />
                    /* eslint-disable-next-line @next/next/no-img-element */
                    : <img key={u} src={u} alt="" className="h-24 w-24 rounded border border-app object-cover" />
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">Going to: {preview.channels.join(", ")}</p>

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
