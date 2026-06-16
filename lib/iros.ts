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

  // During an active quiet period, RED/YELLOW posts can't be approved at all —
  // and even counsel sign-off is blocked (no selective disclosure in the window).
  if (input.decision === "approved" && (post.classification === "red" || post.classification === "yellow")) {
    if (await isQuietPeriodActive()) {
      return { ok: false, error: "A quiet period is active — sensitive (yellow/red) posts can't be approved until it ends." };
    }
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
    // Counsel sign-off is final — it always lands on 'approved' (one click, even
    // straight from draft). An approver advancing a draft lands on 'reviewed'.
    const target = input.stage === "counsel" ? "approved" : post.status === "draft" ? "reviewed" : "approved";
    await supabase.from("iros_posts").update({ status: target, updated_at: ts }).eq("id", input.postId);
  } else if (input.decision === "changes" || input.decision === "rejected") {
    // Mark rejected posts as pulled (distinct from a change-request, which returns to draft).
    const target = input.decision === "rejected" ? "pulled" : "draft";
    await supabase.from("iros_posts").update({ status: target, updated_at: ts }).eq("id", input.postId);
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

// ── Voice profiles ──
export interface VoiceProfile {
  id: string;
  name: string;
  roleTitle: string;
  guidance: string;
  styleExamples: string[];
  forbiddenPhrases: string[];
  active: boolean;
}

function rowToVoice(r: Record<string, unknown>): VoiceProfile {
  return {
    id: String(r.id),
    name: (r.name as string) ?? "",
    roleTitle: (r.role_title as string) ?? "",
    guidance: (r.guidance as string) ?? "",
    styleExamples: (r.style_examples as string[]) ?? [],
    forbiddenPhrases: (r.forbidden_phrases as string[]) ?? [],
    active: Boolean(r.active),
  };
}

export async function listVoices(): Promise<VoiceProfile[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase.from("iros_voice_profiles").select("*").eq("company_id", cid).order("created_at", { ascending: true });
  return (data ?? []).map(rowToVoice);
}

export async function getVoice(id: string): Promise<VoiceProfile | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("iros_voice_profiles").select("*").eq("id", id).maybeSingle();
  return data ? rowToVoice(data) : null;
}

export async function upsertVoice(input: Partial<VoiceProfile> & { id?: string }): Promise<VoiceProfile | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid) return null;
  const row = {
    company_id: cid,
    name: (input.name ?? "").slice(0, 120),
    role_title: (input.roleTitle ?? "").slice(0, 80),
    guidance: (input.guidance ?? "").slice(0, 2000),
    style_examples: (input.styleExamples ?? []).slice(0, 5),
    forbidden_phrases: (input.forbiddenPhrases ?? []).slice(0, 30),
    active: input.active ?? true,
  };
  let data;
  if (input.id) {
    ({ data } = await supabase.from("iros_voice_profiles").update(row).eq("id", input.id).select("*").single());
  } else {
    ({ data } = await supabase.from("iros_voice_profiles").insert(row).select("*").single());
  }
  if (data) await writeAudit({ companyId: cid, actorUserId: user?.id, actorEmail: user?.email, action: input.id ? "voice.updated" : "voice.created", entityType: "voice", entityId: String(data.id) });
  return data ? rowToVoice(data) : null;
}

export async function deleteVoice(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("iros_voice_profiles").delete().eq("id", id);
}

// ── Stakeholders ──
export interface Stakeholder {
  id: string; fullName: string; title: string; org: string; category: string;
  topics: string[]; email: string; linkedinUrl: string; xHandle: string; notes: string; lastTouchAt: string | null;
}
function rowToStakeholder(r: Record<string, unknown>): Stakeholder {
  return {
    id: String(r.id), fullName: (r.full_name as string) ?? "", title: (r.title as string) ?? "",
    org: (r.org as string) ?? "", category: (r.category as string) ?? "other",
    topics: (r.topics as string[]) ?? [], email: (r.email as string) ?? "",
    linkedinUrl: (r.linkedin_url as string) ?? "", xHandle: (r.x_handle as string) ?? "",
    notes: (r.notes as string) ?? "", lastTouchAt: r.last_touch_at ? String(r.last_touch_at) : null,
  };
}

export async function listStakeholders(): Promise<Stakeholder[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase.from("iros_stakeholders").select("*").eq("company_id", cid).order("last_touch_at", { ascending: false, nullsFirst: false }).limit(2000);
  return (data ?? []).map(rowToStakeholder);
}

export async function upsertStakeholder(input: Partial<Stakeholder> & { id?: string }): Promise<Stakeholder | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid) return null;
  const row = {
    company_id: cid,
    full_name: (input.fullName ?? "").slice(0, 120),
    title: (input.title ?? "").slice(0, 120),
    org: (input.org ?? "").slice(0, 120),
    category: input.category ?? "other",
    topics: (input.topics ?? []).slice(0, 20),
    email: (input.email ?? "").slice(0, 200),
    linkedin_url: (input.linkedinUrl ?? "").slice(0, 300),
    x_handle: (input.xHandle ?? "").slice(0, 60),
    notes: (input.notes ?? "").slice(0, 2000),
  };
  let data;
  if (input.id) ({ data } = await supabase.from("iros_stakeholders").update(row).eq("id", input.id).select("*").single());
  else ({ data } = await supabase.from("iros_stakeholders").insert(row).select("*").single());
  if (data) await writeAudit({ companyId: cid, actorUserId: user?.id, actorEmail: user?.email, action: input.id ? "stakeholder.updated" : "stakeholder.created", entityType: "stakeholder", entityId: String(data.id) });
  return data ? rowToStakeholder(data) : null;
}

export async function deleteStakeholder(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("iros_stakeholders").delete().eq("id", id);
}

// ── Interactions (inbound/outbound log) ──
export interface Interaction {
  id: string; stakeholderId: string | null; channel: string; direction: string;
  summary: string; body: string; status: string; suggestedOwner: string; suggestedReply: string; occurredAt: string;
}
function rowToInteraction(r: Record<string, unknown>): Interaction {
  return {
    id: String(r.id), stakeholderId: r.stakeholder_id ? String(r.stakeholder_id) : null,
    channel: (r.channel as string) ?? "other", direction: (r.direction as string) ?? "inbound",
    summary: (r.summary as string) ?? "", body: (r.body as string) ?? "", status: (r.status as string) ?? "open",
    suggestedOwner: (r.suggested_owner as string) ?? "", suggestedReply: (r.suggested_reply as string) ?? "",
    occurredAt: String(r.occurred_at ?? ""),
  };
}

export async function listInteractions(): Promise<Interaction[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase.from("iros_interactions").select("*").eq("company_id", cid).order("occurred_at", { ascending: false }).limit(500);
  return (data ?? []).map(rowToInteraction);
}

export async function addInteraction(input: { stakeholderId?: string | null; channel: string; direction: string; summary: string; body?: string; suggestedOwner?: string; suggestedReply?: string }): Promise<Interaction | null> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return null;
  const { data } = await supabase.from("iros_interactions").insert({
    company_id: cid,
    stakeholder_id: input.stakeholderId ?? null,
    channel: input.channel,
    direction: input.direction,
    summary: input.summary.slice(0, 300),
    body: (input.body ?? "").slice(0, 4000),
    suggested_owner: (input.suggestedOwner ?? "").slice(0, 120),
    suggested_reply: (input.suggestedReply ?? "").slice(0, 2000),
  }).select("*").single();
  // bump stakeholder last_touch
  if (data && input.stakeholderId) await supabase.from("iros_stakeholders").update({ last_touch_at: new Date().toISOString() }).eq("id", input.stakeholderId);
  return data ? rowToInteraction(data) : null;
}

export async function setInteractionStatus(id: string, status: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("iros_interactions").update({ status }).eq("id", id);
}

// ── Intelligence: roll up the company's IR-OS activity ──
export interface IrosMetrics {
  postsByStatus: Record<string, number>;
  classByLevel: Record<string, number>;
  publishedLast7: number;
  inboundOpen: number;
  inboundLast7: number;
  stakeholders: number;
  quietActive: boolean;
}

export async function getMetrics(): Promise<IrosMetrics> {
  const [posts, interactions, stakeholders, quietActive] = await Promise.all([
    listPosts(), listInteractions(), listStakeholders(), isQuietPeriodActive(),
  ]);
  const weekAgo = Date.now() - 7 * 86400e3;
  const postsByStatus: Record<string, number> = {};
  const classByLevel: Record<string, number> = { green: 0, yellow: 0, red: 0 };
  let publishedLast7 = 0;
  for (const p of posts) {
    postsByStatus[p.status] = (postsByStatus[p.status] ?? 0) + 1;
    if (p.classification && classByLevel[p.classification] !== undefined) classByLevel[p.classification]++;
    if (p.status === "published" && new Date(p.createdAt).getTime() >= weekAgo) publishedLast7++;
  }
  const inboundOpen = interactions.filter((i) => i.direction === "inbound" && i.status === "open").length;
  const inboundLast7 = interactions.filter((i) => new Date(i.occurredAt).getTime() >= weekAgo).length;
  return { postsByStatus, classByLevel, publishedLast7, inboundOpen, inboundLast7, stakeholders: stakeholders.length, quietActive };
}
