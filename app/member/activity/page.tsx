import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyMember, getMyPosts } from "@/lib/members";

export const dynamic = "force-dynamic";

const FLAG_LABEL: Record<string, string> = {
  verified: "✓ Verified", factual: "Factual", opinion: "Opinion", hype: "Hype", fud: "FUD", chatter: "Chatter",
};

export default async function MemberActivity() {
  const me = await getMyMember();
  if (!me) redirect("/login");
  const posts = await getMyPosts(me.id, 100);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-app">Your activity</h1>
      <p className="mt-1 text-sm text-muted">Everything you&apos;ve posted across company boards.</p>

      {posts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-app p-10 text-center">
          <p className="text-sm font-medium text-app">You haven&apos;t posted yet.</p>
          <p className="mt-1 text-sm text-muted">
            Jump into a conversation on any{" "}
            <Link href="/discover" className="text-emerald-600 hover:underline dark:text-emerald-400">trending ticker</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {posts.map((p) => (
            <div key={p.id} className="rounded-xl border border-app bg-surface p-4">
              <div className="mb-1.5 flex items-center gap-2 text-xs">
                <Link href={`/t/${p.ticker}`} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">${p.ticker}</Link>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">{FLAG_LABEL[p.flag] ?? p.flag}</span>
                {p.parentId && <span className="text-faint">reply</span>}
                {p.ts && <span className="ml-auto text-faint">{new Date(p.ts).toLocaleDateString()}</span>}
              </div>
              <p className="text-sm text-app">{p.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
