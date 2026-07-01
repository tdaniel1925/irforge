import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { getMyCompany } from "@/lib/supabase/store";
import {
  ayrshareMultiTenant,
  ayrshareConfigured,
  createAyrshareProfile,
  generateAyrshareLinkUrl,
  getLinkedAccounts,
  disconnectAccount,
} from "@/lib/ayrshare";

export const dynamic = "force-dynamic";

// GET — current connection status for this company: which networks are linked.
export async function GET() {
  const { db } = await getStore();
  if (!ayrshareConfigured()) {
    return NextResponse.json({ configured: false, multiTenant: false, accounts: [] });
  }
  const accounts = await getLinkedAccounts(db.company.ayrshareProfileKey);
  return NextResponse.json({
    configured: true,
    multiTenant: ayrshareMultiTenant(),
    hasProfile: Boolean(db.company.ayrshareProfileKey),
    accounts,
  });
}

// POST { platform? } — start the connect flow for ONE network (Zernio is
// per-platform OAuth). Ensures this company has a profile, then returns that
// network's OAuth authUrl. Defaults to twitter for back-compat.
export async function POST(req: Request) {
  // AUTH REQUIRED before any profile creation: each createAyrshareProfile call
  // consumes a Zernio plan profile slot. Anonymous callers could exhaust the plan
  // cap (DoS on paying customers) and orphan provider profiles.
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { db, save } = await getStore();
  if (!ayrshareMultiTenant()) {
    return NextResponse.json(
      { error: "Connecting your own social accounts isn't available yet (publishing isn't configured). Contact support." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const platform = typeof body.platform === "string" && body.platform ? body.platform : "twitter";

  const idSuffix = String(mine.id).slice(0, 8);
  const uniqueTitle = `${db.company.name || "Company"} ($${db.company.ticker || "—"}) · ${idSuffix}`;

  // We're now on Zernio: a valid profile id is a 24-char Mongo ObjectId (hex).
  // Anything else — including the legacy Ayrshare profileKeys
  // (XXXXXXXX-XXXXXXXX-…, which have dashes) stored on existing companies — is
  // treated as missing, so it gets recreated on Zernio. This auto-migrates each
  // company off Ayrshare on their next Connect click.
  const looksLikeProfileKey = (v?: string) => Boolean(v && /^[a-f0-9]{24}$/i.test(v));

  // Returns null on success, or { error, cap } when create failed. cap=true means
  // Ayrshare's plan profile limit is full — a distinct, actionable failure.
  const createFresh = async (): Promise<{ error: string; cap: boolean } | null> => {
    const created = await createAyrshareProfile(uniqueTitle, idSuffix);
    if (!created.ok || !created.profileKey) {
      return { error: created.error ?? "Couldn't create your social profile.", cap: created.code === "profile_cap" };
    }
    db.company.ayrshareProfileKey = created.profileKey;
    logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "SOCIAL_PROFILE_CREATED", "Ayrshare profile created");
    await save();
    return null;
  };

  const hadStoredKey = Boolean(db.company.ayrshareProfileKey);

  // Create on first connect, or replace a stored value that isn't a valid profileKey
  // (self-heals companies that have a stale refId from an older build).
  if (!looksLikeProfileKey(db.company.ayrshareProfileKey)) {
    const fail = await createFresh();
    // If creation hit the plan cap but we DO have some stored key, fall through and
    // try to use it (it may still work / surface the precise error from JWT) rather
    // than dead-ending — and never spawn more profiles. Otherwise, stop with a
    // clear cap message.
    if (fail?.cap && !hadStoredKey) {
      return NextResponse.json({ error: fail.error, code: "profile_cap" }, { status: 409 });
    }
    if (fail && !fail.cap) {
      return NextResponse.json({ error: fail.error }, { status: 502 });
    }
  }

  let key = db.company.ayrshareProfileKey ?? "";
  let link = await generateAyrshareLinkUrl(key, platform);

  // Self-heal: if the provider rejects the profile (invalid / not found — e.g. it
  // was deleted), create a fresh one and retry ONCE — UNLESS the plan cap is full
  // (then surface that, don't keep trying).
  if (!link.ok && /invalid|not\s*found|no\s*such|unknown profile/i.test(link.error ?? "")) {
    const fail = await createFresh();
    if (fail?.cap) {
      return NextResponse.json({ error: fail.error, code: "profile_cap" }, { status: 409 });
    }
    if (fail) {
      return NextResponse.json({ error: fail.error }, { status: 502 });
    }
    key = db.company.ayrshareProfileKey ?? "";
    link = await generateAyrshareLinkUrl(key, platform);
  }

  if (!link.ok || !link.url) {
    return NextResponse.json({ error: link.error ?? "Couldn't open the connect page." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: link.url });
}

// DELETE — disconnect ONE social network from this company's Ayrshare profile.
// Body: { platform: "twitter" }. Always scoped to THIS company's profileKey.
export async function DELETE(req: Request) {
  const { db, save } = await getStore();
  const platform = String((await req.json().catch(() => ({})))?.platform ?? "").trim().toLowerCase();
  if (!platform) return NextResponse.json({ error: "No platform specified." }, { status: 422 });
  if (!db.company.ayrshareProfileKey) {
    return NextResponse.json({ error: "No social profile for this company — nothing to disconnect." }, { status: 400 });
  }
  const result = await disconnectAccount(platform, db.company.ayrshareProfileKey);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Couldn't disconnect." }, { status: 502 });
  logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "SOCIAL_DISCONNECTED", `Disconnected ${platform}`);
  await save();
  const accounts = await getLinkedAccounts(db.company.ayrshareProfileKey);
  return NextResponse.json({ ok: true, accounts });
}
