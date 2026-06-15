import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listStakeholders, listInteractions } from "@/lib/iros";
import { PageHeader } from "@/components/ui";
import UpgradePrompt from "@/components/UpgradePrompt";
import StakeholderHub from "@/components/StakeholderHub";

export const dynamic = "force-dynamic";

export default async function StakeholdersPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "stakeholders"))) {
    return (
      <div>
        <PageHeader title="Stakeholders" subtitle="Everyone who matters — investors, analysts, press — in one place." />
        <UpgradePrompt
          icon="🤝"
          title="Stakeholder Graph & Inbound Triage"
          pitch="Keep every investor, analyst, and reporter in one searchable place — and let AI triage your inbound."
          bullets={[
            "Searchable CRM of everyone who follows your story",
            "Paste any inbound DM/email → AI suggests who & how to reply",
            "Reg FD-safe suggested replies, every time",
            "Track topics, last touch, and open items",
          ]}
        />
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
