import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listPosts, isQuietPeriodActive } from "@/lib/iros";
import { PageHeader, Card } from "@/components/ui";
import CounselSign from "@/components/CounselSign";
import QuietPeriodToggle from "@/components/QuietPeriodToggle";

export const dynamic = "force-dynamic";

export default async function CounselConsole() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  const enabled = await companyHasFeature(mine.id, "compliance");
  if (!enabled) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Counsel Console" subtitle="Reg FD sign-off for sensitive posts." />
        <Card><p className="text-sm text-muted">This feature isn&apos;t enabled for your account yet. Contact your PubcoZone admin to turn on the Compliance suite.</p></Card>
      </div>
    );
  }

  const [posts, quietActive] = await Promise.all([listPosts(), isQuietPeriodActive()]);
  // Counsel sees RED posts that are awaiting sign-off (not yet approved/published/pulled).
  const redQueue = posts.filter((p) => p.classification === "red" && ["draft", "reviewed"].includes(p.status));

  return (
    <div className="max-w-3xl">
      <PageHeader title="Counsel Console" subtitle="Posts flagged RED by the Reg FD classifier. Sign to approve, or send back. Nothing publishes without you." />

      <div className="mb-6">
        <QuietPeriodToggle initialActive={quietActive} />
      </div>

      {redQueue.length === 0 ? (
        <Card>
          <p className="text-sm font-medium text-app">✅ Nothing waiting.</p>
          <p className="mt-1 text-sm text-muted">No RED-flagged posts need counsel review right now.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {redQueue.map((p) => (
            <Card key={p.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-300">🚨 RED</span>
                {p.classConfidence != null && <span className="text-xs text-faint">{Math.round(p.classConfidence * 100)}% confidence</span>}
                <span className="ml-auto text-xs text-faint">{p.createdAt.slice(0, 10)}</span>
              </div>
              {p.title && <p className="font-semibold text-app">{p.title}</p>}
              <p className="mt-1 whitespace-pre-wrap text-sm text-app">{p.body}</p>

              {p.classFlags.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
                  <p className="mb-1 text-xs font-semibold text-red-600 dark:text-red-300">Why it was flagged</p>
                  <ul className="space-y-0.5 text-xs text-muted">
                    {p.classFlags.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
                  {p.classReason && <p className="mt-1.5 text-xs italic text-faint">{p.classReason}</p>}
                </div>
              )}

              <CounselSign postId={p.id} />
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-faint">
        This tool flags and routes — it is not legal advice. Counsel makes the disclosure decision. Signing captures a
        tamper-evident record (hash + IP + device) for your audit trail.
      </p>
    </div>
  );
}
