import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listPosts, listVoices } from "@/lib/iros";
import { PageHeader, Card } from "@/components/ui";
import EditorialBoard from "@/components/EditorialBoard";

export const dynamic = "force-dynamic";

export default async function CalendarOsPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "calendar"))) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Content Pipeline" subtitle="Draft, classify, approve, schedule — in one place." />
        <Card><p className="text-sm text-muted">This feature isn&apos;t enabled for your account yet. Contact your PubcoZone admin to turn on the Editorial Calendar.</p></Card>
      </div>
    );
  }

  const [posts, voices] = await Promise.all([listPosts(), listVoices()]);
  return (
    <div>
      <PageHeader title="Content Pipeline" subtitle="Write a post (or let AI draft it), check it for Reg FD risk, and move it to approved — all in a couple of clicks." />
      <EditorialBoard initialPosts={posts} voices={voices.map((v) => ({ id: v.id, name: v.name, roleTitle: v.roleTitle }))} />
    </div>
  );
}
