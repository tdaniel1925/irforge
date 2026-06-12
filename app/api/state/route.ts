import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFullDb } from "@/lib/supabase/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const flags = {
    hasAi: Boolean(process.env.ANTHROPIC_API_KEY),
    hasAyrshare: Boolean(process.env.AYRSHARE_API_KEY),
    hasSupabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  };

  // Multi-tenant: serve the logged-in user's company from Supabase.
  const mine = await getFullDb();
  if (mine) return NextResponse.json({ ...mine, ...flags, authed: true });

  // Local fallback.
  return NextResponse.json({ ...getDb(), ...flags, authed: false });
}
