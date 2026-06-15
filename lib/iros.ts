import crypto from "crypto";
import { createServerSupabase } from "./supabase/server";
import { getMyCompany } from "./supabase/store";
import { writeAudit } from "./platform";

// IR-OS data layer: posts pipeline, Reg FD approvals + counsel e-signature,
// disclosure events / quiet periods. All RLS-scoped to the caller's company.

export interface IrosPost {
  id: string;
  title: string;
  body: string;
  channels: string[];
  scheduledAt: string | null;
  status: string;
  classification: string | null;
  classConfidence: number | null;
  classFlags: string[];
  classReason: string;
  voiceProfileId: string | null;
  createdAt: string;
}

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
    createdAt: String(r.created_at ?? ""),
  };
}

// Resolve the caller's company id, or null if not an authed company.
async function myCompanyId(): Promise<string | null> {
  const mine = await getMyCompany();
  return mine?.id ?? null;
}

export async function listPosts(): Promise<IrosPost[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase
    .from("iros_posts")
    .select("*")
    .eq("company_id", cid)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map(rowToPost);
}

export async function getPost(id: string): Promise<IrosPost | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("iros_posts").select("*").eq("id", id).maybeSingle();
  return data ? rowToPost(data) : null;
}

export async function createPost(input: { title: string; body: string; channels?: string[]; scheduledAt?: string | null; voiceProfileId?: string | null }): Promise<IrosPost | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid || !user) return null;
  const { data } = await supabase
    .from("iros_posts")
    .insert({
      company_id: cid,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 4000),
      channels: input.channels ?? [],
      scheduled_at: input.scheduledAt ?? null,
      voice_profile_id: input.voiceProfileId ?? null,
      status: "draft",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (data) {
    await writeAudit({ companyId: cid, actorUserId: user.id, actorEmail: user.email, action: "post.created", entityType: "post", entityId: String(data.id) });
  }
  return data ? rowToPost(data) : null;
}

export async function updatePostFields(id: string, patch: Record<string, unknown>): Promise<IrosPost | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("iros_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  return data ? rowToPost(data) : null;
}

// Save a Reg FD classification result onto the post.
export async function saveClassification(id: string, c: { classification: string; confidence: number; flags: string[]; reasoning: string }): Promise<void> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const post = await getPost(id);
  await supabase.from("iros_posts").update({
    classification: c.classification,
    class_confidence: c.confidence,
    class_flags: c.flags,
    class_reason: c.reasoning,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  await writeAudit({
    companyId: post ? (await myCompanyId()) : null,
    actorUserId: user?.id,
    actorEmail: user?.email,
    action: `post.classified_${c.classification}`,
    entityType: "post",
    entityId: id,
    payload: { confidence: c.confidence, flags: c.flags },
  });
}

// Valid status transitions (state machine). Illegal moves are rejected.
const TRANSITIONS: Record<string, string[]> = {
  draft: ["reviewed", "pulled"],
  reviewed: ["approved", "pulled", "draft"],
  approved: ["scheduled", "published", "pulled"],
  scheduled: ["published", "pulled"],
  published: ["pulled"],
  pulled: ["draft"],
};
export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

// Record an approval / counsel decision. For RED posts at the counsel stage we
// capture a tamper-evident signature (hash of body+decision+ts+actor + ip/ua).
export async function recordApproval(input: {
  postId: string;
  stage: "approver" | "counsel";
  decision: "approved" | "rejected" | "changes";
  comment?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid || !user) return { ok: false, error: "Not signed in." };

  const post = await getPost(input.postId);
  if (!post) return { ok: false, error: "Post not found." };

  // RED posts cannot be approved without a counsel decision.
  if (post.classification === "red" && input.stage === "approver" && input.decision === "approved") {
    return { ok: false, error: "RED posts require counsel sign-off before approval." };
  }

  const ts = new Date().toISOString();
  let signatureHash: string | null = null;
  if (post.classification === "red" && input.stage === "counsel") {
    signatureHash = crypto
      .createHash("sha256")
      .update(`${post.body}|${input.decision}|${ts}|${user.id}`)
      .digest("hex");
  }

  await supabase.from("iros_approvals").insert({
    post_id: input.postId,
    company_id: cid,
    stage: input.stage,
    decision: input.decision,
    comment: (input.comment ?? "").slice(0, 1000),
    actor_user_id: user.id,
    actor_email: user.email,
    signature_hash: signatureHash,
    signature_ip: input.ip ?? null,
    signature_ua: input.userAgent ?? null,
  });

  // Advance / revert the post status based on the decision.
  if (input.decision === "approved") {
    const target = post.status === "draft" ? "reviewed" : "approved";
    await supabase.from("iros_posts").update({ status: target, updated_at: ts }).eq("id", input.postId);
  } else if (input.decision === "changes" || input.decision === "rejected") {
    await supabase.from("iros_posts").update({ status: "draft", updated_at: ts }).eq("id", input.postId);
  }

  await writeAudit({
    companyId: cid,
    actorUserId: user.id,
    actorEmail: user.email,
    action: signatureHash ? "approval.signed" : `approval.${input.decision}`,
    entityType: "approval",
    entityId: input.postId,
    payload: { stage: input.stage, decision: input.decision, classification: post.classification, signatureHash },
  });

  return { ok: true };
}

// ── Quiet periods / disclosure events ──
export async function isQuietPeriodActive(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return false;
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("iros_disclosure_events")
    .select("id")
    .eq("company_id", cid)
    .eq("event_type", "quiet_period_start")
    .lte("effective_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function startQuietPeriod(description: string, expiresAt: string | null): Promise<void> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid) return;
  await supabase.from("iros_disclosure_events").insert({
    company_id: cid,
    event_type: "quiet_period_start",
    description: description.slice(0, 300),
    expires_at: expiresAt,
    created_by: user?.id ?? null,
  });
  await writeAudit({ companyId: cid, actorUserId: user?.id, actorEmail: user?.email, action: "quiet_period.started", entityType: "quiet_period", payload: { description, expiresAt } });
}

export async function endQuietPeriods(): Promise<void> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid) return;
  const now = new Date().toISOString();
  // Expire all currently-open quiet periods.
  await supabase
    .from("iros_disclosure_events")
    .update({ expires_at: now })
    .eq("company_id", cid)
    .eq("event_type", "quiet_period_start")
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  await writeAudit({ companyId: cid, actorUserId: user?.id, actorEmail: user?.email, action: "quiet_period.ended", entityType: "quiet_period" });
}
