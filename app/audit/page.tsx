"use client";

import { useAppState } from "@/components/useAppState";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const ACTION_STYLE = (action: string) =>
  action.includes("BLOCKED") || action.includes("REFUSED")
    ? "bg-red-500/15 text-red-300"
    : action === "PUBLISHED"
      ? "bg-emerald-500/15 text-emerald-300"
      : action.includes("APPROVED")
        ? "bg-sky-500/15 text-sky-300"
        : action.includes("QUIET")
          ? "bg-amber-500/15 text-amber-300"
          : "bg-slate-800 text-slate-400";

export default function AuditPage() {
  const { db, error } = useAppState();

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Compliance Record"
        subtitle="A permanent record of every draft, approval, publish, block, and setting change. If a regulator or exchange ever asks, this is the report you hand them."
      />

      {db.audit.length === 0 ? (
        <EmptyState message="No events yet." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="py-2 pr-4 font-medium">Timestamp (UTC)</th>
                <th className="py-2 pr-4 font-medium">Actor</th>
                <th className="py-2 pr-4 font-medium">Action</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {db.audit.map((e) => (
                <tr key={e.id} className="border-b border-slate-900 align-top">
                  <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-slate-500">
                    {e.ts.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-slate-300">{e.actor}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ACTION_STYLE(e.action)}`}>{e.action}</span>
                  </td>
                  <td className="py-2.5 text-slate-400">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}
