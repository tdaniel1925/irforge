import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listVoices } from "@/lib/iros";
import { PageHeader, Card } from "@/components/ui";
import VoiceManager from "@/components/VoiceManager";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  if (!(await companyHasFeature(mine.id, "voices"))) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Executive Voices" subtitle="Teach the AI how each of your leaders sounds." />
        <Card><p className="text-sm text-muted">This feature isn&apos;t enabled for your account yet. Contact your PubcoZone admin to turn on Voice Profiles.</p></Card>
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
