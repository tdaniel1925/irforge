import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { buildPublishedThread, checkContent, hasBlockingFlags, publishGate } from "@/lib/compliance";
import { publishToChannels, getLinkedAccountsDetailed, AYRSHARE_CHANNELS } from "@/lib/ayrshare";
import { tierHasFeature, type Tier } from "@/lib/billing";
import { classifyRegFD } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Body = {
  action: "preview" | "publish";
  text: string;
  channels: string[];          // e.g. ["twitter","linkedin"]
  mediaUrls?: string[];        // public URLs from /quickpost/media
  acknowledgeRisk?: boolean;   // bypass the Reg-FD red stop (human took responsibility)
};

const validChannel = (c: string) => AYRSHARE_CHANNELS.some((a) => a.key === c);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { db, save } = await getStore();

  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Write something to post first." }, { status: 422 });

  const channels = (Array.isArray(body.channels) ? body.channels : []).filter(validChannel);
  if (channels.length === 0) return NextResponse.json({ error: "Pick at least one channel to post to." }, { status: 422 });

  // Disclosures are ALWAYS appended — same machinery as the Do queue, can't be skipped.
  // buildPublishedThread works on a thread; a quick post is a single body.
  const finalText = buildPublishedThread([text], db.company).join("\n\n");

  // X (Twitter) caps a post at 280 chars. The mandatory disclosures alone are long,
  // so a short post + disclosures usually exceeds it and X rejects the whole thing.
  // Detect this BEFORE publishing and tell the user exactly how much to trim.
  const TWITTER_LIMIT = 280;
  const targetsX = (Array.isArray(body.channels) ? body.channels : []).map(String).includes("twitter");
  const xOverBy = targetsX ? Math.max(0, finalText.length - TWITTER_LIMIT) : 0;

  // Compliance: hard language flags (block), then AI Reg-FD assist.
  const flags = checkContent([text]);
  const blocked = hasBlockingFlags(flags);

  // Which of the chosen channels are actually connected + can post (so preview can warn).
  const accounts = await getLinkedAccountsDetailed(db.company.ayrshareProfileKey);
  const connectedKeys = new Set(accounts.map((a) => a.platform));
  const notConnected = channels.filter((c) => !connectedKeys.has(c));

  // --- PREVIEW: return exactly what would post + every check, for approval ---
  if (body.action === "preview") {
    let regFd: { classification: string; flags: string[]; reasoning: string } | null = null;
    if (!blocked) {
      const cls = await classifyRegFD(text, db.company).catch(() => null);
      if (cls) regFd = { classification: cls.classification, flags: cls.flags, reasoning: cls.reasoning };
    }
    return NextResponse.json({
      preview: finalText,
      channels,
      mediaUrls: body.mediaUrls ?? [],
      flags,
      blocked,
      notConnected,
      regFd,
      quietMode: Boolean(db.company.quietMode),
      xOverBy,                       // chars over X's 280 limit (0 = fine)
      finalLength: finalText.length, // total length incl. disclosures
    });
  }

  // --- PUBLISH NOW ---
  // Tier gate (publishing is paid).
  if (!tierHasFeature((db.company.tier ?? "free") as Tier, "publishX")) {
    return NextResponse.json({ error: "Posting requires a paid plan. Upgrade to publish." }, { status: 402 });
  }
  // Same publish gate as drafts: blocks on flags / quiet mode.
  const gate = publishGate({ status: "approved", flags, quietMode: db.company.quietMode });
  if (!gate.ok) {
    logAudit(db, "compliance-engine", "QUICKPOST_REFUSED", gate.reason ?? "blocked");
    await save();
    return NextResponse.json({ error: gate.reason }, { status: 422 });
  }
  // Reg-FD red stop unless the human acknowledged the risk.
  if (!body.acknowledgeRisk && !blocked) {
    const cls = await classifyRegFD(text, db.company).catch(() => null);
    if (cls && cls.classification === "red") {
      logAudit(db, "system", "QUICKPOST_REGFD_RED", cls.reasoning);
      await save();
      return NextResponse.json({
        error: "This looks like it may contain material non-public information. Have counsel review it, or acknowledge the risk to proceed.",
        regFd: { classification: cls.classification, flags: cls.flags, reasoning: cls.reasoning },
        requiresAcknowledgement: true,
      }, { status: 409 });
    }
  }
  if (notConnected.length > 0) {
    return NextResponse.json({ error: `Not connected for: ${notConnected.join(", ")}. Connect them in Settings or remove them.` }, { status: 422 });
  }
  // X length guard — fail fast with a clear, actionable message (X would reject the
  // whole post otherwise). Disclosures (~350 chars) are mandatory, so the body must
  // be short for X. Suggest trimming or unchecking X.
  if (xOverBy > 0) {
    return NextResponse.json({
      error: `Too long for X by ${xOverBy} character${xOverBy === 1 ? "" : "s"}. With the required disclosures the post is ${finalText.length}/280 for X. Shorten your text, or uncheck X (Twitter) — LinkedIn, Instagram and Facebook allow the full length.`,
    }, { status: 422 });
  }

  const result = await publishToChannels(finalText, channels, db.company.ayrshareProfileKey, { mediaUrls: body.mediaUrls });
  if (!result.ok) {
    logAudit(db, "system", "QUICKPOST_FAILED", result.error ?? "publish failed");
    await save();
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  logAudit(
    db,
    `${db.company.approverName} (${db.company.approverTitle})`,
    "QUICKPOST_PUBLISHED",
    `Immediate post to ${channels.join(", ")}${result.postUrl ? ` (${result.postUrl})` : ""} — disclosures appended`
  );
  await save();
  return NextResponse.json({ ok: true, posted: result.posted, postUrl: result.postUrl, channels });
}
