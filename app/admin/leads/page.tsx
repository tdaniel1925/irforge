"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Card, LoadingState, PageHeader } from "@/components/ui";
import InlineConfirm from "@/components/InlineConfirm";

interface LeadList { id: string; name: string; note: string; count: number; sent: number; created_at: string }
interface Lead {
  id: string; cik: string; name: string; ticker: string; exchange: string; industry: string;
  phone: string; address: string; recent_form: string; edgar_url: string; ir_lookup_url: string;
  contact_name: string; email: string; status: string; last_sent_at?: string; notes: string;
  market_cap?: number; size_tier?: string; price?: number; fit_score?: number; fit_reason?: string;
}

const SIZE_STYLE: Record<string, string> = {
  nano: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  micro: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  small: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  mid: "bg-app-hover text-faint",
  large: "bg-app-hover text-faint",
  unknown: "bg-app-hover text-faint",
};

function fmtCap(n?: number): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${(n / 1e3).toFixed(0)}K`;
}

type Notice = { text: string; tone: "success" | "error" | "info" } | null;

const STATUS_STYLE: Record<string, string> = {
  new: "bg-app-hover text-faint",
  queued: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  sent: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  delivered: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  opened: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  bounced: "bg-red-500/15 text-red-600 dark:text-red-300",
  replied: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  skipped: "bg-app-hover text-faint",
};

const DEFAULT_TEMPLATE = `Hi {name},

I ran $\{ticker} through PubcoZone — an AI investor-relations platform for public companies — and put together {snapshot} (free, public data only).

A couple of things stood out about how investors currently see {company}. No pitch — worth a look?

Trent`;

export default function LeadFinder() {
  const [lists, setLists] = useState<LeadList[]>([]);
  const [activeList, setActiveList] = useState<string>("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  // New-list + pull controls
  const [newListName, setNewListName] = useState("");
  const [forms, setForms] = useState<string[]>(["8-K", "10-Q"]);
  const [pullLimit, setPullLimit] = useState(30);
  const [maxCapM, setMaxCapM] = useState(500); // max market cap in $M; 0 = no cap

  // Compose
  const [subject, setSubject] = useState("A quick visibility snapshot for ${ticker}");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [composeOpen, setComposeOpen] = useState(false);

  const loadLists = useCallback(async () => {
    const res = await fetch("/api/admin/leads");
    const d = await res.json().catch(() => ({}));
    if (res.ok) setLists(d.lists ?? []);
    else setNotice({ text: d.error === "Admin only" ? "Administrators only." : d.error ?? "Failed to load.", tone: "error" });
    setLoading(false);
  }, []);

  const loadLeads = useCallback(async (listId: string) => {
    if (!listId) { setLeads([]); return; }
    const res = await fetch(`/api/admin/leads?list=${listId}`);
    const d = await res.json().catch(() => ({}));
    if (res.ok) setLeads(d.leads ?? []);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);
  useEffect(() => { loadLeads(activeList); }, [activeList, loadLeads]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, d };
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    setBusy("create");
    const { ok, d } = await post({ action: "create_list", name: newListName.trim() });
    if (ok) { setNewListName(""); await loadLists(); setActiveList(d.list.id); setNotice({ text: "List created.", tone: "success" }); }
    else setNotice({ text: d.error ?? "Failed.", tone: "error" });
    setBusy("");
  };

  const toggleForm = (f: string) => setForms((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const pull = async () => {
    if (!activeList) return;
    setBusy("pull");
    setNotice({ text: "Pulling recent filers from SEC EDGAR — this takes ~20s…", tone: "info" });
    const { ok, d } = await post({ action: "pull", listId: activeList, forms, limit: pullLimit, maxMarketCap: maxCapM === 0 ? 0 : maxCapM * 1e6, smallCapOnly: true });
    if (ok) { await loadLeads(activeList); await loadLists(); setNotice({ text: `Pulled ${d.pulled} companies. List now has ${d.total}. Add verified emails before sending.`, tone: "success" }); }
    else setNotice({ text: d.error ?? "Pull failed.", tone: "error" });
    setBusy("");
  };

  const saveLead = async (id: string, patch: Partial<Lead>) => {
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await post({ action: "update_lead", id, ...patch });
  };

  const deleteLead = async (id: string) => {
    await post({ action: "delete_lead", id });
    setLeads((cur) => cur.filter((l) => l.id !== id));
    await loadLists();
  };

  const deleteList = async (id: string) => {
    await post({ action: "delete_list", id });
    if (activeList === id) setActiveList("");
    await loadLists();
  };

  const send = async () => {
    if (!activeList) return;
    const withEmail = leads.filter((l) => l.email && (l.status === "new" || l.status === "queued"));
    if (withEmail.length === 0) { setNotice({ text: "No leads with an email address and 'new' status to send to. Add verified emails first.", tone: "error" }); return; }
    // Inline confirm: first click arms, second click sends. No native confirm().
    if (!confirmSend) { setConfirmSend(true); setNotice({ text: `Click "Send" again to confirm outreach to ${withEmail.length} lead(s). (Daily cap applies.)`, tone: "info" }); return; }
    setConfirmSend(false);
    setBusy("send");
    const res = await fetch("/api/admin/leads/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId: activeList, subject, template }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice({ text: `Sent ${d.sent}. ${d.skipped ? `${d.skipped} skipped (cap). ` : ""}${d.capRemaining} left in today's cap.${d.errors?.length ? ` Errors: ${d.errors.join("; ")}` : ""}`, tone: d.sent ? "success" : "info" });
      await loadLeads(activeList); await loadLists();
    } else setNotice({ text: d.error ?? "Send failed.", tone: "error" });
    setBusy("");
  };

  if (loading) return <LoadingState />;

  const active = lists.find((l) => l.id === activeList);
  const emailCount = leads.filter((l) => l.email).length;

  return (
    <div>
      <PageHeader title="Lead Finder" subtitle="Build outreach lists from live SEC EDGAR filings, add verified IR contacts, export to CSV, and send capped, approved cold outreach — all tracked back to delivery status." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <Card className="mb-5 border-amber-500/30 bg-amber-500/[0.05]">
        <p className="text-xs text-amber-700 dark:text-amber-200/90">
          <strong>How emails work:</strong> EDGAR does not publish email addresses. The system fills name, ticker, phone, address and a one-click
          &ldquo;find IR contact&rdquo; search link — you paste the <strong>verified</strong> email before anything can send. Sends are capped per day and use a
          separate outreach subdomain to protect your invite/welcome deliverability. Every send has an unsubscribe line (CAN-SPAM).
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Left: lists */}
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-app">Your lists</h2>
            <div className="space-y-1">
              {lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveList(l.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${activeList === l.id ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "text-app hover:bg-app-hover"}`}
                >
                  <span className="truncate">{l.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-faint">{l.sent}/{l.count}</span>
                </button>
              ))}
              {lists.length === 0 && <p className="px-1 py-2 text-xs text-faint">No lists yet — create one below.</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="New list name" className="min-w-0 flex-1 rounded-lg border border-app bg-surface-2 px-2.5 py-1.5 text-sm text-app focus:outline-none" />
              <Button onClick={createList} disabled={busy === "create" || !newListName.trim()}>+</Button>
            </div>
          </Card>

          {active && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-app">Pull from EDGAR</h2>
              <p className="mb-2 text-xs text-muted">Recently-filed companies = actively communicating.</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["8-K", "10-Q", "10-K", "424B"].map((f) => (
                  <button key={f} onClick={() => toggleForm(f)} className={`rounded-md border px-2 py-1 text-xs ${forms.includes(f) ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-app text-muted hover:bg-app-hover"}`}>{f}</button>
                ))}
              </div>
              <label className="mb-2 block text-xs text-muted">Max companies: <strong className="text-app">{pullLimit}</strong>
                <input type="range" min={10} max={100} step={10} value={pullLimit} onChange={(e) => setPullLimit(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <label className="mb-2 block text-xs text-muted">Max market cap: <strong className="text-app">{maxCapM === 0 ? "no limit" : `$${maxCapM}M`}</strong>
                <input type="range" min={0} max={2000} step={50} value={maxCapM} onChange={(e) => setMaxCapM(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <p className="mb-2 text-[11px] text-faint">Drops banks, funds &amp; SPACs automatically. Best-fit (small, just-filed) ranked first.</p>
              <div className="[&>button]:w-full"><Button onClick={pull} disabled={busy === "pull" || forms.length === 0}>{busy === "pull" ? "Pulling…" : "🔎 Pull leads"}</Button></div>
            </Card>
          )}
        </div>

        {/* Right: leads + compose */}
        <div className="space-y-4">
          {!active ? (
            <Card><p className="py-10 text-center text-sm text-faint">Select or create a list to begin.</p></Card>
          ) : (
            <>
              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-app">{active.name}</h2>
                    <p className="text-xs text-muted">{leads.length} companies · {emailCount} with a verified email · {active.sent} contacted</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/admin/leads/export?list=${active.id}`} className="rounded-lg border border-app px-3 py-1.5 text-sm text-app hover:bg-app-hover">⬇ CSV</a>
                    <Button variant="secondary" onClick={() => setComposeOpen((v) => !v)}>{composeOpen ? "Hide compose" : "✉ Compose & send"}</Button>
                    <InlineConfirm onConfirm={() => deleteList(active.id)} label="Delete list" confirmLabel="Delete list & leads" className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10" />
                  </div>
                </div>

                {leads.length === 0 ? (
                  <p className="py-8 text-center text-sm text-faint">Empty — use &ldquo;Pull leads&rdquo; to populate from EDGAR.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-app text-left text-xs text-faint">
                          <th className="py-2 pr-3 font-medium">Fit</th>
                          <th className="py-2 pr-3 font-medium">Company</th>
                          <th className="py-2 pr-3 font-medium">Contact / Email (paste verified)</th>
                          <th className="py-2 pr-3 font-medium">Find</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((l) => (
                          <tr key={l.id} className="border-b border-app/50 align-top">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <p className="text-sm font-semibold text-app">{l.fit_score ?? 0}</p>
                              <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SIZE_STYLE[l.size_tier ?? "unknown"]}`}>{l.size_tier ?? "?"}</span>
                              <p className="mt-0.5 text-[11px] text-faint">{fmtCap(l.market_cap)}</p>
                            </td>
                            <td className="py-2 pr-3">
                              <p className="font-medium text-app">{l.name}</p>
                              <p className="text-xs text-faint">${l.ticker} · {l.exchange} · {l.industry}</p>
                              <p className="text-xs text-faint">{l.phone} · {l.recent_form}</p>
                              {l.fit_reason ? <p className="mt-0.5 text-[11px] text-emerald-600/80 dark:text-emerald-400/70">{l.fit_reason}</p> : null}
                            </td>
                            <td className="py-2 pr-3">
                              <input defaultValue={l.contact_name} onBlur={(e) => e.target.value !== l.contact_name && saveLead(l.id, { contact_name: e.target.value })} placeholder="Contact name" className="mb-1 w-full rounded border border-app bg-surface-2 px-2 py-1 text-xs text-app focus:outline-none" />
                              <input defaultValue={l.email} onBlur={(e) => e.target.value !== l.email && saveLead(l.id, { email: e.target.value })} placeholder="verified@email.com" className="w-full rounded border border-app bg-surface-2 px-2 py-1 text-xs text-app focus:border-emerald-500 focus:outline-none" />
                            </td>
                            <td className="py-2 pr-3 text-xs">
                              <a href={l.ir_lookup_url} target="_blank" rel="noreferrer" className="block text-emerald-600 hover:underline dark:text-emerald-400">IR contact ↗</a>
                              <a href={`/snapshot/${l.ticker}`} target="_blank" rel="noreferrer" className="block text-emerald-600 hover:underline dark:text-emerald-400">Snapshot ↗</a>
                              <a href={l.edgar_url} target="_blank" rel="noreferrer" className="block text-muted hover:underline">EDGAR ↗</a>
                            </td>
                            <td className="py-2 pr-3">
                              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[l.status] ?? "bg-app-hover text-faint"}`}>{l.status}</span>
                            </td>
                            <td className="py-2 text-right">
                              <button onClick={() => deleteLead(l.id)} className="text-xs text-faint hover:text-red-500">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {composeOpen && (
                <Card>
                  <h2 className="mb-1 font-semibold text-app">Compose outreach</h2>
                  <p className="mb-3 text-xs text-muted">Tokens: <code>{"{name}"}</code> <code>{"{company}"}</code> <code>{"{ticker}"}</code> <code>{"{snapshot}"}</code> (links to their free public visibility report — the conversion hook). Sends only to leads with an email that haven&apos;t been contacted, up to today&apos;s cap. An unsubscribe line is added automatically.</p>
                  <label className="mb-1 block text-xs font-medium text-muted">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mb-3 w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
                  <label className="mb-1 block text-xs font-medium text-muted">Message</label>
                  <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={9} className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none" />
                  <div className="mt-3 flex items-center gap-3">
                    <Button onClick={send} disabled={busy === "send"}>{busy === "send" ? "Sending…" : `✉ Send to ${leads.filter((l) => l.email && (l.status === "new" || l.status === "queued")).length} ready`}</Button>
                    <span className="text-xs text-faint">Capped per day to protect deliverability.</span>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
