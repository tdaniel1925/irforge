import { createServerSupabase } from "./supabase/server";
import { getMyCompany } from "./supabase/store";

// Per-user private workspace (notes/scratchpad) within a company. RLS scopes every
// row to (company_id = the user's company, user_id = auth.uid()), so a user only
// ever sees their own — invisible to teammates and admins.

export interface WorkspaceNote {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updatedAt: string;
}

function toNote(r: Record<string, unknown>): WorkspaceNote {
  return {
    id: String(r.id),
    title: (r.title as string) ?? "",
    body: (r.body as string) ?? "",
    pinned: Boolean(r.pinned),
    updatedAt: String(r.updated_at ?? ""),
  };
}

async function ctx(): Promise<{ cid: string; uid: string } | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = await getMyCompany();
  if (!user || !mine) return null;
  return { cid: mine.id, uid: user.id };
}

export async function listNotes(): Promise<WorkspaceNote[]> {
  const c = await ctx(); if (!c) return [];
  const sb = await createServerSupabase();
  const { data } = await sb
    .from("user_workspace")
    .select("*")
    .eq("company_id", c.cid)
    .eq("user_id", c.uid)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  return (data ?? []).map(toNote);
}

export async function upsertNote(input: { id?: string; title?: string; body?: string; pinned?: boolean }): Promise<WorkspaceNote | null> {
  const c = await ctx(); if (!c) return null;
  const sb = await createServerSupabase();
  const row: Record<string, unknown> = {
    company_id: c.cid,
    user_id: c.uid,
    title: input.title ?? "",
    body: input.body ?? "",
    pinned: input.pinned ?? false,
    updated_at: new Date().toISOString(),
  };
  let data;
  if (input.id) ({ data } = await sb.from("user_workspace").update(row).eq("id", input.id).eq("user_id", c.uid).select("*").single());
  else ({ data } = await sb.from("user_workspace").insert(row).select("*").single());
  return data ? toNote(data) : null;
}

export async function deleteNote(id: string): Promise<void> {
  const c = await ctx(); if (!c) return;
  const sb = await createServerSupabase();
  await sb.from("user_workspace").delete().eq("id", id).eq("user_id", c.uid);
}
