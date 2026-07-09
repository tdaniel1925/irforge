import { createServiceClient } from "./supabase/server";
import { getMyMember } from "./members";

const supabaseEnabled = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Daily quotas for metered investor AI tools. Investor+ (member_plus) is
// unlimited; free members and anonymous visitors get `limit` uses per day.
//
// Identity for the counter: the member id when signed in (follows the person
// across devices), otherwise the caller-supplied anonymous key (IP). Fails OPEN
// if the usage table hasn't been migrated yet — a missing quota table should
// never take a public feature down.

export interface QuotaResult {
  allowed: boolean;
  unlimited: boolean;
  used: number;
  limit: number;
  signedIn: boolean;
}

export async function checkDailyQuota(tool: string, anonKey: string, limit: number): Promise<QuotaResult> {
  const me = await getMyMember().catch(() => null);
  if (me?.member.plan === "member_plus") {
    return { allowed: true, unlimited: true, used: 0, limit, signedIn: true };
  }
  const key = `${tool}:${me ? `m:${me.id}` : `a:${anonKey}`}`;

  if (!supabaseEnabled()) return { allowed: true, unlimited: false, used: 0, limit, signedIn: Boolean(me) };
  try {
    const svc = createServiceClient();
    const { data, error } = await svc.rpc("bump_usage_daily", { k: key });
    if (error) return { allowed: true, unlimited: false, used: 0, limit, signedIn: Boolean(me) }; // fail open (table not migrated)
    const used = Number(data ?? 1);
    return { allowed: used <= limit, unlimited: false, used, limit, signedIn: Boolean(me) };
  } catch {
    return { allowed: true, unlimited: false, used: 0, limit, signedIn: Boolean(me) };
  }
}
