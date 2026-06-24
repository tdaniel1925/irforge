import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { PageHeader } from "@/components/ui";
import SocialMonthCalendar from "@/components/SocialMonthCalendar";

export const dynamic = "force-dynamic";

export default async function SocialCalendarPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  if (!(await companyHasFeature(mine.id, "social"))) redirect("/social");

  const now = new Date();

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Content Calendar"
        subtitle="Your whole posting schedule at a glance. AI-pending and manual posts, color-coded by status — click any day to add a post, or a chip to open it. Earnings and quiet periods are shown for context."
      />
      <SocialMonthCalendar year={now.getFullYear()} month={now.getMonth()} />
    </div>
  );
}
