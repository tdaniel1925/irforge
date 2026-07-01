import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { ayrshareConfigured, getLinkedAccountsDetailed, getAccountHealth } from "@/lib/ayrshare";

export const dynamic = "force-dynamic";

// GET — detailed connected-account list for THIS company: handle, avatar, active
// state, token expiry, post-capability. Powers the Settings confirmation view.
export async function GET() {
  const { db } = await getStore();
  if (!ayrshareConfigured()) {
    return NextResponse.json({ configured: false, accounts: [] });
  }
  const accounts = await getLinkedAccountsDetailed(db.company.ayrshareProfileKey);
  return NextResponse.json({ configured: true, hasProfile: Boolean(db.company.ayrshareProfileKey), accounts });
}

// POST { accountId } — run a LIVE "Test connection" against one linked account and
// return a clear pass/fail with the reason (token expired, missing write scope, …).
// Auth + ownership required: without the ownership check this was an IDOR — any
// caller could probe arbitrary account IDs across tenants and read handle, token
// validity/expiry, and scopes.
export async function POST(req: Request) {
  const { db, authed } = await getStore();
  if (!authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const accountId = String((await req.json().catch(() => ({})))?.accountId ?? "").trim();
  if (!accountId) return NextResponse.json({ error: "No account specified." }, { status: 422 });
  const ownAccounts = await getLinkedAccountsDetailed(db.company.ayrshareProfileKey);
  if (!ownAccounts.some((a) => a.accountId === accountId)) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  const health = await getAccountHealth(accountId);
  return NextResponse.json(health);
}
