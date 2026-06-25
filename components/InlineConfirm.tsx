"use client";

import { useState } from "react";

// Inline "click again to confirm" button — replaces native confirm(). First click
// arms it (shows a confirm/cancel pair); the real action only fires on confirm.
// No popups, fully inline.
export default function InlineConfirm({
  onConfirm,
  label = "Delete",
  confirmLabel = "Confirm",
  className = "",
  title,
}: {
  onConfirm: () => void;
  label?: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => { setArmed(false); onConfirm(); }}
          className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-500/25 dark:text-red-300"
        >
          {confirmLabel}
        </button>
        <button onClick={() => setArmed(false)} className="rounded px-1.5 py-0.5 text-xs text-faint hover:text-app">Cancel</button>
      </span>
    );
  }
  return (
    <button onClick={() => setArmed(true)} className={className} title={title}>
      {label}
    </button>
  );
}
