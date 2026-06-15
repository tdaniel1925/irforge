import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listStakeholders, listInteractions } from "@/lib/iros";
import { PageHeader, Card } from "@/components/ui";
import StakeholderHub from "@/components/StakeholderHub";

export const dynamic = "force-dynamic";

export default async function StakeholdersPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "stakeholders"))) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Stakeholders" subtitle="Everyone who matters — investors, analysts, press — in one place." />
        <Card><p className="text-sm text-muted">This feature isn&apos;t enabled for your account yet. Contact your PubcoZone admin to turn on the Stakeholder Graph.</p></Card>
      </div>
    );
  }

  const [stakeholders, interactions] = await Promise.all([listStakeholders(), listInteractions()]);
  return (
    <div>
      <PageHeader title="Stakeholders & Inbound" subtitle="Your relationship graph + an AI triage box: paste any inbound message and it suggests who it's from, a category, and a safe reply." />
      <StakeholderHub initialStakeholders={stakeholders} initialInteractions={interactions} />
    </div>
  );
}
