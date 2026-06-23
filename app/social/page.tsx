import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { getStrategy } from "@/lib/social/strategy";
import { listLatestCalendar } from "@/lib/social/calendar";
import { AYRSHARE_CHANNELS } from "@/lib/ayrshare";
import { PageHeader } from "@/components/ui";
import UpgradePrompt from "@/components/UpgradePrompt";
import SocialEngine from "@/components/SocialEngine";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "social"))) {
    return (
      <div>
        <PageHeader title="AI Content Engine" subtitle="A month of compliant social posts, built from your filings — review and approve in bulk." />
        <UpgradePrompt
          icon="✨"
          title="AI Social Content Engine"
          pitch="Answer a short interview once. The AI builds a full social calendar from your public record, drafts compliant posts for every platform you choose, and lets you review and approve them in bulk — then schedules them out to your channels."
          bullets={[
            "Guided interview captures your goals, voice, and audience",
            "AI plans a full calendar from your filings + company data",
            "Per-platform compliant drafts (X, LinkedIn, and more) with images",
            "Bulk review, edit, approve — nothing posts without you",
            "Scheduled publishing to your connected channels",
          ]}
        />
      </div>
    );
  }

  const strategy = await getStrategy();
  const channels = AYRSHARE_CHANNELS.map((c) => ({ key: c.key, label: c.label }));
  const { slots } = await listLatestCalendar();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="AI Content Engine"
        subtitle="Build a month of compliant social posts from your public record. Review and approve in bulk before anything goes out."
      />
      <SocialEngine initialStrategy={strategy} channels={channels} initialSlots={slots} />
    </div>
  );
}
