"use client";

import { useRouter } from "next/navigation";

// A "← Back" button that returns to the PREVIOUS page (browser history), not a
// fixed home link. Falls back to `fallback` (e.g. the section's dashboard) when
// there's no in-app history to go back to (deep link / fresh tab).
export default function BackButton({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();

  const goBack = () => {
    // history.length > 1 means we navigated here from another page in this tab.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };

  return (
    <button
      onClick={goBack}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-app-hover hover:text-app"
      aria-label="Go back to the previous page"
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}
