import crypto from "crypto";
import { createServerSupabase, createServiceClient } from "../supabase/server";
import { getMyCompany } from "../supabase/store";
import { writeAudit } from "../platform";
import { planCalendar, generateSocialPost, classifyRegFD, generateCadencePost } from "../ai";
import { checkContent } from "../compliance";
import { generateBrandedImage } from "../image";
import { getPostStatus } from "../ayrshare";
import { getStore } from "../db";
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
  classification: string | null;
  classFlags: string[];
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
    classification: r.classification ? String(r.classification) : null,
    classFlags: (r.class_flags as string[]) ?? [],
    calendarBatch: r.calendar_batch ? String(r.calendar_batch) : null,
  }));
  return { batchId, slots };
}

// Draft empty slots in the latest batch: for each, generate platform-formatted
// text → compliance check → Reg FD classify → generate image → save. Capped per
// call (LIMIT) so a single request can't time out; the UI calls repeatedly until
// nothing's left undrafted. Returns how many were drafted and how many remain.
const DRAFT_LIMIT = 4;

// Per-company monthly cap on AI-drafted posts. Each draft spends Claude (text +
// Reg FD) + Gemini (image), so this bounds cost. Override per env; default 120
// (~one calendar/week across a couple platforms). 0 = unlimited.
const MONTHLY_DRAFT_CAP = Number(process.env.SOCIAL_MONTHLY_DRAFT_CAP ?? 120);

// How many posts this company has drafted since the start of the current UTC
// month (counts the audit-logged "social.post_drafted" events).
async function draftedThisMonth(cid: string): Promise<number> {
  const supabase = await createServerSupabase();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("company_id", cid)
    .eq("action", "social.post_drafted")
    .gte("created_at", monthStart);
  return count ?? 0;
}

export async function draftCalendarBatch(): Promise<{ ok: boolean; error?: string; drafted: number; remaining: number }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = await getMyCompany();
  if (!mine || !user) return { ok: false, error: "Sign in.", drafted: 0, remaining: 0 };
  const cid = mine.id;

  const { batchId } = await listLatestCalendar();
  if (!batchId) return { ok: false, error: "No calendar to draft. Generate one first.", drafted: 0, remaining: 0 };

  // Enforce the monthly cap before spending any AI calls.
  let monthRemaining = Infinity;
  if (MONTHLY_DRAFT_CAP > 0) {
    const used = await draftedThisMonth(cid);
    monthRemaining = MONTHLY_DRAFT_CAP - used;
    if (monthRemaining <= 0) {
      return { ok: false, error: `Monthly limit reached (${MONTHLY_DRAFT_CAP} AI posts). It resets at the start of next month, or contact support to raise it.`, drafted: 0, remaining: 0 };
    }
  }

  // Empty slots = body is '' (not yet drafted). Never draft more than the
  // monthly cap allows in this pass.
  const passLimit = Math.max(0, Math.min(DRAFT_LIMIT, monthRemaining));
  const { data: empties } = await supabase
    .from("iros_posts")
    .select("id, platform, theme")
    .eq("company_id", cid)
    .eq("calendar_batch", batchId)
    .eq("body", "")
    .order("scheduled_at", { ascending: true })
    .limit(passLimit);

  const todo = empties ?? [];
  if (!todo.length) {
    // No work this pass. If it's because the cap zeroed passLimit (not because the
    // calendar is fully drafted), surface that so the UI shows why it stopped.
    if (passLimit === 0) {
      const { count: stillEmpty } = await supabase
        .from("iros_posts").select("id", { count: "exact", head: true })
        .eq("company_id", cid).eq("calendar_batch", batchId).eq("body", "");
      if ((stillEmpty ?? 0) > 0) {
        return { ok: false, error: `Monthly limit reached (${MONTHLY_DRAFT_CAP} AI posts). ${stillEmpty} slot(s) left undrafted until next month.`, drafted: 0, remaining: stillEmpty ?? 0 };
      }
    }
    return { ok: true, drafted: 0, remaining: 0 };
  }

  const ctx = await buildStrategyContext();
  if (!ctx) return { ok: false, error: "No company context.", drafted: 0, remaining: 0 };
  const contextBlock = renderContextForPrompt(ctx);
  const company = ctx.company;

  let drafted = 0;
  let slotIndex = 0;
  for (const slot of todo) {
    const platform = String(slot.platform || "linkedin");
    const theme = String(slot.theme || "Update");

    // 1) Generate the post text for this platform.
    const gen = await generateSocialPost(contextBlock, { theme, angle: "" }, platform);
    let text = gen.text;
    if (!text) {
      // Deterministic fallback so a slot is never left blank/broken.
      text = `${company.name} ($${company.ticker}): ${theme}. Details are in our public SEC filings on EDGAR.`;
    }

    // 2) Compliance check (banned-claims) on the text.
    const flags = checkContent([text]);
    const blocked = flags.some((f) => f.severity === "block");

    // 3) Reg FD classification.
    const cls = await classifyRegFD(text, company);

    // Merge banned-claims into the classification so the review gate + badge see
    // them — NOT just the Reg FD result. A hard banned claim (price prediction,
    // "undervalued", advice) forces RED so it can never be bulk-approved and must
    // go through counsel; any other compliance flag escalates green -> yellow.
    let classification = cls.classification;
    if (blocked) classification = "red";
    else if (flags.length && classification === "green") classification = "yellow";
    const mergedFlags = Array.from(new Set([...cls.flags, ...flags.map((f) => `claim:${f.rule}`)]));
    const reason = blocked
      ? `Blocked language detected (${flags.map((f) => f.rule).join(", ")}). ${cls.reasoning}`
      : cls.reasoning;

    // 4) Branded template image (best-effort): AI background + real logo + crisp
    // headline. Vary the bg per slot so a whole month doesn't look identical.
    const headline = String(text).split(/\n/)[0].slice(0, 120) || theme;
    const mediaUrl = await generateBrandedImage({
      companyId: cid, postId: String(slot.id), ticker: company.ticker, company: company.name,
      theme, brandColors: (company as { brandColors?: string }).brandColors,
      imageStyle: (company as { imageStyle?: string }).imageStyle, guidance: (company as { postGuidance?: string }).postGuidance,
      layout: "announcement", label: theme, title: headline, variant: slotIndex++,
    });

    // 5) Save everything onto the slot row.
    await supabase
      .from("iros_posts")
      .update({
        body: text.slice(0, 4000),
        classification,
        class_confidence: cls.confidence,
        class_flags: mergedFlags,
        class_reason: reason,
        media_url: mediaUrl ?? "",
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot.id);

    await writeAudit({
      companyId: cid, actorUserId: user.id, actorEmail: user.email,
      action: "social.post_drafted", entityType: "post", entityId: String(slot.id),
      payload: { platform, theme, classification, regFd: cls.classification, blocked, hasImage: Boolean(mediaUrl) },
    });
    drafted++;
  }

  // How many empty slots remain after this pass?
  const { count } = await supabase
    .from("iros_posts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", cid)
    .eq("calendar_batch", batchId)
    .eq("body", "");

  return { ok: true, drafted, remaining: count ?? 0 };
}

// Schedule every APPROVED post in the latest batch to its slot time via Ayrshare
// native scheduling. Delegates to the canonical service (lib/services/posts.ts
// publishApproved) — quiet-mode gate, per-channel disclosures, channel caps,
// RED defense-in-depth, and idempotency all live THERE. This wrapper resolves
// the browser session into an ActorContext and preserves the old signature.
export async function scheduleApprovedPosts(): Promise<{ ok: boolean; error?: string; scheduled: number; failed: { id: string; reason: string }[] }> {
  const { resolveSessionActor } = await import("../services/context");
  const ctx = await resolveSessionActor();
  if (!ctx) return { ok: false, error: "Sign in.", scheduled: 0, failed: [] };
  const { publishApproved } = await import("../services/posts");
  const { result } = await publishApproved(ctx);
  return result;
}

// ── Delivery dashboard (the "outbox") ──

export interface OutboxPost {
  id: string;
  platform: string;
  theme: string;
  body: string;
  mediaUrl: string;
  status: string;           // scheduled | published | pulled | ...
  scheduledAt: string | null;
  postedAt: string | null;
  postUrl: string;          // live link on the social network, once posted
  ayrPostId: string;
  publishError: string;
}

function rowToOutbox(r: Record<string, unknown>): OutboxPost {
  return {
    id: String(r.id),
    platform: (r.platform as string) ?? "",
    theme: (r.theme as string) ?? "",
    body: (r.body as string) ?? "",
    mediaUrl: (r.media_url as string) ?? "",
    status: (r.status as string) ?? "draft",
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    postedAt: r.posted_at ? String(r.posted_at) : null,
    postUrl: (r.post_url as string) ?? "",
    ayrPostId: (r.ayr_post_id as string) ?? "",
    publishError: (r.publish_error as string) ?? "",
  };
}

// Everything that's been handed off to publishing (scheduled / published / failed),
// newest first — what the delivery dashboard shows. Spans all calendar batches.
export async function listOutbox(): Promise<OutboxPost[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase
    .from("iros_posts")
    .select("id, platform, theme, body, media_url, status, scheduled_at, posted_at, post_url, ayr_post_id, publish_error")
    .eq("company_id", cid)
    .in("status", ["scheduled", "published", "pulled"])
    .order("scheduled_at", { ascending: true })
    .limit(500);
  return (data ?? []).map(rowToOutbox);
}

// Confirm delivery: for each post we scheduled (has an ayr_post_id) that isn't yet
// confirmed published, ask Ayrshare its live status and update the row. Returns
// how many flipped to published / failed. Safe to call on demand or from a cron.
export async function reconcileScheduledPosts(): Promise<{ ok: boolean; checked: number; published: number; failed: number }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = await getMyCompany();
  if (!mine) return { ok: false, checked: 0, published: 0, failed: 0 };
  const cid = mine.id;
  const profileKey = mine.company.ayrshareProfileKey;

  const { data } = await supabase
    .from("iros_posts")
    .select("id, ayr_post_id, status")
    .eq("company_id", cid)
    .eq("status", "scheduled")
    .neq("ayr_post_id", "")
    .limit(100);

  const todo = data ?? [];
  let published = 0, failed = 0;
  for (const p of todo) {
    const s = await getPostStatus(String(p.ayr_post_id), profileKey);
    if (!s.found) continue;
    if (s.status === "success") {
      await supabase.from("iros_posts").update({
        status: "published",
        post_url: s.postUrl ?? "",
        posted_at: new Date().toISOString(),
        publish_error: "",
        updated_at: new Date().toISOString(),
      }).eq("id", p.id);
      await writeAudit({ companyId: cid, actorUserId: user?.id, actorEmail: user?.email, action: "social.post_published", entityType: "post", entityId: String(p.id), payload: { postUrl: s.postUrl ?? null, confirmed: true } });
      published++;
    } else if (s.status === "error") {
      await supabase.from("iros_posts").update({
        publish_error: (s.error ?? "Ayrshare reported an error").slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", p.id);
      failed++;
    }
    // scheduled / pending → leave as-is, check again later.
  }
  return { ok: true, checked: todo.length, published, failed };
}

// Cron variant: reconcile scheduled posts for ALL companies via the service-role
// client (no auth session). Looks up each company's ayrshareProfileKey to scope
// the Ayrshare status check correctly. Time-budgeted for serverless.
export async function reconcileAllScheduled(deadlineMs: number): Promise<{ checked: number; published: number; failed: number }> {
  const svc = createServiceClient();
  const started = Date.now();

  const { data: due } = await svc
    .from("iros_posts")
    .select("id, company_id, ayr_post_id")
    .eq("status", "scheduled")
    .neq("ayr_post_id", "")
    .limit(500);

  const rows = due ?? [];
  if (!rows.length) return { checked: 0, published: 0, failed: 0 };

  // Cache profileKey per company (one lookup each).
  const keyCache = new Map<string, string | undefined>();
  const profileKeyFor = async (cid: string): Promise<string | undefined> => {
    if (keyCache.has(cid)) return keyCache.get(cid);
    const { data } = await svc.from("companies").select("ayrshare_profile_key").eq("id", cid).maybeSingle();
    const pk = (data?.ayrshare_profile_key as string) || undefined;
    keyCache.set(cid, pk);
    return pk;
  };

  let checked = 0, published = 0, failed = 0;
  for (const p of rows) {
    if (Date.now() - started > deadlineMs) break;
    checked++;
    const pk = await profileKeyFor(String(p.company_id));
    const s = await getPostStatus(String(p.ayr_post_id), pk);
    if (!s.found) continue;
    if (s.status === "success") {
      await svc.from("iros_posts").update({ status: "published", post_url: s.postUrl ?? "", posted_at: new Date().toISOString(), publish_error: "", updated_at: new Date().toISOString() }).eq("id", p.id);
      await writeAudit({ companyId: String(p.company_id), action: "social.post_published", entityType: "post", entityId: String(p.id), payload: { postUrl: s.postUrl ?? null, confirmed: true, via: "cron" } });
      published++;
    } else if (s.status === "error") {
      await svc.from("iros_posts").update({ publish_error: (s.error ?? "Ayrshare reported an error").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", p.id);
      failed++;
    }
  }
  return { checked, published, failed };
}

// ── Visual month calendar (posts + IR events + quiet-period shading) ──

export interface CalendarPost {
  id: string;
  platform: string;
  theme: string;
  body: string;
  status: string;            // draft|reviewed|approved|scheduled|published|pulled
  classification: string | null;
  scheduledAt: string | null;
  mediaUrl: string;
  postUrl: string;
  manual: boolean;           // created by hand vs AI-generated
}
export interface CalendarIrEvent {
  date: string;              // ISO date
  title: string;
  type: string;              // earnings|quiet_start|quiet_end|filing_deadline|...
}
export interface MonthCalendar {
  posts: CalendarPost[];
  events: CalendarIrEvent[];
  quietWindows: Array<[string, string | null]>;
}

// Everything the month grid needs for [startISO, endISO): every social post with
// a scheduled date in range, the IR events (earnings / quiet markers), and the
// quiet windows so the grid can shade blackout days.
export async function getMonthCalendar(startIso: string, endIso: string): Promise<MonthCalendar> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return { posts: [], events: [], quietWindows: [] };

  const { data } = await supabase
    .from("iros_posts")
    .select("id, platform, theme, body, status, classification, scheduled_at, media_url, post_url, calendar_batch")
    .eq("company_id", cid)
    .gte("scheduled_at", startIso)
    .lt("scheduled_at", endIso)
    .order("scheduled_at", { ascending: true })
    .limit(500);

  const posts: CalendarPost[] = (data ?? []).map((r) => ({
    id: String(r.id),
    platform: (r.platform as string) ?? "",
    theme: (r.theme as string) ?? "",
    body: (r.body as string) ?? "",
    status: (r.status as string) ?? "draft",
    classification: r.classification ? String(r.classification) : null,
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    mediaUrl: (r.media_url as string) ?? "",
    postUrl: (r.post_url as string) ?? "",
    manual: !r.calendar_batch, // no batch id = created by hand
  }));

  // IR events from the local-store calendar (earnings, quiet markers, etc.).
  let events: CalendarIrEvent[] = [];
  try {
    const { db } = await getStore();
    const cal = (db.calendar ?? []) as { date: string; title: string; type: string }[];
    events = cal
      .filter((e) => e.date >= startIso.slice(0, 10) && e.date < endIso.slice(0, 10))
      .map((e) => ({ date: e.date, title: e.title, type: e.type }));
  } catch {
    // events are best-effort context
  }

  return { posts, events, quietWindows: await quietWindows() };
}

// Create a single post by hand for a chosen date/platform. Runs the SAME
// compliance gate as the AI path (banned-claims forces RED; other flags → yellow)
// so a manual post can't bypass review. Image optional. Status: draft.
export async function createManualPost(input: {
  body: string;
  platform: string;
  scheduledAt: string;       // ISO
  theme?: string;
  withImage?: boolean;
}): Promise<{ ok: boolean; error?: string; postId?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = await getMyCompany();
  if (!mine || !user) return { ok: false, error: "Sign in." };
  const cid = mine.id;
  const company = mine.company;

  const body = String(input.body ?? "").trim();
  if (!body) return { ok: false, error: "Write something to post." };
  const platform = String(input.platform || "linkedin");

  // Compliance gate (same as the AI draft path).
  const flags = checkContent([body]);
  const blocked = flags.some((f) => f.severity === "block");
  const cls = await classifyRegFD(body, company);
  let classification = cls.classification;
  if (blocked) classification = "red";
  else if (flags.length && classification === "green") classification = "yellow";
  const mergedFlags = Array.from(new Set([...cls.flags, ...flags.map((f) => `claim:${f.rule}`)]));

  const { data: row, error } = await supabase
    .from("iros_posts")
    .insert({
      company_id: cid,
      title: (input.theme || "Manual post").slice(0, 200),
      body: body.slice(0, 4000),
      channels: [platform],
      platform,
      theme: (input.theme || "Manual").slice(0, 120),
      scheduled_at: input.scheduledAt,
      status: "draft",
      classification,
      class_confidence: cls.confidence,
      class_flags: mergedFlags,
      class_reason: blocked ? `Blocked language (${flags.map((f) => f.rule).join(", ")}). ${cls.reasoning}` : cls.reasoning,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "Couldn't create the post." };

  // Optional branded image (best-effort). Variant derived from the row id so
  // different posts get different backgrounds (deterministic, no randomness).
  if (input.withImage) {
    const variant = String(row.id).split("").reduce((n, c) => n + c.charCodeAt(0), 0);
    const headline = String(body).split(/\n/)[0].slice(0, 120) || (input.theme || "Update");
    const url = await generateBrandedImage({
      companyId: cid, postId: String(row.id), ticker: company.ticker, company: company.name,
      theme: input.theme || "update", brandColors: (company as { brandColors?: string }).brandColors,
      imageStyle: (company as { imageStyle?: string }).imageStyle, guidance: (company as { postGuidance?: string }).postGuidance,
      layout: "announcement", label: input.theme || "Update", title: headline, variant,
    });
    if (url) await supabase.from("iros_posts").update({ media_url: url }).eq("id", row.id);
  }

  await writeAudit({ companyId: cid, actorUserId: user.id, actorEmail: user.email, action: "social.post_created_manual", entityType: "post", entityId: String(row.id), payload: { platform, classification } });
  return { ok: true, postId: String(row.id) };
}

// Move a post to a new date/time (drag-and-drop on the calendar). Only posts NOT
// yet handed off to Ayrshare can move — a scheduled/published post already lives
// at Ayrshare and can't be silently re-dated here.
export async function reschedulePost(postId: string, newScheduledAt: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid || !user) return { ok: false, error: "Sign in." };

  const { data: post } = await supabase
    .from("iros_posts")
    .select("id, status, scheduled_at")
    .eq("id", postId)
    .eq("company_id", cid)
    .maybeSingle();
  if (!post) return { ok: false, error: "Post not found." };

  if (post.status === "scheduled" || post.status === "published") {
    return { ok: false, error: "This post is already scheduled with your channels — pull it first to change the date." };
  }

  const when = new Date(newScheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Invalid date." };

  await supabase.from("iros_posts").update({ scheduled_at: when.toISOString(), updated_at: new Date().toISOString() }).eq("id", postId);
  await writeAudit({ companyId: cid, actorUserId: user.id, actorEmail: user.email, action: "social.post_rescheduled", entityType: "post", entityId: postId, payload: { from: post.scheduled_at, to: when.toISOString() } });
  return { ok: true };
}

// ── Daily suggested posts (cron) ─────────────────────────────────────────────
// For each active company, draft ONE fresh suggested post and drop it into the
// Needs-approval queue (status 'draft') so there's always something new to review
// or reject. Service-role (no session). Skips companies that already have a
// suggestion from today (so the queue doesn't pile up). Time-budgeted.
export async function generateDailySuggestions(deadlineMs: number): Promise<{ companies: number; created: number }> {
  const svc = createServiceClient();
  const started = Date.now();

  // Active companies that are set up (have a ticker + onboarding complete).
  const { data: companies } = await svc
    .from("companies")
    .select("id, name, ticker, sector, description")
    .not("ticker", "is", null)
    .neq("ticker", "")
    .eq("onboarding_complete", true)
    .limit(200);

  let created = 0;
  let touched = 0;
  for (const co of companies ?? []) {
    if (Date.now() - started > deadlineMs) break;
    const cid = String(co.id);

    // Skip if a daily suggestion already exists from the last ~20 hours.
    const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { count } = await svc
      .from("iros_posts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", cid)
      .eq("theme", "Daily suggestion")
      .gte("created_at", since);
    if ((count ?? 0) > 0) continue;
    touched++;

    // Recent post titles to avoid repeating topics.
    const { data: recent } = await svc.from("iros_posts").select("title").eq("company_id", cid).order("created_at", { ascending: false }).limit(8);
    const recentTitles = (recent ?? []).map((r) => String(r.title ?? "")).filter(Boolean);

    try {
      const company = {
        name: String(co.name ?? ""), ticker: String(co.ticker ?? ""),
        sector: String(co.sector ?? "business"), description: String(co.description ?? ""),
      } as never;
      const draft = await generateCadencePost(company, recentTitles);
      const body = draft.tweets.join("\n\n").slice(0, 4000);
      if (!body.trim()) continue;

      // Compliance pre-check: skip anything with blocked language outright.
      const flags = checkContent(draft.tweets);
      if (flags.some((f) => f.severity === "block")) continue;
      const cls = await classifyRegFD(body, company).catch(() => null);

      const { error } = await svc.from("iros_posts").insert({
        company_id: cid,
        title: (draft.title || "Daily suggestion").slice(0, 200),
        body,
        channels: [],
        // Canonical entry status. "pending" (the legacy JSON-drafts vocabulary) is
        // NOT an iros_posts state — rows written with it matched no query and were
        // invisible in every view. "draft" + a body = shows up in Needs-approval.
        status: "draft",
        theme: "Daily suggestion",
        classification: cls?.classification ?? "yellow",
        class_reason: cls?.reasoning ?? null,
      });
      if (!error) created++;
    } catch { /* skip this company; keep going */ }
  }
  return { companies: touched, created };
}
