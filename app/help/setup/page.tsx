import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "How setup works | PubcoZone" };

export default function HelpSetupPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="How setup works"
        subtitle="Getting your company live takes about 10 minutes. Here's exactly what happens and who does what."
      />

      {/* Quick links */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/setup" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Open my setup checklist →</Link>
        <Link href="/onboarding" className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover">Run the setup wizard</Link>
      </div>

      <Step n="1" title="Create the company (or accept your invite)">
        <p>Two ways a company gets started:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Sign up</strong> at the login page as a <em>company</em> account — this creates your company and makes you its first <strong>admin</strong>.</li>
          <li><strong>Accept a free-access invite</strong> — if PubcoZone comped your company, click the link in your email, sign up with that email, and you&apos;re linked to your account as admin.</li>
        </ul>
      </Step>

      <Step n="2" title="Run the setup wizard (5 quick steps)">
        <p>The wizard at <Code>/onboarding</Code> walks you through:</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li><strong>Ticker</strong> — type your symbol; we pull your profile from SEC EDGAR automatically.</li>
          <li><strong>Confirm</strong> — check the auto-filled name, sector, description, and peer tickers. (Not on EDGAR? Just type your details — OTC and non-US are fine.)</li>
          <li><strong>Approver</strong> — who signs off on posts (CFO / IR). <em>Nothing publishes without their tap.</em></li>
          <li><strong>Compliance</strong> — your disclosure + forward-looking-statements language, attached to every post automatically.</li>
          <li><strong>Plan</strong> — pick a plan. No card needed to start.</li>
        </ol>
        <p className="text-muted">When you finish, we pull your real filings and AI-draft your first posts so your <Link href="/app" className="text-emerald-600 hover:underline dark:text-emerald-400">Home inbox</Link> isn&apos;t empty — review and approve when ready.</p>
      </Step>

      <Step n="3" title="Finish company setup (admins)">
        <p>The <Link href="/setup" className="text-emerald-600 hover:underline dark:text-emerald-400">Get started checklist</Link> shows what&apos;s left. Admins handle the company-wide pieces, mostly from <strong>Settings</strong> (top-right ⚙ menu):</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Connect social accounts</strong> — Settings → &ldquo;Your social accounts&rdquo; → Connect. Links <em>your</em> X / LinkedIn / etc. so approved posts publish to them.</li>
          <li><strong>Add peer tickers</strong> — powers Fund Finder and peer comparisons.</li>
          <li><strong>Disclosures &amp; quiet mode</strong> — fine-tune your compliance language; flip quiet mode on around earnings/financings to pause all publishing.</li>
          <li><strong>Billing</strong> — manage your plan anytime.</li>
        </ul>
      </Step>

      <Step n="4" title="Invite your team">
        <p>From <Link href="/admin/team" className="text-emerald-600 hover:underline dark:text-emerald-400">Team</Link>, invite teammates by email as:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Admin</strong> — can configure the company and manage users.</li>
          <li><strong>Member</strong> — uses the shared company dashboard, plus their own CRM ownership and a private workspace.</li>
        </ul>
        <p className="text-muted">Everyone on the team shares the same company data; each person also gets a private workspace only they can see.</p>
      </Step>

      <Step n="5" title="Everyone's own quick setup">
        <p>Each person (admins and members) finishes a short personal checklist on <Link href="/setup" className="text-emerald-600 hover:underline dark:text-emerald-400">Get started</Link>: approve a first post, set up their workspace, and skim the 2-minute IR primer in <Link href="/learn" className="text-emerald-600 hover:underline dark:text-emerald-400">Public Company 101</Link>.</p>
      </Step>

      <div className="mt-8 rounded-xl border border-app bg-surface-2/50 p-4 text-sm text-muted">
        <p className="font-medium text-app">The golden rule</p>
        <p className="mt-1">Nothing ever posts without a named human&apos;s approval, and your disclosures attach automatically. You stay in control — you and your counsel decide what&apos;s safe; we publish what you approve.</p>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-2xl border border-app bg-surface p-5">
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{n}</span>
        <h2 className="font-semibold text-app">{title}</h2>
      </div>
      <div className="space-y-2 pl-10 text-sm leading-relaxed text-app">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-app-hover px-1.5 py-0.5 text-xs text-muted">{children}</code>;
}
