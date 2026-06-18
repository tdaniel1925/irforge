import type { Metadata } from "next";
import Link from "next/link";
import { HELP } from "@/lib/helpContent";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Help Center | PubcoZone" };

export default function HelpHub() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Help Center" subtitle="Plain-English guides to every part of PubcoZone. Click any topic." />

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/help/setup" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">How setup works →</Link>
        <Link href="/learn" className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover">Public Company 101 (IR primer)</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {HELP.map((a) => (
          <Link key={a.slug} href={`/help/${a.slug}`} className="rounded-2xl border border-app bg-surface p-5 transition hover:border-emerald-500/40 hover:bg-app-hover">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-xl">{a.icon}</span>
              <div className="min-w-0">
                <h2 className="font-semibold text-app">{a.title}</h2>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{a.forWho}</span>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{a.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
