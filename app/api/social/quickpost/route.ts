import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { buildChannelPost, CHANNEL_LIMITS, checkContent, hasBlockingFlags, publishGate } from "@/lib/compliance";
import { publishPerChannel, getLinkedAccountsDetailed, AYRSHARE_CHANNELS } from "@/lib/ayrshare";
import { tierHasFeature, type Tier } from "@/lib/billing";
import { classifyRegFD } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Body = {
  action: "preview" | "publish";
  text: string;
  channels: string[];
  mediaUrls?: string[];
  acknowledgeRisk?: boolean;
};

const validChannel = (c: string) => AYRSHARE_CHANNELS.some((a) => a.key === c);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { db, save } = await getStore();

  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Write something to post first." }, { status: 422 });

  const channels = (Array.isArray(body.channels) ? body.channels : []).filter(validChannel);
  if (channels.length === 0) return NextResponse.json({ error: "Pick at least one channel to post to." }, { status: 422 });

  // Build the per-channel body (company sends its own posts: FLS note only, no
  // compensated-provider line; X gets a compact FLS + link to its disclosures page).
  const bodies: Record<string, string> = {};
  for (const c of channels) bodies[c] = buildChannelPost(text, db.company, c);

  // Per-channel length check — a post that's too long for a channel is blocked
  // (X would reject it; this tells the user up front, per channel).
  const tooLong = channels
    .map((c) => ({ channel: c, len: bodies[c].length, limit: CHANNEL_LIMITS[c] ?? 5000 }))
    .filter((x) => x.len > x.limit)
    .map((x) => ({ ...x, over: x.len - x.limit }));

  // Compliance: hard language flags (block), then AI Reg-FD assist.
  const flags = checkContent([text]);
  const blocked = hasBlockingFlags(flags);

  // Which of the chosen channels are actually connected (so preview can warn).
  const accounts = await getLinkedAccountsDetailed(db.company.ayrshareProfileKey);
  const connectedKeys = new Set(accounts.map((a) => a.platform));
  const notConnected = channels.filter((c) => !connectedKeys.has(c));

  // --- PREVIEW ---
  if (body.action === "preview") {
    let regFd: { classification: string; flags: string[]; reasoning: string } | null = null;
    if (!blocked) {
      const cls = await classifyRegFD(text, db.company).catch(() => null);
      if (cls) regFd = { classification: cls.classification, flags: cls.flags, reasoning: cls.reasoning };
    }
    // Show the X body as the preview when X is selected (it differs from the rest);
    // otherwise show the first channel's body.
    const previewText = bodies[channels.includes("twitter") ? "twitter" : channels[0]];
    return NextResponse.json({
      preview: previewText,
      bodies,
      channels,
      mediaUrls: body.mediaUrls ?? [],
      flags,
      blocked,
      notConnected,
      tooLong,
      regFd,
      quietMode: Boolean(db.company.quietMode),
    });
  }

  // --- PUBLISH NOW ---
  if (!tierHasFeature((db.company.tier ?? "free") as Tier, "publishX")) {
    return NextResponse.json({ error: "Posting requires a paid plan. Upgrade to publish." }, { status: 402 });
  }
  const gate = publishGate({ status: "approved", flags, quietMode: db.company.quietMode });
  if (!gate.ok) {
    logAudit(db, "compliance-engine", "QUICKPOST_REFUSED", gate.reason ?? "blocked");
    await save();
    return NextResponse.json({ error: gate.reason }, { status: 422 });
  }
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
  if (tooLong.length > 0) {
    const t = tooLong.map((x) => `${x.channel} (over by ${x.over})`).join(", ");
    return NextResponse.json({ error: `Too long for: ${t}. Shorten your text or remove that channel.` }, { status: 422 });
  }

  const result = await publishPerChannel(bodies, db.company.ayrshareProfileKey, { mediaUrls: body.mediaUrls });
  if (!result.ok) {
    logAudit(db, "system", "QUICKPOST_FAILED", result.error ?? "publish failed");
    await save();
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  logAudit(
    db,
    `${db.company.approverName} (${db.company.approverTitle})`,
    "QUICKPOST_PUBLISHED",
    `Immediate post to ${channels.join(", ")}${result.postUrl ? ` (${result.postUrl})` : ""} — FLS note appended`
  );
  // Record the published post so it appears in Posts → Published (best-effort; never
  // blocks the publish). Without this, Quick Posts published fine but were invisible
  // to the Published list (which reads iros_posts).
  const { recordPublishedPost } = await import("@/lib/iros");
  await recordPublishedPost({ body: text, channels, postUrl: result.postUrl, posted: result.posted });
  await save();
  return NextResponse.json({ ok: true, posted: result.posted, postUrl: result.postUrl, channels });
}
