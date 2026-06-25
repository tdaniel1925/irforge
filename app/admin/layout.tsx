import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

// Server-side gate for the ENTIRE /admin/* tree. Non-super-admins (including
// company users like AMFN) are redirected away before any admin page renders —
// so admin UI never shows up by typing the URL directly, even though the nav
// links are already hidden for them. API routes also each check isSuperAdmin(),
// so this is defense-in-depth on top of the data-layer guard.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSuperAdmin())) {
    redirect("/app");
  }
  return <>{children}</>;
}
