import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { PageHeader, Card } from "@/components/ui";
import MarketingKit from "@/components/MarketingKit";

export const dynamic = "force-dynamic";

export default async function MarketingKitPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");
  const ticker = (mine.company.ticker || "").toUpperCase();

  return (
    <div className="max-w-3xl">
      <PageHeader title="Marketing Kit" subtitle="Ready-made posts, graphics, and links to point investors to your page — copy, post, or download." />
      {ticker ? (
        <MarketingKit />
      ) : (
        <Card><p className="text-sm text-muted">Add your ticker in Settings first, then your marketing kit will appear here.</p></Card>
      )}
    </div>
  );
}
