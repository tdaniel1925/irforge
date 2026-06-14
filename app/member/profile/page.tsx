import { redirect } from "next/navigation";
import { getMyMember } from "@/lib/members";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function MemberProfile() {
  const me = await getMyMember();
  if (!me) redirect("/login");
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-app">Your profile</h1>
      <p className="mt-1 text-sm text-muted">This is how you appear on the board and across PubcoZone.</p>
      <ProfileForm initial={me.member} />
    </div>
  );
}
