"use client";

import { useEffect, useState } from "react";

interface TeamMember {
  id: string;
  userId: string | null;
  email: string;
  role: "admin" | "member";
  status: "active" | "invited";
  createdAt: string;
}

export default function TeamAdminPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  const load = async () => {
    try {
      const res = await fetch("/api/team");
      const d = await res.json();
      setMembers(d.members ?? []);
      setIsAdmin(Boolean(d.isAdmin));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const invite = async () => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't send the invite.");
      setNotice({ text: `Invite sent to ${email}.`, ok: true });
      setEmail("");
      await load();
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Failed.", ok: false });
    } finally { setBusy(false); }
  };

  const setMemberRole = async (id: string, newRole: "admin" | "member") => {
    setBusy(true); setNotice(null);
    const res = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role: newRole }) });
    const d = await res.json();
    if (!res.ok) setNotice({ text: d.error ?? "Failed.", ok: false });
    await load(); setBusy(false);
  };

  const remove = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from the team? They'll lose access to this company.`)) return;
    setBusy(true); setNotice(null);
    const res = await fetch(`/api/team?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) setNotice({ text: d.error ?? "Failed.", ok: false });
    await load(); setBusy(false);
  };

  if (loading) return <div className="p-8 text-muted">Loading team…</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-app">Team</h1>
      <p className="mt-1 text-sm text-muted">
        People who can access {`this company's`} dashboard. Admins can invite teammates and manage roles; members get the
        full dashboard plus their own workspace.
      </p>

      {notice && (
        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${notice.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"}`}>
          {notice.text}
        </div>
      )}

      {!isAdmin && (
        <div className="mt-4 rounded-lg border border-app bg-surface-2 px-4 py-3 text-sm text-muted">
          You&apos;re a member of this team. Only admins can invite or manage teammates.
        </div>
      )}

      {isAdmin && (
        <div className="mt-6 rounded-2xl border border-app bg-surface p-5">
          <h2 className="font-semibold text-app">Invite a teammate</h2>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-xs font-medium text-muted">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button onClick={invite} disabled={busy || !email} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
          <p className="mt-2 text-xs text-faint">They&apos;ll get an email with a link to join. Members see the same company data; each also gets their own CRM ownership and workspace.</p>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-surface p-4">
            <div>
              <p className="font-medium text-app">{m.email}</p>
              <p className="mt-0.5 flex items-center gap-2 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide ${m.role === "admin" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-surface-2 text-faint"}`}>{m.role}</span>
                {m.status === "invited" && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Invited — pending</span>}
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                {m.status === "active" && (
                  <select
                    value={m.role}
                    onChange={(e) => setMemberRole(m.id, e.target.value as "admin" | "member")}
                    disabled={busy}
                    className="rounded-lg border border-app bg-surface-2 px-2 py-1 text-xs text-app focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                <button onClick={() => remove(m.id, m.email)} disabled={busy} className="rounded-lg border border-app px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-500/10 dark:text-red-400">
                  {m.status === "invited" ? "Cancel" : "Remove"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
