import crypto from "crypto";
import { createServerSupabase } from "../supabase/server";
import { getMyCompany } from "../supabase/store";
import { writeAudit } from "../platform";
import { planCalendar, generateSocialPost, classifyRegFD } from "../ai";
import { checkContent } from "../compliance";
import { generatePostImage, buildImagePrompt } from "../image";
import { publishToChannels } from "../ayrshare";
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

    // 4) Image (best-effort).
    const imagePrompt = buildImagePrompt({ companyName: company.name, ticker: company.ticker, theme, postText: text });
    const mediaUrl = await generatePostImage({ companyId: cid, postId: String(slot.id), prompt: imagePrompt });

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
// native scheduling. Disclosures (FLS + Section 17(b)) are appended HERE, in the
// publish path — never editable out. Quiet mode blocks the whole run. Each post
// gets its image attached and its scheduled_at handed to Ayrshare; on success the
// row advances to 'scheduled'. Returns counts.
export async function scheduleApprovedPosts(): Promise<{ ok: boolean; error?: string; scheduled: number; failed: { id: string; reason: string }[] }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = await getMyCompany();
  if (!mine || !user) return { ok: false, error: "Sign in.", scheduled: 0, failed: [] };
  const cid = mine.id;
  const company = mine.company;

  // Quiet mode suspends ALL publishing — same gate as the rest of the app.
  if (company.quietMode) {
    return { ok: false, error: "Quiet mode is ON — publishing is suspended. Turn it off to schedule.", scheduled: 0, failed: [] };
  }

  const { batchId } = await listLatestCalendar();
  if (!batchId) return { ok: false, error: "No calendar to schedule.", scheduled: 0, failed: [] };

  const { data: approved } = await supabase
    .from("iros_posts")
    .select("id, body, channels, platform, media_url, scheduled_at, classification")
    .eq("company_id", cid)
    .eq("calendar_batch", batchId)
    .eq("status", "approved");

  const todo = approved ?? [];
  if (!todo.length) return { ok: true, scheduled: 0, failed: [] };

  const failed: { id: string; reason: string }[] = [];
  let scheduled = 0;

  for (const p of todo) {
    // Defense in depth: a RED post should never reach 'approved' (counsel only),
    // but never schedule one even if it somehow did.
    if (p.classification === "red") { failed.push({ id: String(p.id), reason: "RED — needs counsel sign-off" }); continue; }
    const channels = (p.channels as string[]) ?? [];
    if (!channels.length) { failed.push({ id: String(p.id), reason: "no channel" }); continue; }

    // Append the mandatory disclosures in the publish path (not the draft).
    const disclosures = [company.flsText, company.disclosureText].filter(Boolean).join("\n\n");
    const finalText = disclosures ? `${p.body}\n\n${disclosures}` : String(p.body);

    const result = await publishToChannels(finalText, channels, company.ayrshareProfileKey, {
      scheduleDate: p.scheduled_at ? String(p.scheduled_at) : undefined,
      mediaUrls: p.media_url ? [String(p.media_url)] : undefined,
    });

    if (!result.ok) {
      failed.push({ id: String(p.id), reason: result.error ?? "publish failed" });
      await writeAudit({ companyId: cid, actorUserId: user.id, actorEmail: user.email, action: "social.schedule_failed", entityType: "post", entityId: String(p.id), payload: { error: result.error } });
      continue;
    }

    await supabase.from("iros_posts").update({ status: "scheduled", updated_at: new Date().toISOString() }).eq("id", p.id);
    await writeAudit({
      companyId: cid, actorUserId: user.id, actorEmail: user.email,
      action: result.scheduled ? "social.post_scheduled" : "social.post_published",
      entityType: "post", entityId: String(p.id),
      payload: { platform: p.platform, scheduledAt: p.scheduled_at, postUrl: result.postUrl ?? null, posted: result.posted },
    });
    scheduled++;
  }

  return { ok: true, scheduled, failed };
}
