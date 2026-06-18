import { redirect } from "next/navigation";
import Link from "next/link";
import { getSetupStatus, type SetupItem } from "@/lib/setup";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const status = await getSetupStatus();
  if (!status) redirect("/login");

  // Admins must finish company-wide setup too; members only own their personal checklist
  // (company setup is handled by their admins and isn't shown to them).
  const companyDone = !status.isAdmin || status.companyDone === status.companyTotal;
  const allDone = companyDone && status.personalDone === status.personalTotal;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Get started"
        subtitle={status.isAdmin
          ? "Everything to get your company live — and what each teammate sets up for themselves."
          : "A quick checklist to get going. Company-wide settings are handled by your admins."}
      />

      {allDone && (
        <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          🎉 You&apos;re all set up. This page stays as a quick health view — come back anytime.
        </div>
      )}

      {/* Company setup — admins only */}
      {status.isAdmin && (
        <Section
          title="Company setup"
          tag="Admins"
          done={status.companyDone}
          total={status.companyTotal}
          items={status.company}
        />
      )}

      {/* Personal setup — everyone */}
      <Section
        title="Your setup"
        tag="Everyone"
        done={status.personalDone}
        total={status.personalTotal}
        items={status.personal}
      />

      {!status.isAdmin && (
        <p className="mt-4 text-xs text-faint">
          Company profile, social accounts, disclosures, and billing are set by your company&apos;s admins.
        </p>
      )}
    </div>
  );
}

function Section({ title, tag, done, total, items }: { title: string; tag: string; done: number; total: number; items: SetupItem[] }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  return (
    <div className="mb-6 rounded-2xl border border-app bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-app">{title}</h2>
          <span className="rounded-full bg-app-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{tag}</span>
        </div>
        <span className="text-xs font-medium text-muted">{done} of {total}</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1.5">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
              it.done ? "border-app bg-surface-2/40" : "border-app hover:border-emerald-500/40 hover:bg-app-hover"
            }`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
              it.done ? "bg-emerald-600 text-white" : "border border-app text-faint"
            }`}>{it.done ? "✓" : ""}</span>
            <span className="min-w-0 flex-1">
              <span className={`text-sm font-medium ${it.done ? "text-muted line-through decoration-faint" : "text-app"}`}>{it.label}</span>
              <span className="block text-xs text-faint">{it.hint}</span>
            </span>
            {!it.done && <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">Set up →</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
