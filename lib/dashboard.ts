import { createServerSupabase, createServiceClient } from "./supabase/server";
import { getMyCompany } from "./supabase/store";

// Home-dashboard data layer: office presence (in/out + reason), birthdays, and
// the team quick-update board. RLS scopes everything to the caller's company.

export interface TeamProfile {
  userId: string;
  displayName: string;
  email: string;
  officeStatus: "in" | "out";
  statusReason: string;
  birthday: string | null;   // YYYY-MM-DD
}
export interface TeamUpdate {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

async function ctx() {
  const mine = await getMyCompany();
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return { cid: mine?.id ?? null, user, supabase };
}

// Resolve emails for a set of user ids via the service-role admin API.
async function emailsFor(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const svc = createServiceClient();
  const map: Record<string, string> = {};
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await svc.auth.admin.getUserById(id);
        if (data?.user?.email) map[id] = data.user.email;
      } catch { /* skip */ }
    })
  );
  return map;
}

// Everyone's presence + birthday for the company (the "who's in/out" + birthdays).
export async function listTeamProfiles(): Promise<TeamProfile[]> {
  const { cid, supabase } = await ctx();
  if (!cid) return [];
  const { data } = await supabase.from("team_profiles").select("*").eq("company_id", cid);
  const rows = data ?? [];
  const emails = await emailsFor(rows.map((r) => String(r.user_id)));
  return rows.map((r) => ({
    userId: String(r.user_id),
    displayName: (r.display_name as string) || emails[String(r.user_id)]?.split("@")[0] || "Teammate",
    email: emails[String(r.user_id)] ?? "",
    officeStatus: ((r.office_status as string) ?? "in") as "in" | "out",
    statusReason: (r.status_reason as string) ?? "",
    birthday: r.birthday ? String(r.birthday).slice(0, 10) : null,
  }));
}

// Upsert the caller's own profile (status / reason / birthday / name).
export async function saveMyProfile(input: { displayName?: string; officeStatus?: "in" | "out"; statusReason?: string; birthday?: string | null }): Promise<{ ok: boolean }> {
  const { cid, user, supabase } = await ctx();
  if (!cid || !user) return { ok: false };
  const row: Record<string, unknown> = { company_id: cid, user_id: user.id, updated_at: new Date().toISOString() };
  if (input.displayName !== undefined) row.display_name = input.displayName.slice(0, 80);
  if (input.officeStatus !== undefined) row.office_status = input.officeStatus;
  if (input.statusReason !== undefined) row.status_reason = input.statusReason.slice(0, 120);
  if (input.birthday !== undefined) row.birthday = input.birthday;
  await supabase.from("team_profiles").upsert(row, { onConflict: "company_id,user_id" });
  return { ok: true };
}

// Today's birthdays (month/day match), for the home-screen birthday notice.
export async function todaysBirthdays(): Promise<string[]> {
  const profiles = await listTeamProfiles();
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return profiles.filter((p) => p.birthday && p.birthday.slice(5) === md).map((p) => p.displayName);
}

// ── Quick-update board ──
export async function listTeamUpdates(limit = 15): Promise<TeamUpdate[]> {
  const { cid, user, supabase } = await ctx();
  if (!cid) return [];
  const { data } = await supabase.from("team_updates").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    authorName: (r.author_name as string) || "Teammate",
    body: (r.body as string) ?? "",
    createdAt: String(r.created_at ?? ""),
    mine: Boolean(user && r.user_id === user.id),
  }));
}

export async function postTeamUpdate(body: string, authorName: string): Promise<{ ok: boolean; error?: string }> {
  const { cid, user, supabase } = await ctx();
  if (!cid || !user) return { ok: false, error: "Sign in." };
  const text = body.trim().slice(0, 280);
  if (!text) return { ok: false, error: "Write a message." };
  // Prefer an explicit name; otherwise use the user's saved profile name, then
  // fall back to the local part of their email.
  let name = authorName.trim();
  if (!name) {
    const { data: prof } = await supabase.from("team_profiles").select("display_name").eq("company_id", cid).eq("user_id", user.id).maybeSingle();
    name = (prof?.display_name as string) || user.email?.split("@")[0] || "Teammate";
  }
  const { error } = await supabase.from("team_updates").insert({ company_id: cid, user_id: user.id, author_name: name.slice(0, 80), body: text });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteTeamUpdate(id: string): Promise<void> {
  const { supabase } = await ctx();
  await supabase.from("team_updates").delete().eq("id", id);
}

// ── Team chat (right comms sidebar) ──
export interface ChatMessage {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export async function listChat(limit = 60): Promise<ChatMessage[]> {
  const { cid, user, supabase } = await ctx();
  if (!cid) return [];
  const { data } = await supabase.from("team_chat").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(limit);
  // newest-first from the query; return oldest-first for natural chat order.
  return (data ?? []).reverse().map((r) => ({
    id: String(r.id),
    authorName: (r.author_name as string) || "Teammate",
    body: (r.body as string) ?? "",
    createdAt: String(r.created_at ?? ""),
    mine: Boolean(user && r.user_id === user.id),
  }));
}

export async function postChat(body: string): Promise<{ ok: boolean; error?: string }> {
  const { cid, user, supabase } = await ctx();
  if (!cid || !user) return { ok: false, error: "Sign in." };
  const text = body.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Empty message." };
  // Name: saved profile name, else email local part.
  const { data: prof } = await supabase.from("team_profiles").select("display_name").eq("company_id", cid).eq("user_id", user.id).maybeSingle();
  const name = (prof?.display_name as string) || user.email?.split("@")[0] || "Teammate";
  const { error } = await supabase.from("team_chat").insert({ company_id: cid, user_id: user.id, author_name: name, body: text });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteChat(id: string): Promise<void> {
  const { supabase, user, cid } = await ctx();
  if (!user || !cid) return;
  // Only the author may delete their own message, scoped to their company.
  // (Previously deleted by id alone — any user could delete anyone's message.)
  await supabase.from("team_chat").delete().eq("id", id).eq("user_id", user.id).eq("company_id", cid);
}

// ── Per-user dashboard layout (which widgets show + their order) ──
export interface DashboardLayout { order: string[]; hidden: string[] }

export async function getDashboardLayout(): Promise<DashboardLayout | null> {
  const { cid, user, supabase } = await ctx();
  if (!cid || !user) return null;
  const { data } = await supabase.from("team_profiles").select("dashboard_layout").eq("company_id", cid).eq("user_id", user.id).maybeSingle();
  const l = data?.dashboard_layout as DashboardLayout | null | undefined;
  if (!l || !Array.isArray(l.order)) return null;
  return { order: l.order.map(String), hidden: Array.isArray(l.hidden) ? l.hidden.map(String) : [] };
}

export async function saveDashboardLayout(layout: DashboardLayout): Promise<{ ok: boolean }> {
  const { cid, user, supabase } = await ctx();
  if (!cid || !user) return { ok: false };
  await supabase.from("team_profiles").upsert(
    { company_id: cid, user_id: user.id, dashboard_layout: { order: layout.order.slice(0, 20), hidden: layout.hidden.slice(0, 20) }, updated_at: new Date().toISOString() },
    { onConflict: "company_id,user_id" }
  );
  return { ok: true };
}

// A rotating daily quote (deterministic by date — no external call).
const QUOTES = [
  "The best way to predict the future is to create it.",
  "Quality means doing it right when no one is looking.",
  "Great things are done by a series of small things brought together.",
  "Discipline is the bridge between goals and accomplishment.",
  "Energy and persistence conquer all things.",
  "The expert in anything was once a beginner.",
  "Done is better than perfect — then make it perfect.",
  "Build something today your future self will thank you for.",
  "Small daily improvements lead to stunning results.",
  "Focus on being productive instead of busy.",
];
export function dailyQuote(): string {
  const now = new Date();
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  return QUOTES[day % QUOTES.length];
}
