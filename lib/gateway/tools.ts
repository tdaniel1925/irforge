import { createServiceClient } from "../supabase/server";
import { ServiceError, requireScope, type ActorContext, type Scope } from "../services/context";
import * as posts from "../services/posts";
import * as crm from "../services/crm";
import * as events from "../services/events";
import type { IrosPost } from "../iros";
import { createConfirmation, consumeConfirmation, contentHash } from "../services/confirmations";

// ── Gateway tool registry ──
// Every tool the integration gateway exposes, each declaring the scope it needs.
// Three shapes:
//   - read tools           → return data
//   - safe writes          → create drafts/notes/tasks (reversible, low-blast-radius)
//   - sensitive actions    → prepare_*/execute_* two-phase (approve, publish)
// The route dispatches by name; unknown names 404. Handlers receive the
// token-derived ActorContext and the request body's `input` object.

export interface ToolDef {
  scope: Scope;
  kind: "read" | "write" | "prepare" | "execute";
  handler: (ctx: ActorContext, input: Record<string, unknown>) => Promise<unknown>;
}

const str = (v: unknown, max = 4000) => String(v ?? "").slice(0, max);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

// Content hash for a post at prepare time — any body/status/classification
// change between prepare and execute invalidates the confirmation.
async function postContentHash(ctx: ActorContext, postId: string): Promise<{ hash: string; post: IrosPost | null }> {
  let post: IrosPost | null = null;
  try { post = await posts.getPost(ctx, postId); } catch { post = null; }
  const hash = post ? contentHash([post.id, post.body, post.status, post.classification]) : contentHash(["missing", postId]);
  return { hash, post };
}

async function companyStatus(ctx: ActorContext) {
  const svc = createServiceClient();
  const { data } = await svc.from("companies").select("name, ticker, quiet_mode, onboarding_complete").eq("id", ctx.companyId).maybeSingle();
  const now = new Date().toISOString();
  const { data: qp } = await svc.from("iros_disclosure_events").select("id, description, expires_at")
    .eq("company_id", ctx.companyId).eq("event_type", "quiet_period_start")
    .lte("effective_at", now).or(`expires_at.is.null,expires_at.gt.${now}`).limit(1);
  return {
    name: String(data?.name ?? ""), ticker: String(data?.ticker ?? ""),
    quietMode: Boolean(data?.quiet_mode), onboardingComplete: Boolean(data?.onboarding_complete),
    quietPeriodActive: (qp?.length ?? 0) > 0,
    quietPeriod: qp?.[0] ? { description: String(qp[0].description ?? ""), expiresAt: qp[0].expires_at ? String(qp[0].expires_at) : null } : null,
  };
}

export const TOOLS: Record<string, ToolDef> = {
  // ── Reads ──
  get_company_status: { scope: "company:read", kind: "read", handler: (ctx) => companyStatus(ctx) },
  get_quiet_period_status: { scope: "company:read", kind: "read", handler: async (ctx) => {
    const s = await companyStatus(ctx);
    return { active: s.quietPeriodActive, quietMode: s.quietMode, quietPeriod: s.quietPeriod };
  } },
  list_posts: { scope: "posts:read", kind: "read", handler: (ctx, i) => posts.listPosts(ctx, { status: i.status ? str(i.status, 20) : undefined, limit: Number(i.limit) || undefined }) },
  get_post: { scope: "posts:read", kind: "read", handler: (ctx, i) => posts.getPost(ctx, str(i.postId, 40)) },
  get_pending_approvals: { scope: "posts:read", kind: "read", handler: async (ctx) => {
    const [draft, reviewed] = await Promise.all([posts.listPosts(ctx, { status: "draft" }), posts.listPosts(ctx, { status: "reviewed" })]);
    return { needsApproval: [...draft, ...reviewed].filter((p) => p.body) };
  } },
  list_crm_contacts: { scope: "crm:read", kind: "read", handler: (ctx, i) => crm.listContacts(ctx, { search: i.search ? str(i.search, 100) : undefined, limit: Number(i.limit) || undefined }) },
  list_crm_tasks: { scope: "crm:read", kind: "read", handler: (ctx, i) => crm.listTasks(ctx, { openOnly: i.openOnly !== false, limit: Number(i.limit) || undefined }) },

  // ── Safe writes ──
  create_post_draft: { scope: "posts:write", kind: "write", handler: (ctx, i) => posts.createDraft(ctx, {
    title: str(i.title, 200), body: str(i.body), channels: arr(i.channels), theme: str(i.theme, 120),
  }) },
  update_post_draft: { scope: "posts:write", kind: "write", handler: (ctx, i) => posts.updateDraft(ctx, str(i.postId, 40), {
    title: i.title !== undefined ? str(i.title, 200) : undefined,
    body: i.body !== undefined ? str(i.body) : undefined,
  }) },
  create_crm_note: { scope: "crm:write", kind: "write", handler: (ctx, i) => crm.createContactNote(ctx, { contactId: str(i.contactId, 40), body: str(i.body) }) },
  create_crm_task: { scope: "crm:write", kind: "write", handler: (ctx, i) => crm.createTask(ctx, {
    title: str(i.title, 300), dueDate: i.dueDate ? str(i.dueDate, 30) : null, contactId: i.contactId ? str(i.contactId, 40) : null,
  }) },

  // ── Notifications (outbound event subscription) ──
  register_event_callback: { scope: "events:manage", kind: "write", handler: (ctx, i) => events.registerEventCallback(ctx, str(i.callbackUrl, 500)) },
  set_notifications: { scope: "events:manage", kind: "write", handler: (ctx, i) => events.setNotifications(ctx, i.enabled !== false) },
  get_notification_status: { scope: "events:manage", kind: "read", handler: (ctx) => events.getNotificationStatus(ctx) },

  // ── Sensitive: approve content (two-phase) ──
  prepare_approve_content: { scope: "posts:approve", kind: "prepare", handler: async (ctx, i) => {
    const postId = str(i.postId, 40);
    const { hash, post } = await postContentHash(ctx, postId);
    if (!post) throw new ServiceError("not_found", "Post not found.");
    const warnings: string[] = [];
    if (post.classification === "red") warnings.push("RED post — requires counsel sign-off, not plain approval.");
    if (post.classification === "yellow") warnings.push("YELLOW post — blocked during a quiet period.");
    const { confirmationId, expiresAt } = await createConfirmation(ctx, {
      action: "approve_content", params: { postId, stage: "approver" }, contentHash: hash,
    });
    return {
      proposed: { action: "approve_content", postId, title: post.title, classification: post.classification, currentStatus: post.status },
      warnings, confirmationId, expiresAt, contentHash: hash,
    };
  } },
  execute_approve_content: { scope: "posts:approve", kind: "execute", handler: async (ctx, i) => {
    const confirmationId = str(i.confirmationId, 40);
    const postId = str(i.postId, 40);
    const { hash } = await postContentHash(ctx, postId);
    const params = await consumeConfirmation(ctx, { confirmationId, action: "approve_content", currentContentHash: hash });
    return posts.decidePost(ctx, { postId: String(params.postId ?? postId), stage: "approver", decision: "approved", ip: str(i.ip, 60) || undefined, userAgent: str(i.userAgent, 300) || undefined });
  } },

  // ── Sensitive: publish content (two-phase) ──
  prepare_publish_content: { scope: "posts:publish", kind: "prepare", handler: async (ctx) => {
    const status = await companyStatus(ctx);
    const approved = await posts.listPosts(ctx, { status: "approved" });
    const warnings: string[] = [];
    if (status.quietMode) warnings.push("Quiet mode is ON — publishing is currently suspended.");
    if (!approved.length) warnings.push("No approved posts are queued to publish.");
    // Hash over the set of approved post ids+bodies: if the queue changes, the
    // confirmation is invalidated.
    const hash = contentHash(approved.map((p) => [p.id, p.body, p.status]));
    const { confirmationId, expiresAt } = await createConfirmation(ctx, {
      action: "publish_content", params: { count: approved.length }, contentHash: hash,
    });
    return {
      proposed: { action: "publish_content", approvedCount: approved.length, posts: approved.map((p) => ({ id: p.id, title: p.title, channels: p.channels })) },
      warnings, confirmationId, expiresAt, contentHash: hash,
    };
  } },
  execute_publish_content: { scope: "posts:publish", kind: "execute", handler: async (ctx, i) => {
    const confirmationId = str(i.confirmationId, 40);
    const approved = await posts.listPosts(ctx, { status: "approved" });
    const hash = contentHash(approved.map((p) => [p.id, p.body, p.status]));
    await consumeConfirmation(ctx, { confirmationId, action: "publish_content", currentContentHash: hash });
    // The idempotency key defends against a network retry AFTER the confirmation
    // was consumed (the confirmation itself is already single-use).
    const { result, replayed } = await posts.publishApproved(ctx, { idempotencyKey: str(i.idempotencyKey, 200) || confirmationId });
    return { ...result, replayed };
  } },
};

export function getTool(name: string): ToolDef | null {
  return Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : null;
}
