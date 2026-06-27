import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listPosts, listVoices } from "@/lib/iros";
import { getStrategy } from "@/lib/social/strategy";
import { listLatestCalendar } from "@/lib/social/calendar";
import { AYRSHARE_CHANNELS } from "@/lib/ayrshare";
import ComposeShell from "@/components/ComposeShell";

export const dynamic = "force-dynamic";

// Unified Compose page — one home for Post-now / Schedule / Plan-a-month / Press.
// Fetches every embedded component's data once on the server, then hands it to the
// client shell which switches modes. Feature flags gate the paid modes.
export default async function ComposePage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  const [canPipeline, canSocial, canPublish] = await Promise.all([
    companyHasFeature(mine.id, "calendar"),
    companyHasFeature(mine.id, "social"),
    companyHasFeature(mine.id, "publishing"),
  ]);

  // Best-effort data for each mode (only fetched values that the components need).
  const [posts, voices, strategy, cal] = await Promise.all([
    canPipeline ? listPosts() : Promise.resolve([]),
    listVoices().catch(() => []),
    canSocial ? getStrategy().catch(() => null) : Promise.resolve(null),
    canSocial ? listLatestCalendar().catch(() => ({ slots: [] })) : Promise.resolve({ slots: [] }),
  ]);

  return (
    <ComposeShell
      ticker={mine.company.ticker}
      canPipeline={canPipeline}
      canSocial={canSocial}
      canPublish={canPublish}
      pipelinePosts={posts}
      voices={voices.map((v) => ({ id: v.id, name: v.name, roleTitle: v.roleTitle }))}
      strategy={strategy}
      channels={AYRSHARE_CHANNELS.map((c) => ({ key: c.key, label: c.label }))}
      slots={cal.slots}
    />
  );
}
