import { getMyCompany } from "./supabase/store";
import { loadCompanyDb } from "./supabase/store";
import { listTeam } from "./team";
import { getLinkedAccounts, ayrshareMultiTenant } from "./ayrshare";

// Computes the setup checklist from REAL data — every item reflects actual state,
// no manual checkboxes. Split into company-wide (admin) and personal (everyone).

export interface SetupItem {
  key: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}
export interface SetupStatus {
  isAdmin: boolean;
  company: SetupItem[];      // admin-only company-wide setup
  personal: SetupItem[];     // everyone's own setup
  companyDone: number;
  companyTotal: number;
  personalDone: number;
  personalTotal: number;
}

export async function getSetupStatus(): Promise<SetupStatus | null> {
  const mine = await getMyCompany();
  if (!mine) return null;
  const c = mine.company;

  // Who am I + the roster (one call gives both).
  let isAdmin = false;
  let memberCount = 0;
  let invitedCount = 0;
  try {
    const team = await listTeam();
    isAdmin = team.isAdmin;
    memberCount = team.members.filter((m) => m.status === "active").length;
    invitedCount = team.members.filter((m) => m.status === "invited").length;
  } catch { /* default member */ }

  // Connected socials (per-company).
  let socials: string[] = [];
  if (ayrshareMultiTenant()) {
    try { socials = await getLinkedAccounts(c.ayrshareProfileKey); } catch { /* none */ }
  }

  // Has at least one post been approved/posted? (signals they've used the core flow.)
  let approvedAny = false;
  let hasDrafts = false;
  try {
    const remote = await loadCompanyDb();
    const drafts = (remote?.db?.drafts ?? []) as { status?: string }[];
    hasDrafts = drafts.length > 0;
    approvedAny = drafts.some((d) => d.status === "approved" || d.status === "posted");
  } catch { /* ignore */ }

  const company: SetupItem[] = [
    { key: "ticker", label: "Connect your ticker", hint: "Pull your SEC profile + first drafts", href: "/onboarding", done: Boolean(c.ticker?.trim()) },
    { key: "profile", label: "Confirm company profile", hint: "Name, sector, description", href: "/settings", done: Boolean(c.name?.trim() && c.sector?.trim()) },
    { key: "approver", label: "Set who approves posts", hint: "Nothing publishes without their tap", href: "/settings", done: Boolean(c.approverName?.trim()) },
    { key: "disclosure", label: "Set your disclosure language", hint: "Attached to every published post", href: "/settings", done: Boolean(c.disclosureText?.trim()) },
    { key: "socials", label: "Connect your social accounts", hint: "Where approved posts publish", href: "/settings", done: socials.length > 0 },
    { key: "peers", label: "Add peer tickers", hint: "Powers Fund Finder + comparisons", href: "/settings", done: (c.peers?.filter(Boolean).length ?? 0) > 0 },
    { key: "team", label: "Invite your team", hint: "Add admins & members (optional)", href: "/admin/team", done: memberCount > 1 || invitedCount > 0 },
  ];

  const personal: SetupItem[] = [
    { key: "account", label: "Your account is active", hint: "You're signed in", href: "/setup", done: true },
    { key: "first_post", label: "Approve your first post", hint: "Review a draft and approve it", href: "/app", done: approvedAny },
    { key: "workspace", label: "Set up your workspace", hint: "Your private notes (optional)", href: "/workspace", done: false }, // soft — never blocks
    { key: "learn", label: "Learn the basics", hint: "2-min IR primer", href: "/learn", done: false }, // soft
  ];

  // Soft/optional personal items don't count against "done" pressure — only count
  // the data-backed ones so the bar reflects real progress.
  const personalCounted = personal.filter((i) => i.key === "account" || i.key === "first_post");

  return {
    isAdmin,
    company,
    personal,
    companyDone: company.filter((i) => i.done).length,
    companyTotal: company.length,
    personalDone: personalCounted.filter((i) => i.done).length,
    personalTotal: personalCounted.length,
  };
}
