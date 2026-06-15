import Link from "next/link";
import { Card } from "./ui";

// Shown when a company lands on a feature they don't have enabled. NOT hidden —
// we want them to see what they're missing and how to get it.
export default function UpgradePrompt({
  icon,
  title,
  pitch,
  bullets,
}: {
  icon: string;
  title: string;
  pitch: string;
  bullets: string[];
}) {
  return (
    <Card className="mx-auto max-w-xl border-emerald-500/30 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">{icon}</div>
      <span className="inline-block rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        🔒 Not on your plan yet
      </span>
      <h2 className="mt-3 text-xl font-bold text-app">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{pitch}</p>

      <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-app">
            <span className="mt-0.5 text-emerald-500">✓</span> {b}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/billing" className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
          See plans &amp; upgrade →
        </Link>
        <a href="mailto:hello@pubcozone.com?subject=Enable%20a%20feature" className="rounded-lg border border-app px-5 py-2.5 text-sm font-medium text-app transition hover:bg-app-hover">
          Talk to us
        </a>
      </div>
      <p className="mt-4 text-xs text-faint">Already paying? Ask your PubcoZone admin to switch it on — it&apos;s a one-click toggle on their end.</p>
    </Card>
  );
}
