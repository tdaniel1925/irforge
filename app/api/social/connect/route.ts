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

  // Create the profile on first connect. The title is made globally unique with the
  // company id so two companies (even same name) never collide; createAyrshareProfile
  // also recovers an existing profile if the title was already used.
  if (!db.company.ayrshareProfileKey) {
    const mine = await getMyCompany();
    const idSuffix = String(mine?.id ?? "").slice(0, 8);
    const uniqueTitle = `${db.company.name || "Company"} ($${db.company.ticker || "—"}) · ${idSuffix}`;
    // Pass the id suffix so an existing profile (even if the company was renamed
    // since it was created) is reused instead of colliding on "title already exists".
    const created = await createAyrshareProfile(uniqueTitle, idSuffix);
    if (!created.ok || !created.profileKey) {
      return NextResponse.json({ error: created.error ?? "Couldn't create your social profile." }, { status: 502 });
    }
    db.company.ayrshareProfileKey = created.profileKey;
    logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "SOCIAL_PROFILE_CREATED", "Ayrshare profile created");
    await save();
  }

  const link = await generateAyrshareLinkUrl(db.company.ayrshareProfileKey);
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
