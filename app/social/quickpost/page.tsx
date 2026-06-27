// Quick Post lives in the unified Compose page now; this route stays as a thin
// wrapper for back-compat (bookmarks, the old nav link) and renders the composer.
import QuickPostComposer from "@/components/QuickPostComposer";

export default function QuickPostPage() {
  return <QuickPostComposer />;
}
