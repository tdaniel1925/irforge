import { redirect } from "next/navigation";
import { getMyMember } from "@/lib/members";
import { MEMBER_PLANS } from "@/lib/billing";
import MemberBillingActions from "@/components/MemberBillingActions";

export const dynamic = "force-dynamic";

export default async function MemberBilling() {
  const me = await getMyMember();
  if (!me) redirect("/login");
  const current = me.member.plan;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-app">Membership</h1>
      <p className="mt-1 text-sm text-muted">
        You&apos;re on the{" "}
        <span className="font-semibold text-app">{MEMBER_PLANS[current]?.name ?? "Free"}</span> plan
        {me.member.subscriptionStatus !== "none" && me.member.subscriptionStatus !== "active" ? ` (${me.member.subscriptionStatus})` : ""}.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {(Object.keys(MEMBER_PLANS) as (keyof typeof MEMBER_PLANS)[]).map((key) => {
          const plan = MEMBER_PLANS[key];
          const isCurrent = key === current;
          const isPaid = key === "member_plus";
          return (
            <div key={key} className={`rounded-2xl border p-6 ${isPaid ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "border-app bg-surface"}`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold text-app">{plan.name}</h2>
                {isCurrent && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">Current</span>}
              </div>
              <p className="mt-1 text-2xl font-bold text-app">
                ${plan.price}<span className="text-sm font-normal text-faint">/mo</span>
              </p>
              <ul className="mt-4 space-y-1.5">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-muted">
                    <span className="text-emerald-500">✓</span> {perk}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <MemberBillingActions plan={key} isCurrent={isCurrent} isPaid={isPaid} hasCustomer={Boolean(me.member.stripeCustomerId)} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-faint">
        Billing is handled securely by Stripe. Cancel anytime from the customer portal.
      </p>
    </div>
  );
}
