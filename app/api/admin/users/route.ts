import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/platform";
import { listUsers } from "@/lib/adminUsers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET ?search= — every user on the platform, classified by their company account
// (or investor / unlinked). Admins only.
export async function GET(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const search = new URL(req.url).searchParams.get("search") || undefined;
  return NextResponse.json(await listUsers({ search }));
}
