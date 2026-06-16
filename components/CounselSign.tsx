"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// One-to-two-click counsel decision UI for a RED post. "Sign & approve" is the
// happy path; "Send back" / "Reject" need a quick reason.
export default function CounselSign({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "changes" | "reject">("idle");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async (decision: "approved" | "rejected" | "changes") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/iros/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, stage: "counsel", decision, comment }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setDone(decision === "approved" ? "Signed & approved ✓" : decision === "rejected" ? "Rejected" : "Sent back");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  };

  if (done) return <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">{done}</p>;

  if (mode !== "idle") {
    return (
      <div className="mt-3 space-y-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          autoFocus
          rows={2}
          placeholder={mode === "changes" ? "What needs to change?" : "Reason for rejection…"}
          className="w-full resize-none rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button onClick={() => submit(mode === "changes" ? "changes" : "rejected")} disabled={busy || !comment.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50">
            {busy ? "…" : mode === "changes" ? "Send back for changes" : "Reject"}
          </button>
          <button onClick={() => { setMode("idle"); setComment(""); }} className="rounded-lg border border-app px-4 py-2 text-sm text-app hover:bg-app-hover">Cancel</button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => submit("approved")} disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "Signing…" : "✓ Sign & approve"}
        </button>
        <button onClick={() => setMode("changes")} className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover">Send back</button>
        <button onClick={() => setMode("reject")} className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover">Reject</button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
