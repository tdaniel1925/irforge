import { createServerSupabase } from "./supabase/server";
import { getMyCompany } from "./supabase/store";

// Multi-calendar system: IR / Tech / General / Personal calendars per company,
// with admin-assigned per-user visibility. RLS does the heavy lifting — these
// queries only return calendars/events the caller is allowed to see (see
// supabase/RUN-THIS-team-calendars.sql).

export interface TeamCalendar {
  id: string;
  kind: "ir" | "tech" | "general" | "personal";
  name: string;
  color: string;
  ownerUserId: string | null;
}
export interface TeamCalEvent {
  id: string;
  calendarId: string;
  title: string;
  eventDate: string;   // YYYY-MM-DD
  eventTime: string;   // optional HH:MM
  type: string;
  note: string;
}

async function myCompanyId(): Promise<string | null> {
  const mine = await getMyCompany();
  return mine?.id ?? null;
}

function rowToCal(r: Record<string, unknown>): TeamCalendar {
  return {
    id: String(r.id),
    kind: ((r.kind as string) ?? "general") as TeamCalendar["kind"],
    name: (r.name as string) ?? "",
    color: (r.color as string) ?? "emerald",
    ownerUserId: r.owner_user_id ? String(r.owner_user_id) : null,
  };
}
function rowToEvent(r: Record<string, unknown>): TeamCalEvent {
  return {
    id: String(r.id),
    calendarId: String(r.calendar_id),
    title: (r.title as string) ?? "",
    eventDate: String(r.event_date ?? "").slice(0, 10),
    eventTime: (r.event_time as string) ?? "",
    type: (r.type as string) ?? "custom",
    note: (r.note as string) ?? "",
  };
}

// Calendars the current user can see (RLS-filtered: general + own personal +
// admin-granted + all-for-admins).
export async function listMyCalendars(): Promise<TeamCalendar[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase.from("team_calendars").select("*").eq("company_id", cid).order("kind", { ascending: true });
  return (data ?? []).map(rowToCal);
}

// Events across a set of calendars in a date range (for the dashboard widgets +
// full calendar view). Empty calendarIds = all visible calendars.
export async function listCalendarEvents(opts: { calendarIds?: string[]; from?: string; to?: string }): Promise<TeamCalEvent[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  let q = supabase.from("team_calendar_events").select("*").eq("company_id", cid);
  if (opts.calendarIds?.length) q = q.in("calendar_id", opts.calendarIds);
  if (opts.from) q = q.gte("event_date", opts.from);
  if (opts.to) q = q.lt("event_date", opts.to);
  const { data } = await q.order("event_date", { ascending: true }).limit(1000);
  return (data ?? []).map(rowToEvent);
}

export async function addCalendarEvent(input: { calendarId: string; title: string; eventDate: string; eventTime?: string; type?: string; note?: string }): Promise<TeamCalEvent | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid || !user) return null;
  const { data } = await supabase
    .from("team_calendar_events")
    .insert({
      calendar_id: input.calendarId,
      company_id: cid,
      title: input.title.slice(0, 160),
      event_date: input.eventDate,
      event_time: (input.eventTime ?? "").slice(0, 5),
      type: (input.type ?? "custom").slice(0, 40),
      note: (input.note ?? "").slice(0, 300),
      created_by: user.id,
    })
    .select("*")
    .single();
  return data ? rowToEvent(data) : null;
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("team_calendar_events").delete().eq("id", id);
}

// Create a calendar (admin) or a personal one for the caller.
export async function createCalendar(input: { kind: TeamCalendar["kind"]; name: string; color?: string; personal?: boolean }): Promise<TeamCalendar | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid || !user) return null;
  const { data } = await supabase
    .from("team_calendars")
    .insert({
      company_id: cid,
      kind: input.kind,
      name: input.name.slice(0, 80),
      color: input.color ?? "emerald",
      owner_user_id: input.personal ? user.id : null,
    })
    .select("*")
    .single();
  return data ? rowToCal(data) : null;
}

// ── Admin: per-user calendar access ──

// Which users can see a given calendar (admin view).
export async function getCalendarAccess(calendarId: string): Promise<string[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("calendar_access").select("user_id").eq("calendar_id", calendarId);
  return (data ?? []).map((r) => String(r.user_id));
}

// Replace the access list for a calendar (admin only — RLS enforces it).
export async function setCalendarAccess(calendarId: string, userIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return { ok: false, error: "Sign in." };
  // Clear then insert the new set.
  await supabase.from("calendar_access").delete().eq("calendar_id", calendarId);
  if (userIds.length) {
    const rows = userIds.map((uid) => ({ calendar_id: calendarId, company_id: cid, user_id: uid }));
    const { error } = await supabase.from("calendar_access").insert(rows);
    if (error) return { ok: false, error: error.message.includes("policy") ? "Only admins can assign calendars." : error.message };
  }
  return { ok: true };
}
