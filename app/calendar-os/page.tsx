import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listPosts, listVoices } from "@/lib/iros";
import { PageHeader } from "@/components/ui";
import UpgradePrompt from "@/components/UpgradePrompt";
import EditorialBoard from "@/components/EditorialBoard";

export const dynamic = "force-dynamic";

export default async function CalendarOsPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "calendar"))) {
    return (
      <div>
        <PageHeader title="Content Pipeline" subtitle="Draft, classify, approve, schedule — in one place." />
        <UpgradePrompt
          icon="🧩"
          title="Content Pipeline"
          pitch="One board to take any post from idea to published — with the Reg FD check and approvals built in."
          bullets={[
            "Type a topic, AI drafts it (in an executive's voice)",
            "1-click Reg FD check routes risky posts to counsel",
            "Approve, schedule, and publish to every channel",
            "See everything by stage: draft → review → approved → live",
          ]}
        />
      </div>
    );
  }

  const [posts, voices, canPublish] = await Promise.all([listPosts(), listVoices(), companyHasFeature(mine.id, "publishing")]);
  return (
    <div>
      <PageHeader title="Content Pipeline" subtitle="Write a post (or let AI draft it), check it for Reg FD risk, and move it to approved — all in a couple of clicks." />
      <EditorialBoard initialPosts={posts} voices={voices.map((v) => ({ id: v.id, name: v.name, roleTitle: v.roleTitle }))} canPublish={canPublish} />
    </div>
  );
}
