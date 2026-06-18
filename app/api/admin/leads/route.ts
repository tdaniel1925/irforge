import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/platform";
import { buildLeads } from "@/lib/edgarLeads";

export const dynamic = "force-dynamic";

async function guard() {
  if (!(await isSuperAdmin())) return null;
  return createServiceClient();
}

// GET ?list=<id>  → leads in a list.   GET (no params) → all lists with counts.
export async function GET(req: Request) {
  const svc = await guard();
  if (!svc) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const listId = new URL(req.url).searchParams.get("list");

  if (listId) {
    const { data, error } = await svc.from("leads").select("*").eq("list_id", listId).order("fit_score", { ascending: false }).order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ leads: data ?? [] });
  }

  const { data: lists, error } = await svc.from("lead_lists").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // attach counts
  const withCounts = await Promise.all(
    (lists ?? []).map(async (l) => {
      const { count } = await svc.from("leads").select("id", { count: "exact", head: true }).eq("list_id", l.id);
      const { count: sent } = await svc.from("leads").select("id", { count: "exact", head: true }).eq("list_id", l.id).in("status", ["sent", "delivered", "opened"]);
      return { ...l, count: count ?? 0, sent: sent ?? 0 };
    })
  );
  return NextResponse.json({ lists: withCounts });
}

// POST actions: create_list | pull (EDGAR → save into a list) | update_lead | delete_lead | delete_list
export async function POST(req: Request) {
  const svc = await guard();
  if (!svc) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");

  try {
    if (action === "create_list") {
      const { data, error } = await svc.from("lead_lists").insert({ name: String(b.name || "Untitled list"), note: String(b.note || "") }).select().single();
      if (error) throw error;
      return NextResponse.json({ list: data });
    }

    if (action === "pull") {
      const listId = String(b.listId || "");
      if (!listId) return NextResponse.json({ error: "listId required" }, { status: 422 });
      const forms: string[] = Array.isArray(b.forms) && b.forms.length ? b.forms : ["8-K", "10-Q"];
      const limit = Math.min(Number(b.limit) || 30, 100);
      const maxMarketCap = b.maxMarketCap === 0 ? 0 : Number(b.maxMarketCap) || 500e6;
      const smallCapOnly = b.smallCapOnly !== false;
      const raw = await buildLeads({ forms, limit, maxMarketCap, smallCapOnly });

      // Insert, ignoring dupes (unique on list_id+cik). Map to row shape.
      const rows = raw.map((r) => ({
        list_id: listId,
        cik: r.cik,
        name: r.name,
        ticker: r.ticker,
        exchange: r.exchange,
        industry: r.industry,
        phone: r.phone,
        address: r.address,
        recent_form: r.recentForm,
        edgar_url: r.edgarUrl,
        ir_lookup_url: r.irLookupUrl,
        market_cap: r.marketCap ?? null,
        size_tier: r.sizeTier,
        price: r.price ?? null,
        fit_score: r.fitScore,
        fit_reason: r.fitReason,
      }));
      // upsert on conflict do nothing (dedupe within list)
      const { error } = await svc.from("leads").upsert(rows, { onConflict: "list_id,cik", ignoreDuplicates: true });
      if (error) throw error;
      const { count } = await svc.from("leads").select("id", { count: "exact", head: true }).eq("list_id", listId);
      return NextResponse.json({ pulled: raw.length, total: count ?? 0 });
    }

    if (action === "update_lead") {
      const id = String(b.id || "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 422 });
      const patch: Record<string, string> = {};
      for (const k of ["contact_name", "email", "notes", "status"]) if (k in b) patch[k] = String(b[k] ?? "");
      const { error } = await svc.from("leads").update(patch).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_lead") {
      const { error } = await svc.from("leads").delete().eq("id", String(b.id || ""));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_list") {
      const { error } = await svc.from("lead_lists").delete().eq("id", String(b.id || ""));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
