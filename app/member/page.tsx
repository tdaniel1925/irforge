import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyMember, getMyWatches, getMyPosts } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function MemberHome() {
  const me = await getMyMember();
  if (!me) redirect("/login");
  const [watches, posts] = await Promise.all([getMyWatches(me.id), getMyPosts(me.id, 5)]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        {me.member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.member.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-xl font-bold text-emerald-600 dark:text-emerald-300">
            {(me.member.displayName || me.member.handle || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-app">{me.member.displayName || me.member.handle}</h1>
          <p className="text-sm text-muted">@{me.member.handle} · {me.member.plan === "member_plus" ? "Investor+" : "Free member"}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card label="Watching" value={watches.length} href="/member/watchlist" />
        <Card label="Recent posts" value={posts.length >= 5 ? "5+" : posts.length} href="/member/activity" />
        <Card label="Plan" value={me.member.plan === "member_plus" ? "Investor+" : "Free"} href="/member/billing" />
      </div>

      <Section title="Your watchlist" href="/member/watchlist" cta="Manage">
        {watches.length === 0 ? (
          <Empty text="You're not watching any tickers yet." linkText="Find one to watch →" href="/discover" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {watches.slice(0, 12).map((w) => (
              <Link key={w.ticker} href={`/t/${w.ticker}`} className="rounded-lg border border-app bg-surface px-3 py-1.5 text-sm font-semibold text-emerald-600 transition hover:bg-app-hover dark:text-emerald-400">
                ${w.ticker}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent activity" href="/member/activity" cta="See all">
        {posts.length === 0 ? (
          <Empty text="No posts yet." linkText="Join a conversation →" href="/discover" />
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="rounded-lg border border-app bg-surface p-3 text-sm">
                <Link href={`/t/${p.ticker}`} className="font-semibold text-emerald-600 dark:text-emerald-400">${p.ticker}</Link>
                <span className="ml-2 text-muted">{p.body.slice(0, 120)}{p.body.length > 120 ? "…" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Card({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-app bg-surface p-4 transition hover:border-emerald-500/40">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-2xl font-bold text-app">{value}</p>
    </Link>
  );
}

function Section({ title, href, cta, children }: { title: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold text-app">{title}</h2>
        <Link href={href} className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">{cta}</Link>
      </div>
      {children}
    </div>
  );
}

function Empty({ text, linkText, href }: { text: string; linkText: string; href: string }) {
  return (
    <div className="rounded-lg border border-dashed border-app p-6 text-center text-sm text-muted">
      {text}{" "}
      <Link href={href} className="text-emerald-600 hover:underline dark:text-emerald-400">{linkText}</Link>
    </div>
  );
}
