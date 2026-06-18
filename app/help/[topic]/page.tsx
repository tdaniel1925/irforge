import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, HELP } from "@/lib/helpContent";
import { PageHeader } from "@/components/ui";

export function generateStaticParams() {
  return HELP.map((a) => ({ topic: a.slug }));
}

export async function generateMetadata({ params }: { params: { topic: string } }): Promise<Metadata> {
  const a = getArticle(params.topic);
  return { title: a ? `${a.title} — Help | PubcoZone` : "Help | PubcoZone" };
}

export default function HelpArticlePage({ params }: { params: { topic: string } }) {
  const a = getArticle(params.topic);
  if (!a) notFound();

  const related = (a.related ?? []).map(getArticle).filter(Boolean);

  return (
    <div className="max-w-2xl">
      <Link href="/help" className="text-sm text-muted hover:text-app">← All help topics</Link>
      <PageHeader title={`${a.icon} ${a.title}`} subtitle={a.summary} />

      <div className="space-y-4">
        {a.body.map((p, i) => (
          <p key={i} className="text-[15px] leading-7 text-app">{p}</p>
        ))}
      </div>

      {a.href && (
        <Link href={a.href} className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Open {a.title} →
        </Link>
      )}

      {related.length > 0 && (
        <div className="mt-8 border-t border-app pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Related</p>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r!.slug} href={`/help/${r!.slug}`} className="rounded-lg border border-app px-3 py-1.5 text-sm text-app hover:bg-app-hover">
                {r!.icon} {r!.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
