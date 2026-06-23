import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listOutbox } from "@/lib/social/calendar";
import { getLinkedAccounts } from "@/lib/ayrshare";
import { PageHeader } from "@/components/ui";
import SocialOutbox from "@/components/SocialOutbox";

export const dynamic = "force-dynamic";

export default async function SocialOutboxPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  if (!(await companyHasFeature(mine.id, "social"))) redirect("/social");

  const posts = await listOutbox();
  // Which networks the company has actually linked — so the dashboard can warn if
  // a post is queued to a channel that isn't connected.
  let linked: string[] = [];
  try { linked = await getLinkedAccounts(mine.company.ayrshareProfileKey); } catch { /* none */ }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Posting dashboard"
        subtitle="Every approved post: when it goes out, to which channel, and confirmation it posted. Approved posts are scheduled with your social accounts."
      />
      <SocialOutbox initialPosts={posts} linkedAccounts={linked} />
    </div>
  );
}
