import crypto from "crypto";
import { createServerSupabase } from "../supabase/server";
import { getMyCompany } from "../supabase/store";
import { writeAudit } from "../platform";
import { planCalendar } from "../ai";
import { buildStrategyContext, renderContextForPrompt, getStrategy } from "./strategy";

// Social Content Engine — calendar layer.
// Turns the AI calendar plan into dated iros_posts slot rows: one row per
// (slot × platform), grouped by a calendar_batch uuid. Slots are created empty
// (status 'draft', no body) — Step 3 generates the per-platform text + image.
// Quiet-period days are skipped so nothing schedules into a blackout window.
// See docs/social-engine-plan.md.

export interface CalendarSlotRow {
  id: string;
  scheduledAt: string | null;
  platform: string;
  theme: string;
  status: string;
  body: string;
  title: string;
  mediaUrl: string;
  calendarBatch: string | null;
}

async function myCompanyId(): Promise<string | null> {
  const mine = await getMyCompany();
  return mine?.id ?? null;
}

// Future quiet-period windows for this company, as [startISO, endISO|null] pairs.
async function quietWindows(): Promise<Array<[string, string | null]>> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase
    .from("iros_disclosure_events")
    .select("effective_at, expires_at")
    .eq("company_id", cid)
    .eq("event_type", "quiet_period_start");
  return (data ?? []).map((r) => [String(r.effective_at), r.expires_at ? String(r.expires_at) : null]);
}

function inQuietWindow(dateIso: string, windows: Array<[string, string | null]>): boolean {
  const t = new Date(dateIso).getTime();
  return windows.some(([start, end]) => t >= new Date(start).getTime() && (end === null || t < new Date(end).getTime()));
}

// Generate a calendar: plan slots, map to dates (skipping quiet windows), and
// insert one draft row per slot×platform. Returns the created rows.
export async function generateCalendar(opts: { startDate?: string; weeks?: number }): Promise<{ ok: boolean; error?: string; batchId?: string; created?: number }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid || !user) return { ok: false, error: "Sign in." };

  const strategy = await getStrategy();
  if (!strategy || !strategy.platforms.length) {
    return { ok: false, error: "Set up your strategy and pick at least one platform first." };
  }

  const ctx = await buildStrategyContext();
  if (!ctx) return { ok: false, error: "No company context." };

  const weeks = Math.max(1, Math.min(6, opts.weeks ?? 4));
  const start = opts.startDate ? new Date(opts.startDate) : new Date();
  // Normalize to 9am local-ish (use UTC noon to avoid tz edge cases for a date-only slot).
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 15, 0, 0);

  const { slots } = await planCalendar(renderContextForPrompt(ctx), {
    platforms: strategy.platforms,
    postsPerWeek: strategy.postsPerWeek,
    weeks,
  });
  if (!slots.length) return { ok: false, error: "Couldn't plan a calendar." };

  const windows = await quietWindows();
  const batchId = crypto.randomUUID();

  // Build rows: one per slot per platform, skipping quiet days.
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const slot of slots) {
    const slotDate = new Date(startMs + slot.dayOffset * 24 * 60 * 60 * 1000).toISOString();
    if (inQuietWindow(slotDate, windows)) {
      skipped++;
      continue;
    }
    for (const platform of slot.platforms) {
      rows.push({
        company_id: cid,
        title: slot.theme.slice(0, 200),
        body: "", // drafted in Step 3
        channels: [platform],
        platform,
        theme: slot.theme.slice(0, 120),
        scheduled_at: slotDate,
        status: "draft",
        calendar_batch: batchId,
        created_by: user.id,
      });
    }
  }

  if (!rows.length) return { ok: false, error: "Every planned day fell inside a quiet period. Adjust the dates or end the quiet period." };

  const { error } = await supabase.from("iros_posts").insert(rows);
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    companyId: cid, actorUserId: user.id, actorEmail: user.email,
    action: "social.calendar_generated", entityType: "calendar", entityId: batchId,
    payload: { slots: slots.length, posts: rows.length, skippedQuiet: skipped, weeks, platforms: strategy.platforms },
  });

  return { ok: true, batchId, created: rows.length };
}

// All slot rows for the most recent calendar batch (what the grid renders).
export async function listLatestCalendar(): Promise<{ batchId: string | null; slots: CalendarSlotRow[] }> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return { batchId: null, slots: [] };

  // Find the newest batch id, then return all its rows.
  const { data: latest } = await supabase
    .from("iros_posts")
    .select("calendar_batch, created_at")
    .eq("company_id", cid)
    .not("calendar_batch", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const batchId = latest?.[0]?.calendar_batch ? String(latest[0].calendar_batch) : null;
  if (!batchId) return { batchId: null, slots: [] };

  const { data } = await supabase
    .from("iros_posts")
    .select("*")
    .eq("company_id", cid)
    .eq("calendar_batch", batchId)
    .order("scheduled_at", { ascending: true });

  const slots: CalendarSlotRow[] = (data ?? []).map((r) => ({
    id: String(r.id),
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    platform: (r.platform as string) ?? "",
    theme: (r.theme as string) ?? "",
    status: (r.status as string) ?? "draft",
    body: (r.body as string) ?? "",
    title: (r.title as string) ?? "",
    mediaUrl: (r.media_url as string) ?? "",
    calendarBatch: r.calendar_batch ? String(r.calendar_batch) : null,
  }));
  return { batchId, slots };
}
