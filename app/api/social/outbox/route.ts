import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listOutbox, reconcileScheduledPosts } from "@/lib/social/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "social"))) return { error: NextResponse.json({ error: "Social Content Engine not enabled." }, { status: 403 }) };
  return { mine };
}

// GET — the delivery dashboard list (scheduled / published / failed posts).
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json({ posts: await listOutbox() });
}

// POST — reconcile: ask Ayrshare the live status of scheduled posts and update.
export async function POST() {
  const g = await guard();
  if (g.error) return g.error;
  const result = await reconcileScheduledPosts();
  const posts = await listOutbox();
  return NextResponse.json({ ...result, posts });
}
