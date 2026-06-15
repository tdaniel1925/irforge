import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { PageHeader, Card } from "@/components/ui";
import EmbedCenter from "@/components/EmbedCenter";

export const dynamic = "force-dynamic";

export default async function EmbedsPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  const ticker = (mine.company.ticker || "").toUpperCase();

  return (
    <div className="max-w-3xl">
      <PageHeader title="Embeds & Badges" subtitle="Drop live PubcoZone data onto your own website. Copy a snippet, paste it on your IR page — it updates itself." />
      {ticker ? (
        <EmbedCenter ticker={ticker} />
      ) : (
        <Card><p className="text-sm text-muted">Add your ticker in Settings first, then your embed codes will appear here.</p></Card>
      )}
    </div>
  );
}
