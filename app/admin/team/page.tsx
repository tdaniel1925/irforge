import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Team management moved to /team (it's company-admin, not platform-super-admin, so it
// must NOT live under the /admin super-admin wall — that wall was bouncing company
// admins back to Home). Keep this path working for old links/bookmarks.
export default function AdminTeamRedirect() {
  redirect("/team");
}
