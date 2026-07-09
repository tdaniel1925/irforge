import { createServerSupabase } from "./supabase/server";

// Individual-investor ("member") account data layer. Mirrors lib/supabase/store.ts
// (the company equivalent). All reads/writes are RLS-scoped to the logged-in user.

export interface Member {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  plan: "free" | "member_plus";
  subscriptionStatus: string;
  profileComplete: boolean; // true once the investor set their own username — required to post
  stripeCustomerId?: string;
}

function rowToMember(r: Record<string, unknown>): Member {
  return {
    id: String(r.id),
    displayName: (r.display_name as string) ?? "",
    handle: (r.handle as string) ?? "",
    bio: (r.bio as string) ?? "",
    avatarUrl: (r.avatar_url as string) ?? "",
    plan: ((r.plan as string) ?? "free") as Member["plan"],
    subscriptionStatus: (r.subscription_status as string) ?? "none",
    profileComplete: Boolean(r.profile_complete),
    stripeCustomerId: (r.stripe_customer_id as string) ?? undefined,
  };
}

function memberToRow(p: Partial<Member>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.displayName !== undefined) row.display_name = p.displayName;
  if (p.handle !== undefined) row.handle = p.handle;
  if (p.bio !== undefined) row.bio = p.bio;
  if (p.avatarUrl !== undefined) row.avatar_url = p.avatarUrl;
  if (p.plan !== undefined) row.plan = p.plan;
  if (p.subscriptionStatus !== undefined) row.subscription_status = p.subscriptionStatus;
  if (p.profileComplete !== undefined) row.profile_complete = p.profileComplete;
  if (p.stripeCustomerId !== undefined) row.stripe_customer_id = p.stripeCustomerId;
  return row;
}

// Build a unique-ish default handle from the email local part + short suffix.
function defaultHandle(email: string | undefined, suffix: string): string {
  const base = (email?.split("@")[0] ?? "investor")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 18) || "investor";
  return `${base}_${suffix}`;
}

// Returns the logged-in member's id + profile, or null if not authed / not a member.
// Self-heals: a member auth user with no row yet gets one created (with a unique
// handle). Company accounts return null here (they use getMyCompany()).
export async function getMyMember(): Promise<{ id: string; member: Member } | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("members").select("*").eq("user_id", user.id).maybeSingle();
  if (data) return { id: String(data.id), member: rowToMember(data) };

  // Only mint a member row for member signups (company accounts get a company row).
  if (user.user_metadata?.account_type !== "member") return null;

  // Insert with a generated handle; retry on the unique-handle constraint.
  for (let attempt = 0; attempt < 4; attempt++) {
    const suffix = `${user.id.slice(0, 4)}${attempt > 0 ? attempt : ""}`;
    const handle = defaultHandle(user.email, suffix);
    const { data: created, error } = await supabase
      .from("members")
      .insert({
        user_id: user.id,
        handle,
        display_name: user.email?.split("@")[0] ?? "Investor",
      })
      .select("*")
      .single();
    if (created) return { id: String(created.id), member: rowToMember(created) };
    // 23505 = unique_violation → try a different handle
    if (error && error.code !== "23505") return null;
  }
  return null;
}

export async function updateMyMember(patch: Partial<Member>): Promise<Member | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("members")
    .update(memberToRow(patch))
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToMember(data);
}

// A member's watchlist (the watches rows they own).
export async function getMyWatches(memberId: string): Promise<{ ticker: string; ts: string }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("watches")
    .select("ticker, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ ticker: String(r.ticker).toUpperCase(), ts: String(r.created_at ?? "") }));
}

export async function removeWatch(memberId: string, ticker: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("watches").delete().eq("member_id", memberId).eq("ticker", ticker.toUpperCase());
}

// A member's board activity (their posts).
export interface MyPost {
  id: string;
  ticker: string;
  body: string;
  ts: string;
  flag: string;
  parentId?: string;
}

export async function getMyPosts(memberId: string, limit = 50): Promise<MyPost[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("public_board")
    .select("id, ticker, body, created_at, flag, parent_id")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    ticker: String(r.ticker).toUpperCase(),
    body: String(r.body ?? ""),
    ts: String(r.created_at ?? ""),
    flag: String(r.flag ?? "chatter"),
    parentId: r.parent_id ? String(r.parent_id) : undefined,
  }));
}
