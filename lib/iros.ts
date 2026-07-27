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
  platform: string;
  mediaUrl: string;
  theme: string;
  calendarBatch: string | null;
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
    platform: (r.platform as string) ?? "",
    mediaUrl: (r.media_url as string) ?? "",
    theme: (r.theme as string) ?? "",
    calendarBatch: r.calendar_batch ? String(r.calendar_batch) : null,
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

// Published posts for the Results/Proof page — reads the REAL first-class iros_posts
// table (status=published), not the legacy JSONB drafts collection. Returns just the
// display fields (title, when, where it went, who approved).
export interface PublishedPost {
  id: string;
  title: string;
  channels: string[];
  postUrl: string;
  postedAt: string | null;
}
export async function listPublishedPosts(): Promise<PublishedPost[]> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return [];
  const { data } = await supabase
    .from("iros_posts")
    .select("id, title, body, channels, post_url, posted_at, updated_at")
    .eq("company_id", cid)
    .eq("status", "published")
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(500);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: (r.title as string) || (r.body as string || "").slice(0, 80) || "Post",
    channels: (r.channels as string[]) ?? [],
    postUrl: (r.post_url as string) ?? "",
    postedAt: r.posted_at ? String(r.posted_at) : (r.updated_at ? String(r.updated_at) : null),
  }));
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

// Record a post that was published OUTSIDE the draft pipeline (e.g. Quick Post →
// publish now). Inserts a published iros_posts row so it shows in the Posts page's
// Published list. Best-effort: a failure here must not fail the actual publish.
export async function recordPublishedPost(input: {
  body: string;
  channels: string[];
  postUrl?: string;
  posted: boolean; // false = simulated (no live connection)
}): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const cid = await myCompanyId();
    if (!cid) return;
    const now = new Date().toISOString();
    await supabase.from("iros_posts").insert({
      company_id: cid,
      title: input.body.split("\n")[0].slice(0, 200),
      body: input.body.slice(0, 4000),
      channels: input.channels ?? [],
      platform: input.channels?.[0] ?? "",
      status: "published",
      posted_at: input.posted ? now : null,
      scheduled_at: now,
      post_url: input.postUrl ?? null,
      theme: "Quick Post",
      created_by: user?.id ?? null,
    });
  } catch { /* never block the real publish on a logging insert */ }
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

// Record an approval / counsel decision. Delegates to the canonical service
// (lib/services/posts.ts decidePost) — the gates (RED-needs-counsel, quiet
// period, counsel signature hash) live THERE now. This wrapper only resolves
// the browser session into an ActorContext, preserving the old signature for
// every existing route.
export async function recordApproval(input: {
  postId: string;
  stage: "approver" | "counsel";
  decision: "approved" | "rejected" | "changes";
  comment?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { resolveSessionActor } = await import("./services/context");
  const ctx = await resolveSessionActor();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const { decidePost } = await import("./services/posts");
  return decidePost(ctx, input);
}

// Bulk approve/reject for the Social Engine review screen. Delegates to the
// canonical service (lib/services/posts.ts bulkDecide) — one audited,
// per-post decision each, RED blocked, same result shape as before.
export async function bulkDecision(input: {
  postIds: string[];
  decision: "approved" | "rejected";
  ip?: string;
  userAgent?: string;
}): Promise<{ approved: number; rejected: number; skipped: { id: string; reason: string }[] }> {
  const { resolveSessionActor } = await import("./services/context");
  const ctx = await resolveSessionActor();
  if (!ctx) return { approved: 0, rejected: 0, skipped: input.postIds.map((id) => ({ id, reason: "Not signed in." })) };
  const { bulkDecide } = await import("./services/posts");
  return bulkDecide(ctx, input);
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
