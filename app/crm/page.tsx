import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { listContacts, listCompanies, listDeals, listTasks, crmMetrics } from "@/lib/crm";
import { PageHeader } from "@/components/ui";
import CrmWorkspace from "@/components/CrmWorkspace";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  const [contacts, companies, deals, tasks, metrics] = await Promise.all([
    listContacts(), listCompanies(), listDeals(), listTasks(), crmMetrics(),
  ]);

  return (
    <div>
      <PageHeader title="CRM" subtitle="Every contact, company, deal, and task in one place." />
      <CrmWorkspace
        initialContacts={contacts}
        initialCompanies={companies}
        initialDeals={deals}
        initialTasks={tasks}
        metrics={metrics}
      />
    </div>
  );
}
