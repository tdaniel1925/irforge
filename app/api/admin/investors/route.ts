import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/platform";
import { createServerSupabase } from "@/lib/supabase/server";
import { listInvestors, getInvestor, setSuspended, setInvestorPlan, deleteInvestor } from "@/lib/adminInvestors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function adminEmail(): Promise<string | null> {
  if (!(await isSuperAdmin())) return null;
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return user?.email ?? "admin";
}

// GET ?id=<memberId>  → detail;  otherwise → list (search/plan/status/paging).
export async function GET(req: Request) {
  const email = await adminEmail();
  if (!email) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  if (id) {
    const detail = await getInvestor(id);
    if (!detail) return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    return NextResponse.json({ investor: detail });
  }
  const { rows, total } = await listInvestors({
    search: u.searchParams.get("search") || undefined,
    plan: u.searchParams.get("plan") || undefined,
    status: (u.searchParams.get("status") as "all" | "active" | "suspended") || undefined,
    limit: Number(u.searchParams.get("limit")) || undefined,
    offset: Number(u.searchParams.get("offset")) || undefined,
  });
  return NextResponse.json({ rows, total });
}

// POST { action, id, ... } — suspend | unsuspend | setPlan | delete.
export async function POST(req: Request) {
  const email = await adminEmail();
  if (!email) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 422 });

  switch (b.action) {
    case "suspend": {
      const ok = await setSuspended(id, true, email, String(b.reason ?? ""));
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    case "unsuspend": {
      const ok = await setSuspended(id, false, email);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    case "setPlan": {
      const plan = b.plan === "member_plus" ? "member_plus" : "free";
      const ok = await setInvestorPlan(id, plan, email);
      return ok ? NextResponse.json({ ok: true, plan }) : NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    case "delete": {
      // Typed-confirmation guard: the client must echo the exact handle.
      if (!b.confirm) return NextResponse.json({ error: "Deletion requires confirmation." }, { status: 422 });
      const ok = await deleteInvestor(id, email);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 422 });
  }
}
