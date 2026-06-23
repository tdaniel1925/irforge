import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listLatestCalendar } from "@/lib/social/calendar";
import { PageHeader } from "@/components/ui";
import SocialReview from "@/components/SocialReview";

export const dynamic = "force-dynamic";

export default async function SocialReviewPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  if (!(await companyHasFeature(mine.id, "social"))) redirect("/social");

  const { slots } = await listLatestCalendar();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Review & approve"
        subtitle="Every post is checked for compliance before it reaches you. Approve, edit, or reject — in bulk if you like. Nothing publishes without your approval."
      />
      <SocialReview initialSlots={slots} />
    </div>
  );
}
