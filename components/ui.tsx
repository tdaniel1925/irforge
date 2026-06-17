"use client";

import type { ComplianceFlag, DraftStatus } from "@/lib/types";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-app bg-surface p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-app">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<DraftStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  approved: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  posted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rejected: "bg-slate-500/15 text-faint border-slate-500/30",
  blocked: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

export function StatusPill({ status }: { status: DraftStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
}) {
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500 font-semibold",
    secondary: "bg-surface-2 text-app hover:bg-app-hover border border-app",
    danger: "bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 border border-red-500/30",
    ghost: "text-muted hover:bg-app-hover hover:text-app",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-3.5 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function FlagList({ flags }: { flags: ComplianceFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {flags.map((f, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
            f.severity === "block"
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          <span className="font-semibold">{f.severity === "block" ? "BLOCKED" : "WARNING"}</span>
          <span>{f.rule}:</span>
          <span className="italic">&ldquo;{f.excerpt}&rdquo;</span>
        </div>
      ))}
    </div>
  );
}

export function Thread({ tweets, handle }: { tweets: string[]; handle: string }) {
  const isThread = tweets.length > 1;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-app bg-surface-2/50">
      <div className="flex items-center justify-between border-b border-app px-4 py-2">
        <span className="text-xs font-medium text-muted">{handle || "Your X account"}</span>
        <span className="rounded-full bg-app-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
          {isThread ? `1 X thread · ${tweets.length} parts` : "1 post"}
        </span>
      </div>
      <div className="space-y-0 px-4 py-3">
        {tweets.map((t, i) => (
          <div key={i} className="relative pl-6">
            {/* connector rail so the parts read as ONE thread, not separate posts */}
            <span className="absolute left-2 top-1 text-[11px] font-semibold text-faint">{isThread ? i + 1 : ""}</span>
            {isThread && i < tweets.length - 1 && (
              <span className="absolute left-[11px] top-5 bottom-0 w-px bg-app" aria-hidden />
            )}
            <p className={`whitespace-pre-wrap text-sm leading-relaxed text-app ${i < tweets.length - 1 ? "pb-4" : ""}`}>{t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-app p-10 text-center text-sm text-faint">
      <p>{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center gap-3 p-10 text-sm text-faint">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      Loading PubcoZone…
    </div>
  );
}

export function Banner({
  message,
  tone = "error",
  onDismiss,
}: {
  message: string;
  tone?: "error" | "success" | "info";
  onDismiss?: () => void;
}) {
  const styles = {
    error: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  }[tone];
  const icon = { error: "✕", success: "✓", info: "ℹ" }[tone];
  return (
    <div className={`mb-4 flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm ${styles}`}>
      <span>
        <span className="mr-2 font-semibold">{icon}</span>
        {message}
      </span>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-4 opacity-70 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}

// Back-compat alias used by error paths.
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <Banner message={message} tone="error" onDismiss={onDismiss} />;
}

export type Notice = { text: string; tone: "error" | "success" | "info" } | null;

export function timeAgo(isoTs: string): string {
  const s = Math.max(0, (Date.now() - new Date(isoTs).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
