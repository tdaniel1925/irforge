import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

const COLS = ["name", "ticker", "exchange", "industry", "fit_score", "size_tier", "market_cap", "price", "contact_name", "email", "phone", "address", "recent_form", "status", "last_sent_at", "edgar_url", "ir_lookup_url", "notes"] as const;

// GET ?list=<id> → CSV download of that list's leads.
export async function GET(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const svc = createServiceClient();
  const listId = new URL(req.url).searchParams.get("list");
  if (!listId) return NextResponse.json({ error: "list required" }, { status: 422 });

  const { data, error } = await svc.from("outreach_leads").select("*").eq("list_id", listId).order("fit_score", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [COLS.join(","), ...(data ?? []).map((r) => COLS.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pubcozone-leads-${listId.slice(0, 8)}.csv"`,
    },
  });
}
