import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["learn_visited", "welcomed"]);

// GET — read the current user's UI flags (for the setup checklist + welcome modal).
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ learn_visited: false, welcomed: false });
  let flags: { learn_visited?: boolean; welcomed?: boolean } = {};
  try {
    const { data } = await supabase.from("user_flags").select("learn_visited, welcomed").eq("user_id", user.id).maybeSingle();
    flags = data ?? {};
  } catch { /* table may not be migrated yet */ }
  return NextResponse.json({ learn_visited: Boolean(flags.learn_visited), welcomed: Boolean(flags.welcomed) });
}

// POST { flag } — record a per-user UI flag.
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { flag?: string };
  if (!body.flag || !ALLOWED.has(body.flag)) return NextResponse.json({ error: "Unknown flag." }, { status: 400 });

  await supabase
    .from("user_flags")
    .upsert({ user_id: user.id, [body.flag]: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return NextResponse.json({ ok: true });
}
