import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { listMyCalendars } from "@/lib/calendars";
import { listTeam } from "@/lib/team";
import { PageHeader } from "@/components/ui";
import TeamCalendars from "@/components/TeamCalendars";

export const dynamic = "force-dynamic";

export default async function CalendarsPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  const calendars = await listMyCalendars();
  const { isAdmin } = await listTeam();

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Team Calendars"
        subtitle="IR, Tech, General, and personal calendars in one view. Admins choose who sees which calendar; anyone can add events to a calendar they can see."
      />
      <TeamCalendars initialCalendars={calendars} isAdmin={isAdmin} />
    </div>
  );
}
