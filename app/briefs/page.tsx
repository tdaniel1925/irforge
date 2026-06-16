import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { listMyBriefs } from "@/lib/briefs";
import { PageHeader, Card } from "@/components/ui";
import BriefManager from "@/components/BriefManager";

export const dynamic = "force-dynamic";

export default async function BriefsPage({ searchParams }: { searchParams: { purchase?: string } }) {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  const briefs = await listMyBriefs();
  const hasTicker = Boolean((mine.company.ticker || "").trim());

  return (
    <div className="max-w-3xl">
      <PageHeader title="Sponsored Research Brief" subtitle="A thorough, factual profile of your company — prepared by AI from your public filings, clearly disclosed as company-sponsored, ready to publish to your feed." />
      {searchParams.purchase === "success" && (
        <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          🎉 Payment received — your brief is being generated. It&apos;ll appear below in a moment (refresh if needed).
        </p>
      )}
      {searchParams.purchase === "cancel" && (
        <p className="mb-4 rounded-lg border border-app bg-surface-2 px-4 py-3 text-sm text-muted">Checkout canceled — no charge was made.</p>
      )}
      {!hasTicker ? (
        <Card><p className="text-sm text-muted">Add your ticker in Settings first, then you can order a research brief.</p></Card>
      ) : (
        <BriefManager initial={briefs} />
      )}
    </div>
  );
}
