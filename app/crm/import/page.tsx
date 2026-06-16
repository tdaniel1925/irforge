import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { PageHeader } from "@/components/ui";
import CrmImportExport from "@/components/CrmImportExport";

export const dynamic = "force-dynamic";

export default async function CrmImportPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  return (
    <div className="max-w-2xl">
      <PageHeader title="Import & Export" subtitle="Bring your contacts in from a spreadsheet, or download them anytime." />
      <CrmImportExport />
    </div>
  );
}
