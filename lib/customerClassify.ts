// Single source of truth for what a `companies` row actually IS in the admin
// console. The table conflates three very different things; classifying them is
// what stops team-member phantom companies from polluting the customer list.
//
//   customer — a real paying/comped company (active OR comped subscription).
//              This is what belongs on the Customers list.
//   prospect — a real company identity (has a ticker/name or is onboarded, or
//              has posts) but is NOT yet paying/comped. A lead, not a customer.
//   phantom  — an empty shell: no name, no ticker, not onboarded, no posts, no
//              paid status. These are almost always the empty company the signup
//              trigger mints for a user who is really a TEAM MEMBER of another
//              company. They should never appear as customers or prospects.

export type CompanyKind = "customer" | "prospect" | "phantom";

export interface ClassifyInput {
  name?: string | null;
  ticker?: string | null;
  onboardingComplete?: boolean | null;
  subscriptionStatus?: string | null;   // "active" | "past_due" | "none" | ...
  comped?: boolean | null;
  postsTotal?: number | null;
}

export function classifyCompany(c: ClassifyInput): CompanyKind {
  const paying = c.subscriptionStatus === "active" || c.subscriptionStatus === "past_due";
  const comped = !!c.comped;
  // Customer = the money definition (active|past_due|comped). Nothing else counts.
  if (paying || comped) return "customer";

  const hasIdentity = !!(c.name && c.name.trim()) || !!(c.ticker && c.ticker.trim());
  const hasActivity = (c.postsTotal ?? 0) > 0;
  // A real-but-unpaid company (has a name/ticker, onboarded, or has posted) is a
  // prospect — worth seeing, but not a customer.
  if (hasIdentity || c.onboardingComplete || hasActivity) return "prospect";

  // Otherwise it's an empty shell — a phantom (usually a team member's stub).
  return "phantom";
}
