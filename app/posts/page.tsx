import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listLatestCalendar, listOutbox } from "@/lib/social/calendar";
import { getLinkedAccounts } from "@/lib/ayrshare";
import PostsShell from "@/components/PostsShell";

export const dynamic = "force-dynamic";

// Unified Posts page — one pipeline view (Needs approval / Scheduled / Published)
// merging the old Approvals, Review, Calendar, and Outbox pages. The embedded
// ApprovalsInbox self-fetches its own (iros) data; we fetch the social-calendar
// pipeline data here.
export default async function PostsPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  const canSocial = await companyHasFeature(mine.id, "social");
  const [cal, outbox, linked] = await Promise.all([
    canSocial ? listLatestCalendar().catch(() => ({ slots: [] })) : Promise.resolve({ slots: [] }),
    canSocial ? listOutbox().catch(() => []) : Promise.resolve([]),
    getLinkedAccounts(mine.company.ayrshareProfileKey).catch(() => [] as string[]),
  ]);

  const now = new Date();
  return (
    <PostsShell
      canSocial={canSocial}
      reviewSlots={cal.slots}
      outboxPosts={outbox}
      linkedAccounts={linked}
      year={now.getFullYear()}
      month={now.getMonth()}
    />
  );
}
