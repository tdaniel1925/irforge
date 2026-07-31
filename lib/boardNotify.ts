import { createServiceClient } from "./supabase/server";
import { sendEmail } from "./email";

// Notifications to the COMPANY about activity on its public board. Two triggers:
//   - immediate email when a new QUESTION is posted (from /api/questions)
//   - a daily DIGEST of new questions + comments (from the cron)
// Best-effort throughout: a notification failure must never block the investor's post
// or the cron. The company's notify address is its owner's account email.

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pubcozone.com";

// Escape user-controlled strings before interpolating into email HTML. Board author
// names and question bodies are attacker-controlled; unescaped they inject HTML into
// the company owner's inbox.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Resolve the onboarded company that owns a ticker + the list of emails to notify.
// Recipients are the company's configured board_notify_emails; if none are set, we
// fall back to the owner's account email so notifications are never silently dropped.
export async function companyNotifyTarget(
  ticker: string
): Promise<{ companyId: string; name: string; ticker: string; emails: string[] } | null> {
  try {
    const svc = createServiceClient();
    const { data: co } = await svc
      .from("companies")
      .select("id, name, ticker, owner_id, onboarding_complete, board_notify_emails")
      .ilike("ticker", ticker)
      .eq("onboarding_complete", true)
      .limit(1)
      .maybeSingle();
    if (!co) return null;

    const configured = ((co.board_notify_emails as string[]) ?? [])
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

    let emails = configured;
    if (emails.length === 0 && co.owner_id) {
      // No explicit recipients — default to the owner's account email.
      const { data: u } = await svc.auth.admin.getUserById(String(co.owner_id));
      if (u?.user?.email) emails = [u.user.email.toLowerCase()];
    }
    if (emails.length === 0) return null;
    return { companyId: String(co.id), name: String(co.name || co.ticker), ticker: String(co.ticker), emails };
  } catch {
    return null;
  }
}

function shell(title: string, bodyHtml: string, ctaHref: string, ctaLabel: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0f172a">
    <p style="font-size:20px;font-weight:800;margin:0 0 16px"><span>Pubco</span><span style="color:#059669">Zone.</span></p>
    <p style="font-size:16px;font-weight:700;margin:0 0 10px">${title}</p>
    ${bodyHtml}
    <p style="margin:22px 0"><a href="${ctaHref}" style="display:inline-block;background:#059669;color:#fff;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:9px">${ctaLabel}</a></p>
    <p style="font-size:12px;color:#64748b">You're getting this because you manage this company on PubcoZone.</p>
  </div>`;
}

// Immediate: a new investor question landed on the board.
export async function notifyNewQuestion(ticker: string, author: string, question: string): Promise<void> {
  const target = await companyNotifyTarget(ticker);
  if (!target) return;
  try {
    await sendEmail({
      to: target.emails,
      subject: `New investor question on your $${target.ticker} board`,
      html: shell(
        `${esc(author)} asked a question on your public board`,
        `<blockquote style="border-left:3px solid #059669;margin:0;padding:6px 14px;color:#334155">${esc(question)}</blockquote>
         <p style="color:#334155">Draft a compliant answer with AI and post it as a verified reply — investors see you respond on the record.</p>`,
        `${SITE}/company`,
        "Answer this question →"
      ),
      kind: "board_question",
    });
  } catch (e) {
    console.error("[boardNotify] question email failed:", e instanceof Error ? e.message : e);
  }

  // Also push a signed event to any connected control plane (Jordyn) so it can
  // notify the team in chat with a suggested answer. Entirely best-effort and
  // isolated from the email path — a webhook failure never affects the post.
  try {
    const { emitQuestionEvent } = await import("./events/questionEvent");
    await emitQuestionEvent({ companyId: target.companyId, ticker: target.ticker, author, question });
  } catch (e) {
    console.error("[boardNotify] question event emit failed:", e instanceof Error ? e.message : e);
  }
}

// Daily digest of board activity for one company.
export async function sendBoardDigest(
  target: { emails: string[]; name: string; ticker: string },
  summary: { newQuestions: number; newComments: number; unansweredTotal: number }
): Promise<boolean> {
  if (summary.newQuestions === 0 && summary.newComments === 0) return false;
  if (!target.emails.length) return false;
  const lines: string[] = [];
  if (summary.newQuestions > 0) lines.push(`<li><strong>${summary.newQuestions}</strong> new question${summary.newQuestions === 1 ? "" : "s"}</li>`);
  if (summary.newComments > 0) lines.push(`<li><strong>${summary.newComments}</strong> new comment${summary.newComments === 1 ? "" : "s"}</li>`);
  try {
    await sendEmail({
      to: target.emails,
      subject: `Your $${target.ticker} board: ${summary.newQuestions + summary.newComments} new in the last day`,
      html: shell(
        `New activity on your $${target.ticker} investor board`,
        `<ul style="color:#334155;padding-left:18px">${lines.join("")}</ul>
         <p style="color:#334155">${summary.unansweredTotal} question${summary.unansweredTotal === 1 ? "" : "s"} still waiting for a reply.</p>`,
        `${SITE}/company`,
        "Review & answer →"
      ),
      kind: "board_digest",
    });
    return true;
  } catch (e) {
    console.error("[boardNotify] digest email failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
