import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { getMetrics } from "@/lib/iros";
import { PageHeader, Card } from "@/components/ui";
import SummaryButton from "@/components/SummaryButton";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "intelligence"))) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Intelligence" subtitle="Your IR program at a glance + a weekly summary." />
        <Card><p className="text-sm text-muted">This feature isn&apos;t enabled for your account yet. Contact your PubcoZone admin to turn on Intelligence.</p></Card>
      </div>
    );
  }

  const m = await getMetrics();
  const pipeline = ["draft", "reviewed", "approved", "scheduled", "published"];

  return (
    <div>
      <PageHeader title="Intelligence" subtitle="How your IR program is running this week — and a one-click summary for your board or execs." />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Published (7d)" value={m.publishedLast7} />
        <Stat label="Inbound (7d)" value={m.inboundLast7} sub={`${m.inboundOpen} open`} />
        <Stat label="Stakeholders" value={m.stakeholders} />
        <Stat label="Quiet period" value={m.quietActive ? "ON" : "Off"} accent={m.quietActive} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-app">Content pipeline</h2>
          <div className="space-y-2">
            {pipeline.map((s) => (
              <div key={s} className="flex items-center gap-3">
                <span className="w-20 text-xs capitalize text-muted">{s}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (m.postsByStatus[s] ?? 0) * 12)}%` }} />
                </div>
                <span className="w-6 text-right text-xs font-medium text-app">{m.postsByStatus[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-app">Reg FD mix</h2>
          <div className="flex items-center gap-4">
            <Pill label="Green" n={m.classByLevel.green} cls="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" />
            <Pill label="Yellow" n={m.classByLevel.yellow} cls="bg-amber-500/15 text-amber-600 dark:text-amber-300" />
            <Pill label="Red" n={m.classByLevel.red} cls="bg-red-500/15 text-red-600 dark:text-red-300" />
          </div>
          <p className="mt-3 text-xs text-faint">RED posts were routed to your Counsel Console for sign-off.</p>
        </Card>
      </div>

      <div className="mt-6">
        <SummaryButton />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-amber-500/40" : ""}>
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-app">{value}</p>
      {sub && <p className="text-xs text-faint">{sub}</p>}
    </Card>
  );
}

function Pill({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <div className="text-center">
      <p className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold ${cls}`}>{n}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
