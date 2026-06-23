import { createServerSupabase } from "../supabase/server";
import { getMyCompany } from "../supabase/store";
import { writeAudit } from "../platform";
import { getStore } from "../db";
import type { Company, Filing } from "../types";

// Social Content Engine — strategy layer.
// One strategy per company: the interview output (goals, audience, tone, themes,
// platforms, cadence, do/don't) that seeds calendar + draft generation. All
// RLS-scoped to the caller's company. See docs/social-engine-plan.md.

export interface SocialStrategy {
  id: string;
  goals: string;
  audience: string;
  tone: string;
  themes: string[];
  platforms: string[]; // ayrshare channel keys
  postsPerWeek: number;
  dos: string[];
  donts: string[];
  voiceProfileId: string | null;
  interviewComplete: boolean;
}

function rowToStrategy(r: Record<string, unknown>): SocialStrategy {
  return {
    id: String(r.id),
    goals: (r.goals as string) ?? "",
    audience: (r.audience as string) ?? "",
    tone: (r.tone as string) ?? "professional",
    themes: (r.themes as string[]) ?? [],
    platforms: (r.platforms as string[]) ?? [],
    postsPerWeek: r.posts_per_week != null ? Number(r.posts_per_week) : 3,
    dos: (r.dos as string[]) ?? [],
    donts: (r.donts as string[]) ?? [],
    voiceProfileId: r.voice_profile_id ? String(r.voice_profile_id) : null,
    interviewComplete: Boolean(r.interview_complete),
  };
}

async function myCompanyId(): Promise<string | null> {
  const mine = await getMyCompany();
  return mine?.id ?? null;
}

export async function getStrategy(): Promise<SocialStrategy | null> {
  const supabase = await createServerSupabase();
  const cid = await myCompanyId();
  if (!cid) return null;
  const { data } = await supabase.from("social_strategy").select("*").eq("company_id", cid).maybeSingle();
  return data ? rowToStrategy(data) : null;
}

// Upsert the single strategy row for the caller's company. Partial — only the
// provided fields are written; the rest keep their stored defaults.
export async function saveStrategy(input: Partial<SocialStrategy>): Promise<SocialStrategy | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const cid = await myCompanyId();
  if (!cid || !user) return null;

  const row: Record<string, unknown> = { company_id: cid, updated_at: new Date().toISOString() };
  if (input.goals !== undefined) row.goals = input.goals.slice(0, 2000);
  if (input.audience !== undefined) row.audience = input.audience.slice(0, 1000);
  if (input.tone !== undefined) row.tone = input.tone.slice(0, 120);
  if (input.themes !== undefined) row.themes = input.themes.slice(0, 12);
  if (input.platforms !== undefined) row.platforms = input.platforms.slice(0, 10);
  if (input.postsPerWeek !== undefined) row.posts_per_week = Math.max(1, Math.min(21, input.postsPerWeek));
  if (input.dos !== undefined) row.dos = input.dos.slice(0, 20);
  if (input.donts !== undefined) row.donts = input.donts.slice(0, 20);
  if (input.voiceProfileId !== undefined) row.voice_profile_id = input.voiceProfileId;
  if (input.interviewComplete !== undefined) row.interview_complete = input.interviewComplete;

  const { data } = await supabase
    .from("social_strategy")
    .upsert(row, { onConflict: "company_id" })
    .select("*")
    .single();
  if (data) {
    await writeAudit({ companyId: cid, actorUserId: user.id, actorEmail: user.email, action: "social.strategy_saved", entityType: "social_strategy", entityId: String(data.id) });
  }
  return data ? rowToStrategy(data) : null;
}

// Assemble everything the generator needs about a company into one context blob:
// the interview strategy + live company data (profile, peers, recent filings).
// This is the single source of truth fed to calendar + draft generation so the
// AI only ever works from the public record + the company's stated intent.
export interface StrategyContext {
  company: Company;
  strategy: SocialStrategy | null;
  recentFilings: { type: string; title: string; filedAt: string }[];
}

export async function buildStrategyContext(): Promise<StrategyContext | null> {
  const mine = await getMyCompany();
  if (!mine) return null;
  const strategy = await getStrategy();
  let recentFilings: StrategyContext["recentFilings"] = [];
  try {
    const { db } = await getStore();
    const filings = (db.filings ?? []) as Filing[];
    recentFilings = filings
      .slice()
      .sort((a, b) => (b.filedAt ?? "").localeCompare(a.filedAt ?? ""))
      .slice(0, 8)
      .map((f) => ({ type: f.form, title: f.title, filedAt: f.filedAt }));
  } catch {
    // filings are best-effort context; absence must not block generation
  }
  return { company: mine.company, strategy, recentFilings };
}

// Render the context as a compact prompt block the AI generators embed verbatim.
export function renderContextForPrompt(ctx: StrategyContext): string {
  const c = ctx.company;
  const s = ctx.strategy;
  const lines: string[] = [
    `COMPANY: ${c.name} ($${c.ticker})${c.sector ? ` — ${c.sector}` : ""}`,
  ];
  if (c.description) lines.push(`ABOUT: ${c.description}`);
  if (c.peers?.length) lines.push(`PEERS: ${c.peers.join(", ")}`);
  if (s) {
    if (s.goals) lines.push(`GOALS: ${s.goals}`);
    if (s.audience) lines.push(`AUDIENCE: ${s.audience}`);
    if (s.tone) lines.push(`TONE: ${s.tone}`);
    if (s.themes.length) lines.push(`CONTENT THEMES: ${s.themes.join("; ")}`);
    if (s.dos.length) lines.push(`ALWAYS: ${s.dos.join("; ")}`);
    if (s.donts.length) lines.push(`NEVER: ${s.donts.join("; ")}`);
  }
  if (ctx.recentFilings.length) {
    lines.push(`RECENT SEC FILINGS (the only facts you may cite):`);
    for (const f of ctx.recentFilings) lines.push(`  - ${f.type}: ${f.title} (${f.filedAt})`);
  }
  return lines.join("\n");
}
