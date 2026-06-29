import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import TeamManager from "@/components/TeamManager";

export const dynamic = "force-dynamic";

// Team management — every company admin can manage their OWN team here. This page is
// intentionally NOT under /admin (that tree is platform-super-admin only). Auth is
// enforced server-side by /api/team via RLS (company admins only can invite/manage).
export default async function TeamPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  return (
    <div className="px-4 py-6 sm:px-6">
      <TeamManager />
    </div>
  );
}
