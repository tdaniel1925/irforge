// ONE canonical vocabulary for a post's status, so every view (Compose, Posts,
// the calendar, admin) shows the same word + color for the same state. Different
// components had drifted — the calendar said "Pending"/"Posted" while others said
// "Draft"/"Published" for the same rows. The state machine lives in lib/iros.ts
// (draft → reviewed → approved → scheduled → published → pulled); this is its
// display layer.

export type PostStatus = "draft" | "reviewed" | "approved" | "scheduled" | "published" | "pulled";

// Record<string, string> (not Record<PostStatus,...>) so callers can index with a
// raw post.status string without a cast; all canonical keys are present.
export const POST_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  pulled: "Pulled",
};

// Tailwind classes for a colored dot (calendar) — one color per state.
export const POST_STATUS_DOT: Record<string, string> = {
  draft: "bg-purple-500",
  reviewed: "bg-blue-400",
  approved: "bg-emerald-500",
  scheduled: "bg-sky-500",
  published: "bg-teal-600",
  pulled: "bg-gray-400",
};

// Full pill classes (badges).
export const POST_STATUS_PILL: Record<string, string> = {
  draft: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  reviewed: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  published: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  pulled: "bg-slate-500/15 text-faint border-slate-500/30",
};

export function postStatusLabel(status: string): string {
  return POST_STATUS_LABEL[status as PostStatus] ?? status;
}
