import { randomUUID } from "crypto";
import { createServerSupabase, createServiceClient } from "./supabase/server";
import { getMyCompany } from "./supabase/store";
import { sendEmail } from "./email";

// Team management. Reads/writes go through the session client, so RLS enforces:
//   - any member can READ their company's roster (company_users_read)
//   - only admins can invite / change roles / remove (company_users_write +
//     is_company_admin)
// Accepting an invite is token-verified and uses the service role.

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pubcozone.com";

export interface TeamMember {
  id: string;
  userId: string | null;
  email: string;
  role: "admin" | "member";
  status: "active" | "invited";
  createdAt: string;
}

function rowToMember(r: Record<string, unknown>, emailById: Record<string, string>): TeamMember {
  const uid = (r.user_id as string) || null;
  return {
    id: String(r.id),
    userId: uid,
    email: uid ? emailById[uid] ?? (r.invited_email as string) ?? "—" : (r.invited_email as string) ?? "—",
    role: (r.role as "admin" | "member") ?? "member",
    status: (r.status as "active" | "invited") ?? "active",
    createdAt: String(r.created_at ?? ""),
  };
}

// The roster for the current user's company (RLS scopes it).
export async function listTeam(): Promise<{ members: TeamMember[]; isAdmin: boolean }> {
  const supabase = await createServerSupabase();
  const mine = await getMyCompany();
  if (!mine) return { members: [], isAdmin: false };

  const { data } = await supabase
    .from("company_users")
    .select("*")
    .eq("company_id", mine.id)
    .order("created_at", { ascending: true });
  const rows = data ?? [];

  // Resolve emails for active members via the service client (auth.users isn't
  // readable through the session client).
  const userIds = rows.map((r) => r.user_id).filter(Boolean) as string[];
  const emailById: Record<string, string> = {};
  if (userIds.length) {
    const svc = createServiceClient();
    for (const uid of userIds) {
      const { data: u } = await svc.auth.admin.getUserById(uid);
      if (u?.user?.email) emailById[uid] = u.user.email;
    }
  }

  // Am I an admin of this company?
  const { data: { user } } = await supabase.auth.getUser();
  const me = rows.find((r) => r.user_id === user?.id);
  const isAdmin = me?.role === "admin";

  return { members: rows.map((r) => rowToMember(r, emailById)), isAdmin };
}

// Invite a teammate by email. Creates an 'invited' row + token and emails a link.
// RLS (company_users_write) ensures only an admin can insert the row.
export async function inviteTeammate(email: string, role: "admin" | "member"): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const mine = await getMyCompany();
  if (!mine) return { ok: false, error: "No company." };
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, error: "Enter a valid email." };

  const token = randomUUID();
  const { error } = await supabase.from("company_users").insert({
    company_id: mine.id,
    user_id: null,
    role,
    status: "invited",
    invited_email: clean,
    invited_at: new Date().toISOString(),
    invite_token: token,
  });
  if (error) {
    // RLS denial surfaces here for non-admins.
    return { ok: false, error: error.message.includes("policy") ? "Only admins can invite teammates." : error.message };
  }

  const link = `${SITE}/accept-invite?token=${token}`;
  try {
    await sendEmail({
      to: clean,
      subject: `You're invited to ${mine.company.name || "a company"} on PubcoZone`,
      html:
        `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0f172a">
          <p style="font-size:20px;font-weight:800;margin:0 0 16px"><span>Pubco</span><span style="color:#059669">Zone.</span></p>
          <p>You've been invited to join <strong>${mine.company.name || "a company"}</strong>${mine.company.ticker ? ` ($${mine.company.ticker})` : ""} on PubcoZone as a <strong>${role}</strong>.</p>
          <p>Click below to accept. If you don't have an account yet, you'll create one with this email.</p>
          <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#059669;color:#fff;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:9px">Accept invitation →</a></p>
          <p style="font-size:12px;color:#64748b">Or paste this link: ${link}</p>
        </div>`,
      kind: "team_invite",
    });
  } catch (e) {
    // Invite row exists even if email fails; admin can copy the link from the UI.
    console.error("[team] invite email failed:", e);
  }
  return { ok: true };
}

export async function changeRole(memberId: string, role: "admin" | "member"): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const mine = await getMyCompany();
  if (!mine) return { ok: false, error: "No company." };
  const { error } = await supabase
    .from("company_users")
    .update({ role })
    .eq("id", memberId)
    .eq("company_id", mine.id);
  if (error) return { ok: false, error: error.message.includes("policy") ? "Only admins can change roles." : error.message };
  return { ok: true };
}

export async function removeMember(memberId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const mine = await getMyCompany();
  if (!mine) return { ok: false, error: "No company." };

  // Guard: never let the LAST admin be removed (would orphan the company).
  const { data: admins } = await supabase
    .from("company_users")
    .select("id")
    .eq("company_id", mine.id)
    .eq("role", "admin")
    .eq("status", "active");
  const { data: target } = await supabase.from("company_users").select("role, status").eq("id", memberId).maybeSingle();
  if (target?.role === "admin" && target?.status === "active" && (admins?.length ?? 0) <= 1) {
    return { ok: false, error: "You can't remove the last admin. Promote someone else first." };
  }

  const { error } = await supabase.from("company_users").delete().eq("id", memberId).eq("company_id", mine.id);
  if (error) return { ok: false, error: error.message.includes("policy") ? "Only admins can remove teammates." : error.message };
  return { ok: true };
}

// Look up an invite by token (used by the accept page to show context).
export async function getInviteByToken(token: string): Promise<{ email: string; companyName: string; role: string } | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("company_users")
    .select("invited_email, role, status, company_id")
    .eq("invite_token", token)
    .eq("status", "invited")
    .maybeSingle();
  if (!data) return null;
  const { data: c } = await svc.from("companies").select("name").eq("id", data.company_id).maybeSingle();
  return { email: (data.invited_email as string) ?? "", companyName: (c?.name as string) || "a company", role: (data.role as string) ?? "member" };
}

// Accept an invite: link the logged-in user to the invited row. Verifies the
// token AND that the signed-in user's email matches the invite. Service role.
export async function acceptInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const svc = createServiceClient();
  const { data: invite } = await svc
    .from("company_users")
    .select("id, invited_email, company_id, status, role")
    .eq("invite_token", token)
    .eq("status", "invited")
    .maybeSingle();
  if (!invite) return { ok: false, error: "This invite is invalid or already used." };
  if ((invite.invited_email as string)?.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return { ok: false, error: `This invite is for ${invite.invited_email}. Sign in with that email to accept.` };
  }

  const { error } = await svc
    .from("company_users")
    .update({ user_id: user.id, status: "active", invite_token: null, invited_at: null })
    .eq("id", invite.id);
  if (error) return { ok: false, error: error.message };

  // Promo/comp case: the company was created ownerless. The first admin to accept
  // claims ownership so it's never permanently orphaned.
  if (invite.role === "admin") {
    const { data: co } = await svc.from("companies").select("owner_id").eq("id", invite.company_id).maybeSingle();
    if (co && !co.owner_id) {
      await svc.from("companies").update({ owner_id: user.id }).eq("id", invite.company_id);
    }
  }
  return { ok: true };
}
