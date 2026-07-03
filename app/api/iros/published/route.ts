import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listPublishedPosts } from "@/lib/iros";

export const dynamic = "force-dynamic";

// GET — the company's REAL published posts (iros_posts status=published), for the
// Results/Proof page. Previously Proof counted the legacy JSONB `drafts` collection,
// which diverged from what actually published.
export async function GET() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const posts = await listPublishedPosts();
  return NextResponse.json({ posts });
}
