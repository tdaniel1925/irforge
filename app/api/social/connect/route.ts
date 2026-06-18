import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { getMyCompany } from "@/lib/supabase/store";
import {
  ayrshareMultiTenant,
  ayrshareConfigured,
  createAyrshareProfile,
  generateAyrshareLinkUrl,
  getLinkedAccounts,
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
    const uniqueTitle = `${db.company.name || "Company"} ($${db.company.ticker || "—"}) · ${String(mine?.id ?? "").slice(0, 8)}`;
    const created = await createAyrshareProfile(uniqueTitle);
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
