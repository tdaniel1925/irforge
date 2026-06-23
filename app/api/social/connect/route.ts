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

// POST — start the connect flow: ensure this company has an Ayrshare profile, then
// return a single-use link to Ayrshare's hosted "connect your socials" page.
export async function POST() {
  const { db, save } = await getStore();
  if (!ayrshareMultiTenant()) {
    return NextResponse.json(
      { error: "Connecting your own social accounts isn't available yet (Ayrshare multi-account isn't configured). Contact support." },
      { status: 400 }
    );
  }

  const mine = await getMyCompany();
  const idSuffix = String(mine?.id ?? "").slice(0, 8);
  const uniqueTitle = `${db.company.name || "Company"} ($${db.company.ticker || "—"}) · ${idSuffix}`;

  // A real Ayrshare profileKey looks like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
  // (uppercase hex groups). Older builds wrongly stored a refId (40-char lowercase
  // hex) here, which generateJWT/posting REJECT. Treat anything that isn't a real
  // profileKey as missing so it gets recreated.
  const looksLikeProfileKey = (v?: string) => Boolean(v && /^[0-9A-F]{8}(-[0-9A-F]{8}){3}$/.test(v));

  const createFresh = async () => {
    const created = await createAyrshareProfile(uniqueTitle, idSuffix);
    if (!created.ok || !created.profileKey) return created.error ?? "Couldn't create your social profile.";
    db.company.ayrshareProfileKey = created.profileKey;
    logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "SOCIAL_PROFILE_CREATED", "Ayrshare profile created");
    await save();
    return null;
  };

  // Create on first connect, or replace a stored value that isn't a valid profileKey
  // (self-heals companies that have a stale refId from an older build).
  if (!looksLikeProfileKey(db.company.ayrshareProfileKey)) {
    const err = await createFresh();
    if (err) return NextResponse.json({ error: err }, { status: 502 });
  }

  let key = db.company.ayrshareProfileKey ?? "";
  let link = await generateAyrshareLinkUrl(key);

  // Self-heal: if Ayrshare still rejects the key as invalid (e.g. the profile was
  // deleted in the dashboard, or a stale key slipped through), create a fresh one
  // and retry ONCE.
  if (!link.ok && /profile key is invalid/i.test(link.error ?? "")) {
    const err = await createFresh();
    if (err) return NextResponse.json({ error: err }, { status: 502 });
    key = db.company.ayrshareProfileKey ?? "";
    link = await generateAyrshareLinkUrl(key);
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
