import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listVoices } from "@/lib/iros";
import { PageHeader } from "@/components/ui";
import VoiceManager from "@/components/VoiceManager";
import UpgradePrompt from "@/components/UpgradePrompt";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "voices"))) {
    return (
      <div>
        <PageHeader title="Executive Voices" subtitle="Teach the AI how each of your leaders sounds." />
        <UpgradePrompt
          icon="🎙️"
          title="Executive Voice Profiles"
          pitch="Set up each leader once — then every AI-drafted post sounds like them, and gets voice-checked before it goes out."
          bullets={[
            "Per-executive voice: tone, style examples, banned words",
            "AI drafts in the chosen voice in one click",
            "Automatic voice-check flags anything off-brand",
            "Works across the whole content pipeline",
          ]}
        />
      </div>
    );
  }

  const voices = await listVoices();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Executive Voices" subtitle="Add each leader once. Every AI-written post can then sound like them — and gets voice-checked before it goes out." />
      <VoiceManager initial={voices} />
    </div>
  );
}
