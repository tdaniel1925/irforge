"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Member } from "@/lib/members";

export default function ProfileForm({ initial }: { initial: Member }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [handle, setHandle] = useState(initial.handle);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = async (file: File) => {
    setUploading(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // bust cache so the new image shows immediately
      setAvatarUrl(`${data.publicUrl}?t=${user.id.slice(0, 6)}${file.size}`);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Upload failed.", ok: false });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, handle, bio, avatarUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      // Re-sync every field from the server's normalized values (it trims/slices
      // displayName & bio and may keep the old handle if the new one was invalid),
      // so the form shows exactly what was persisted — not the untrimmed input.
      setDisplayName(data.member.displayName ?? "");
      setHandle(data.member.handle ?? "");
      setBio(data.member.bio ?? "");
      setAvatarUrl(data.member.avatarUrl ?? "");
      setMsg({ text: "Saved.", ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-5 rounded-2xl border border-app bg-surface p-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-2xl font-bold text-emerald-600 dark:text-emerald-300">
            {(displayName || handle || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-app px-3 py-2 text-sm font-medium text-app transition hover:bg-app-hover disabled:opacity-50"
          >
            {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
          </button>
          <p className="mt-1 text-[11px] text-faint">JPG or PNG, square works best.</p>
        </div>
      </div>

      <Field label="Display name">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60}
          className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
      </Field>

      <Field label="Username (handle)" hint="3–20 chars, letters/numbers/underscore. This is your @ on the board — required to post questions or comments.">
        <div className="flex items-center rounded-lg border border-app bg-surface-2 focus-within:border-emerald-500">
          <span className="pl-3 text-faint">@</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} maxLength={20}
            placeholder="yourname"
            className="w-full bg-transparent px-2 py-2.5 text-sm text-app focus:outline-none" />
        </div>
      </Field>

      <Field label="Bio" hint={`${bio.length}/280`}>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3}
          className="w-full resize-none rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
      </Field>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{msg.text}</p>}
      {handle.replace(/[^a-z0-9_]/g, "").length < 3 && (
        <p className="text-xs text-amber-600 dark:text-amber-300">Pick a username of at least 3 characters to post on discussion boards.</p>
      )}

      <button onClick={save} disabled={busy || handle.replace(/[^a-z0-9_]/g, "").length < 3} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-sm font-medium text-app">{label}</label>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
