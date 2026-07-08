# UX Gap Audit — Silent failures, dead-end empties, missing success feedback, dead buttons

Scope: highest-traffic authed pages/components. State-consistency excluded (done separately).
Kinds: (1) Silent failure, (2) Empty state dead-end, (3) No success feedback, (4) Button does nothing visible.
NOT changing code — report only.

---

## HIGH severity

### 1. app/captable/page.tsx — Silent failure (Kind 1)
- **`patch()` at line 83 (CapHolders) and line 133 (Notes)** — `const patch = async (body) => { await fetch("/api/captable"...); await refresh(); }`. No `res.ok` check, no try/catch. Changing a holder's **Intent** dropdown (line 109), a note's **status** dropdown (line 171), or clicking **delete/remove** (lines 113, 174) fires this. If the request fails (403/500/network), the user gets NO error, and after `refresh()` the value silently snaps back — they think they changed it but nothing persisted.
- Severity: **High** — user is misled; a delete or intent change they believe succeeded may have failed silently.
- Fix: check `res.ok`; on failure `setNotice({ text: data.error ?? "Couldn't save that change.", tone: "error" })`.

### 2. components/TeamManager.tsx — Silent failure (Kind 1)
- **`load()` at lines 29-38** — `fetch("/api/team")` is wrapped only in `try { ... } finally { setLoading(false) }` with NO catch. If the request throws (network) the error propagates unhandled and the roster stays empty; if it returns a non-OK JSON error body, `d.members ?? []` yields an empty list and `isAdmin=false` with no message. An admin who briefly lost connectivity sees an empty team with no invite controls and no explanation.
- Severity: **High** — admin appears to have no team / no permissions, dead-ends with no retry guidance.
- Fix: add `catch` that sets an inline error/retry banner; distinguish "load failed" from "genuinely empty".

### 3. components/CrmWorkspace.tsx — Buttons do nothing visible / double-submit (Kind 4)
- **`del()` (contacts L128, companies L255, tasks L366), `move()` (deals L302), `toggle()` (tasks L365)** — these have no busy/disabled state. Deal stage `<select>` (L340), the task complete checkbox (L385/395), and Delete confirms fire an async `api()` call with zero in-flight feedback. Rapid re-clicks (e.g. toggling a task twice, changing stage twice fast) issue overlapping writes with no guard. Errors DO surface via `setErr`, so this is the double-submit / no-busy half of Kind 4, not a silent failure.
- Severity: **High** for `move()`/`toggle()` (optimistic-free, double-fire risk on the most-clicked controls); Low for deletes (InlineConfirm adds a step).
- Fix: disable the control while its request is in flight (per-id busy flag).

---

## LOW severity

### L1. components/EditorialBoard.tsx — Empty column placeholder (Kind 2)
- Empty kanban columns render just `"—"` (line 274). Acceptable: the board has a global "+ New post" button and drag flow; a bare dash per column is cosmetic, not a dead-end. Low.

### L2. components/BoardQA.tsx — load error is terminal (Kind 1/2, minor)
- `load()` sets `err` on failure (lines 46/53) and the whole component then renders only the error banner (line 126) with no Retry button — user must refresh the page. Errors ARE shown, so not silent; just no in-place retry. Low.

### L3. components/StudioEditor.tsx — "no-op" success framed as error (Kind 3, minor)
- `polish()` line 50: when AI returns no changes it calls `setError("Looks clean already…")` — a benign/success message shown in the **red** error style. Misleading tone but not a functional gap. Low.

### L4. app/social/setup/page.tsx — `generateSample()` missing catch (Kind 1, minor)
- Lines 91-106: the `act()` PUT + generate fetch are in a `try/finally` with no `catch`; a thrown network error on the pre-save `act()` would clear busy but show nothing. The fetch branch itself checks `res.ok`. Edge-case only. Low.

### L5. app/captable/page.tsx — `add()` no network catch (Kind 1, minor)
- CapHolders `add()` (L78) and Notes `add()` (L128) check `res.ok` and show success/error notices, but a thrown network error (fetch rejects) is unhandled — no notice. Success feedback IS present on the happy path. Low.

### L6. components/SocialConnections (in app/settings/page.tsx) — `load()` swallows errors (Kind 1, minor)
- `load()` (L329) `.catch(() => ...)` on both fetches defaults to empty/false silently. This is a background status load on mount, and the UI has explicit "not configured"/"no accounts" states, so a failure is hard to distinguish from "nothing connected" — but it's a passive load, not a user action. Low.

---

## Notes on files that are CLEAN (no material gaps)
- **QuickPostComposer.tsx** — exemplary: every user action (publish, preview, fit, AI-write, upload, generate) has busy state + inline error + a `done` success card. Accounts-load failure surfaces `acctsErr`.
- **app/analyzer/page.tsx** — `run()` has busy, res.ok check, network catch, and "Analysis ready below." success. Empty state has guidance. Clean.
- **app/documents/page.tsx** — add/import/remove all have res.ok checks, notices (incl. "No new filings found" info state), and guided empty states. Clean.
- **app/settings/page.tsx (main form)** — save/toggleQuiet show success + error Banners, dirty indicator, beforeunload guard. Clean.
- **app/company/page.tsx** — rebut/refreshScore have notices + error branches; threat scan shows scanning/error/empty states. Clean.
