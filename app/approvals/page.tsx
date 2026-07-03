import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Approvals now live inside the unified Posts page ("Needs approval" tab). Redirect
// the old standalone route so bookmarks land there; the inbox component itself lives
// on, embedded in /posts.
export default function ApprovalsRedirect() {
  redirect("/posts");
}
