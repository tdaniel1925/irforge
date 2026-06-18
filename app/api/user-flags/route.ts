import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST { flag: "learn_visited" } — record a per-user UI flag (for the setup checklist).
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { flag?: string };
  if (body.flag !== "learn_visited") return NextResponse.json({ error: "Unknown flag." }, { status: 400 });

  await supabase
    .from("user_flags")
    .upsert({ user_id: user.id, learn_visited: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return NextResponse.json({ ok: true });
}
