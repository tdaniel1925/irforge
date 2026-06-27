import { getMyCompany } from "./supabase/store";
import { loadCompanyDb } from "./supabase/store";
import { listTeam } from "./team";
import { getLinkedAccounts, ayrshareMultiTenant } from "./ayrshare";
import { createServerSupabase } from "./supabase/server";

// Per-user setup signals: how many workspace notes they have + whether they've
// opened the Learn library. Both are real, persisted checks.
async function getPersonalSignals(): Promise<{ hasNote: boolean; learnVisited: boolean }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { hasNote: false, learnVisited: false };
  // Resilient: tolerate either query failing (e.g. user_flags table not yet migrated).
  let hasNote = false;
  let learnVisited = false;
  try {
    const { count } = await supabase.from("user_workspace").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    hasNote = (count ?? 0) > 0;
  } catch { /* ignore */ }
  try {
    const { data: flag } = await supabase.from("user_flags").select("learn_visited").eq("user_id", user.id).maybeSingle();
    learnVisited = Boolean(flag?.learn_visited);
  } catch { /* table may not exist yet */ }
  return { hasNote, learnVisited };
}

// Computes the setup checklist from REAL data — every item reflects actual state,
// no manual checkboxes. Split into company-wide (admin) and personal (everyone).

export interface SetupItem {
  key: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
  optional?: boolean; // doesn't count toward completion (e.g. solo admin needn't invite a team)
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
  try {
    const remote = await loadCompanyDb();
    const drafts = (remote?.db?.drafts ?? []) as { status?: string }[];
    approvedAny = drafts.some((d) => d.status === "approved" || d.status === "posted");
  } catch { /* ignore */ }

  // Personal signals: workspace note created + Learn library visited.
  const { hasNote, learnVisited } = await getPersonalSignals();

  const company: SetupItem[] = [
    { key: "ticker", label: "Connect your ticker", hint: "Pull your SEC profile + first drafts", href: "/onboarding", done: Boolean(c.ticker?.trim()) },
    { key: "profile", label: "Confirm company profile", hint: "Name, sector, description", href: "/settings", done: Boolean(c.name?.trim() && c.sector?.trim()) },
    { key: "approver", label: "Set who approves posts", hint: "Nothing publishes without their tap", href: "/settings", done: Boolean(c.approverName?.trim()) },
    { key: "disclosure", label: "Set your disclosure language", hint: "Attached to every published post", href: "/settings", done: Boolean(c.disclosureText?.trim()) },
    // Only show the social-connect step when per-company connecting is actually
    // available — otherwise it can never complete and blocks 100%.
    ...(ayrshareMultiTenant()
      ? [{ key: "socials", label: "Connect your social accounts", hint: "Where approved posts publish", href: "/settings", done: socials.length > 0 }]
      : []),
    { key: "peers", label: "Add peer tickers", hint: "Powers Fund Finder + comparisons", href: "/settings", done: (c.peers?.filter(Boolean).length ?? 0) > 0 },
    // Optional: a solo admin shouldn't be stuck below 100% for not inviting anyone.
    { key: "team", label: "Invite your team", hint: "Add admins & members (optional)", href: "/admin/team", done: memberCount > 1 || invitedCount > 0, optional: true },
  ];

  const personal: SetupItem[] = [
    { key: "account", label: "Your account is active", hint: "You're signed in", href: "/setup", done: true },
    { key: "first_post", label: "Approve your first post", hint: "Review a draft and approve it", href: "/app", done: approvedAny },
    { key: "workspace", label: "Set up your workspace", hint: "Create your first private note", href: "/workspace", done: hasNote },
    { key: "learn", label: "Learn the basics", hint: "2-min IR primer", href: "/learn", done: learnVisited },
  ];

  return {
    isAdmin,
    company,
    personal,
    // Optional items don't count toward completion totals (so 100% is reachable).
    companyDone: company.filter((i) => i.done && !i.optional).length,
    companyTotal: company.filter((i) => !i.optional).length,
    personalDone: personal.filter((i) => i.done && !i.optional).length,
    personalTotal: personal.filter((i) => !i.optional).length,
  };
}
