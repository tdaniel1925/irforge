import crypto from "crypto";
import { createServiceClient } from "../supabase/server";
import { rowToCompany } from "../supabase/store";
import { writeAudit } from "../platform";
import { canTransition, type IrosPost } from "../iros";
import { buildChannelPost, CHANNEL_LIMITS } from "../compliance";
import { publishPerChannel } from "../ayrshare";
import { ServiceError, requireScope, type ActorContext } from "./context";
import { withIdempotency, type IdemResult } from "./idempotency";
import type { Company } from "../types";

// ── Canonical posts / approvals / publishing service ──
//
// THE single implementation of the post pipeline's business rules. The legacy
// session functions in lib/iros.ts and lib/social/calendar.ts delegate here
// (session → ActorContext), and the Phase 3 gateway will call here directly
// (token → ActorContext). Rules enforced in this file, nowhere else:
//
//   - every query explicitly scoped to ctx.companyId (the service-role client
//     NEVER implies authorization — an id from another tenant is a not_found)
//   - scope checks per operation (read / write / approve / publish)
//   - status state machine (canTransition) — no route can skip a stage
//   - RED requires counsel; quiet period blocks YELLOW/RED approval
//   - quiet MODE blocks all publishing; disclosures appended in the publish
//     path only (never editable out); channel caps skip, never truncate
//   - audit record for every write, stamped with ctx.requestId + authMethod

function rowToPost(r: Record<string, unknown>): IrosPost {
  return {
    id: String(r.id),
    title: (r.title as string) ?? "",
    body: (r.body as string) ?? "",
    channels: (r.channels as string[]) ?? [],
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    status: (r.status as string) ?? "draft",
    classification: r.classification ? String(r.classification) : null,
    classConfidence: r.class_confidence != null ? Number(r.class_confidence) : null,
    classFlags: (r.class_flags as string[]) ?? [],
    classReason: (r.class_reason as string) ?? "",
    voiceProfileId: r.voice_profile_id ? String(r.voice_profile_id) : null,
    platform: (r.platform as string) ?? "",
    mediaUrl: (r.media_url as string) ?? "",
    theme: (r.theme as string) ?? "",
    calendarBatch: r.calendar_batch ? String(r.calendar_batch) : null,
    createdAt: String(r.created_at ?? ""),
  };
}

function audit(ctx: ActorContext, action: string, entityType: string, entityId: string | undefined, payload?: Record<string, unknown>) {
  return writeAudit({
    companyId: ctx.companyId,
    actorUserId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    action,
    entityType,
    entityId,
    payload: { ...(payload ?? {}), requestId: ctx.requestId, authMethod: ctx.authMethod },
  });
}

// Company-scoped fetch — an id belonging to another tenant is indistinguishable
// from a missing row.
async function fetchPost(ctx: ActorContext, id: string): Promise<Record<string, unknown> | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("iros_posts").select("*").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  return data ?? null;
}

async function fetchCompany(ctx: ActorContext): Promise<Company> {
  const svc = createServiceClient();
  const { data } = await svc.from("companies").select("*").eq("id", ctx.companyId).maybeSingle();
  if (!data) throw new ServiceError("not_found", "Company not found.");
  return rowToCompany(data);
}

async function quietPeriodActive(ctx: ActorContext): Promise<boolean> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const { data } = await svc
    .from("iros_disclosure_events")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("event_type", "quiet_period_start")
    .lte("effective_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Reads ──

export async function listPosts(ctx: ActorContext, opts?: { status?: string; limit?: number }): Promise<IrosPost[]> {
  requireScope(ctx, "posts:read");
  const svc = createServiceClient();
  let q = svc.from("iros_posts").select("*").eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(Math.min(opts?.limit ?? 500, 500));
  if (opts?.status) q = q.eq("status", opts.status);
  const { data } = await q;
  return (data ?? []).map(rowToPost);
}

export async function getPost(ctx: ActorContext, id: string): Promise<IrosPost> {
  requireScope(ctx, "posts:read");
  const row = await fetchPost(ctx, id);
  if (!row) throw new ServiceError("not_found", "Post not found.");
  return rowToPost(row);
}

// ── Drafts ──

export async function createDraft(ctx: ActorContext, input: { title: string; body: string; channels?: string[]; scheduledAt?: string | null; theme?: string }): Promise<IrosPost> {
  requireScope(ctx, "posts:write");
  if (!input.body?.trim()) throw new ServiceError("invalid", "Body is required.");
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("iros_posts")
    .insert({
      company_id: ctx.companyId,
      title: (input.title ?? "").slice(0, 200),
      body: input.body.slice(0, 4000),
      channels: input.channels ?? [],
      scheduled_at: input.scheduledAt ?? null,
      theme: (input.theme ?? "").slice(0, 120),
      status: "draft",
      created_by: ctx.actorId,
    })
    .select("*")
    .single();
  if (error || !data) throw new ServiceError("invalid", error?.message ?? "Couldn't create the draft.");
  await audit(ctx, "post.created", "post", String(data.id));
  return rowToPost(data);
}

export async function updateDraft(ctx: ActorContext, id: string, patch: { title?: string; body?: string; scheduledAt?: string | null }): Promise<IrosPost> {
  requireScope(ctx, "posts:write");
  const row = await fetchPost(ctx, id);
  if (!row) throw new ServiceError("not_found", "Post not found.");
  const status = String(row.status);
  // Approval integrity (same rule the review route enforces): only pre-approval
  // content is editable. Approved+ must be pulled back to draft first.
  if (status !== "draft" && status !== "reviewed") {
    throw new ServiceError("conflict", `A ${status} post can't be edited — pull it back to draft first.`);
  }
  const svc = createServiceClient();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) upd.title = patch.title.slice(0, 200);
  if (patch.body !== undefined) upd.body = patch.body.slice(0, 4000);
  if (patch.scheduledAt !== undefined) upd.scheduled_at = patch.scheduledAt;
  const { data, error } = await svc.from("iros_posts").update(upd).eq("id", id).eq("company_id", ctx.companyId).select("*").single();
  if (error || !data) throw new ServiceError("invalid", error?.message ?? "Couldn't update the post.");
  await audit(ctx, "post.updated", "post", id, { fields: Object.keys(patch) });
  return rowToPost(data);
}

// ── Approvals ──
// Ports lib/iros.ts recordApproval verbatim (gates + signature), parameterized
// by ActorContext. Business outcomes are results, not exceptions.

export async function decidePost(ctx: ActorContext, input: {
  postId: string;
  stage: "approver" | "counsel";
  decision: "approved" | "rejected" | "changes";
  comment?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: boolean; error?: string }> {
  requireScope(ctx, "posts:approve");
  const row = await fetchPost(ctx, input.postId);
  if (!row) return { ok: false, error: "Post not found." };
  const post = rowToPost(row);

  // RED posts cannot be approved without a counsel decision.
  if (post.classification === "red" && input.stage === "approver" && input.decision === "approved") {
    return { ok: false, error: "RED posts require counsel sign-off before approval." };
  }

  // During an active quiet period, RED/YELLOW posts can't be approved at all.
  if (input.decision === "approved" && (post.classification === "red" || post.classification === "yellow")) {
    if (await quietPeriodActive(ctx)) {
      return { ok: false, error: "A quiet period is active — sensitive (yellow/red) posts can't be approved until it ends." };
    }
  }

  const svc = createServiceClient();
  const ts = new Date().toISOString();
  let signatureHash: string | null = null;
  if (post.classification === "red" && input.stage === "counsel") {
    signatureHash = crypto.createHash("sha256").update(`${post.body}|${input.decision}|${ts}|${ctx.actorId}`).digest("hex");
  }

  await svc.from("iros_approvals").insert({
    post_id: input.postId,
    company_id: ctx.companyId,
    stage: input.stage,
    decision: input.decision,
    comment: (input.comment ?? "").slice(0, 1000),
    actor_user_id: ctx.actorId,
    actor_email: ctx.actorEmail,
    signature_hash: signatureHash,
    signature_ip: input.ip ?? null,
    signature_ua: input.userAgent ?? null,
  });

  // Advance / revert per the state machine (validated, not assumed).
  let target: string | null = null;
  if (input.decision === "approved") {
    target = input.stage === "counsel" ? "approved" : post.status === "draft" ? "reviewed" : "approved";
  } else if (input.decision === "changes" || input.decision === "rejected") {
    target = input.decision === "rejected" ? "pulled" : "draft";
  }
  if (target && target !== post.status) {
    // Counsel sign-off may land straight on approved from draft (one-click, by
    // design); other moves must be legal transitions.
    const counselShortcut = input.stage === "counsel" && input.decision === "approved";
    if (!counselShortcut && !canTransition(post.status, target)) {
      return { ok: false, error: `Illegal status move ${post.status} → ${target}.` };
    }
    await svc.from("iros_posts").update({ status: target, updated_at: ts }).eq("id", input.postId).eq("company_id", ctx.companyId);
  }

  await audit(ctx, signatureHash ? "approval.signed" : `approval.${input.decision}`, "approval", input.postId, {
    stage: input.stage, decision: input.decision, classification: post.classification, signatureHash,
  });
  return { ok: true };
}

export async function bulkDecide(ctx: ActorContext, input: {
  postIds: string[];
  decision: "approved" | "rejected";
  ip?: string;
  userAgent?: string;
}): Promise<{ approved: number; rejected: number; skipped: { id: string; reason: string }[] }> {
  requireScope(ctx, "posts:approve");
  const out = { approved: 0, rejected: 0, skipped: [] as { id: string; reason: string }[] };
  const svc = createServiceClient();
  const ts = new Date().toISOString();

  for (const id of input.postIds.slice(0, 200)) {
    const row = await fetchPost(ctx, id);
    if (!row) { out.skipped.push({ id, reason: "not found" }); continue; }
    const post = rowToPost(row);

    if (input.decision === "rejected") {
      const r = await decidePost(ctx, { postId: id, stage: "approver", decision: "rejected" });
      if (r.ok) out.rejected++; else out.skipped.push({ id, reason: r.error ?? "rejected failed" });
      continue;
    }

    if (post.classification === "red") {
      out.skipped.push({ id, reason: "RED — needs counsel sign-off" });
      continue;
    }
    const r = await decidePost(ctx, { postId: id, stage: "approver", decision: "approved", ip: input.ip, userAgent: input.userAgent });
    if (!r.ok) { out.skipped.push({ id, reason: r.error ?? "approve failed" }); continue; }
    // decidePost lands a draft on 'reviewed'; finish the one-action approve by
    // advancing to 'approved' (a second audited step).
    const fresh = await fetchPost(ctx, id);
    if (fresh && String(fresh.status) === "reviewed") {
      await svc.from("iros_posts").update({ status: "approved", updated_at: ts }).eq("id", id).eq("company_id", ctx.companyId);
      await audit(ctx, "approval.advanced", "post", id, { from: "reviewed", to: "approved" });
    }
    out.approved++;
  }
  return out;
}

// ── Publishing ──
// Ports lib/social/calendar.ts scheduleApprovedPosts, parameterized by ctx and
// wrapped in idempotency: a retry with the same key returns the stored result
// instead of double-publishing to Ayrshare.

export interface PublishResult { ok: boolean; error?: string; scheduled: number; failed: { id: string; reason: string }[] }

export async function publishApproved(ctx: ActorContext, opts?: { batchId?: string; idempotencyKey?: string }): Promise<IdemResult<PublishResult>> {
  requireScope(ctx, "posts:publish");
  return withIdempotency(ctx, "publish_approved", opts?.idempotencyKey, async (): Promise<PublishResult> => {
    const svc = createServiceClient();
    const company = await fetchCompany(ctx);

    // Quiet mode suspends ALL publishing — same gate as the rest of the app.
    if (company.quietMode) {
      return { ok: false, error: "Quiet mode is ON — publishing is suspended. Turn it off to schedule.", scheduled: 0, failed: [] };
    }

    // Latest calendar batch unless one was named explicitly.
    let batchId = opts?.batchId;
    if (!batchId) {
      const { data: latest } = await svc
        .from("iros_posts")
        .select("calendar_batch, created_at")
        .eq("company_id", ctx.companyId)
        .not("calendar_batch", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      batchId = latest?.[0]?.calendar_batch ? String(latest[0].calendar_batch) : undefined;
    }
    if (!batchId) return { ok: false, error: "No calendar to schedule.", scheduled: 0, failed: [] };

    const { data: approved } = await svc
      .from("iros_posts")
      .select("id, body, channels, platform, media_url, scheduled_at, classification")
      .eq("company_id", ctx.companyId)
      .eq("calendar_batch", batchId)
      .eq("status", "approved");

    const todo = approved ?? [];
    if (!todo.length) return { ok: true, scheduled: 0, failed: [] };

    const failed: { id: string; reason: string }[] = [];
    let scheduled = 0;

    for (const p of todo) {
      // Defense in depth: RED should never reach 'approved' — never schedule one anyway.
      if (p.classification === "red") { failed.push({ id: String(p.id), reason: "RED — needs counsel sign-off" }); continue; }
      const channels = (p.channels as string[]) ?? [];
      if (!channels.length) { failed.push({ id: String(p.id), reason: "no channel" }); continue; }

      // Mandatory disclosures appended per channel; over-cap channels are
      // skipped and reported, never sent truncated.
      const bodies: Record<string, string> = {};
      const overLimit: string[] = [];
      for (const ch of channels) {
        const text = buildChannelPost(String(p.body), company, ch);
        if (text.length > (CHANNEL_LIMITS[ch] ?? 5000)) { overLimit.push(ch); continue; }
        bodies[ch] = text;
      }
      if (Object.keys(bodies).length === 0) {
        failed.push({ id: String(p.id), reason: `over the character limit for ${overLimit.join(", ")}` });
        await svc.from("iros_posts").update({ publish_error: `Over the character limit for ${overLimit.join(", ")} — shorten the post.`.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", p.id).eq("company_id", ctx.companyId);
        continue;
      }

      const result = await publishPerChannel(bodies, company.ayrshareProfileKey, {
        scheduleDate: p.scheduled_at ? String(p.scheduled_at) : undefined,
        mediaUrls: p.media_url ? [String(p.media_url)] : undefined,
      });

      if (!result.ok) {
        failed.push({ id: String(p.id), reason: result.error ?? "publish failed" });
        await svc.from("iros_posts").update({ publish_error: (result.error ?? "publish failed").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", p.id).eq("company_id", ctx.companyId);
        await audit(ctx, "social.schedule_failed", "post", String(p.id), { error: result.error });
        continue;
      }

      await svc.from("iros_posts").update({
        status: result.posted ? "published" : "scheduled",
        ayr_post_id: result.externalId ?? "",
        post_url: result.postUrl ?? "",
        publish_error: overLimit.length ? `Skipped ${overLimit.join(", ")} — over the character limit.`.slice(0, 500) : "",
        posted_at: result.posted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", p.id).eq("company_id", ctx.companyId);
      await audit(ctx, result.scheduled ? "social.post_scheduled" : "social.post_published", "post", String(p.id), {
        platform: p.platform, scheduledAt: p.scheduled_at, postUrl: result.postUrl ?? null, ayrPostId: result.externalId ?? null, posted: result.posted,
      });
      scheduled++;
    }

    return { ok: true, scheduled, failed };
  });
}
