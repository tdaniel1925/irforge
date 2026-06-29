# Feature gap audit — 2026-06-29

Triggered by two user-reported bugs. Both fixed; full-app sweep found no other gaps.

## CRITICAL (fixed this session)

### 1. Team / user management bounced to Home
- **Cause:** `app/admin/layout.tsx:12` gated the entire `/admin/*` tree behind
  `isSuperAdmin()` (platform-level). Team management lived at `/admin/team`, so any
  *company* admin hitting it was `redirect("/app")`'d to Home before the page rendered.
  The page + `/api/team` endpoints were fully built and correctly authorized by RLS
  (company-admin) — just walled off.
- **Fix:**
  - Moved the UI to a new top-level route `app/team/page.tsx` (gated only on having a
    company, not super-admin), reusing a shared `components/TeamManager.tsx`.
  - `next.config.mjs` redirect `/admin/team` -> `/team` (runs *before* the admin
    layout, so old links no longer bounce). `app/admin/team/page.tsx` is now a
    redirect stub fallback.
  - Settings "Manage team & invite people" now links to `/team`.
  - Added a **Team** item to the Sidebar ("Create & schedule" section).

### 2. Press-release "Generate" button appeared missing
- **Cause:** `StudioEditor.tsx` put the Generate/Revise button in a `sticky bottom-0`
  bar inside an `h-[calc(100vh-7rem)]` frame. Nested below the Compose page's header +
  mode tabs, that frame overflowed and pushed the bar (and button) off-screen. The
  button was also disabled until an instruction was typed — compounding "where is it?".
- **Fix:** Restructured `StudioEditor.tsx` to natural document flow. The AI
  instruction box + **Generate/Revise button now sit at the TOP, always visible**;
  the editable document is below. Added a hint when the instruction is empty.

## MEDIUM
None found.

## LOW
None found.

## Sweep coverage (all clean)
- **Sidebar nav -> pages:** every nav href resolves to a real page. No missing pages.
- **Redirects/notFound:** all remaining redirects are intentional route consolidations
  (e.g. `/social/*`, `/studio`, `/voices`, `/metrics`, `/mentions`, `/calendar-os`
  -> their new unified homes) or correct auth gates (`redirect("/login")` when not
  signed in). No other over-restrictive bounce like the `/admin` wall.
- **Buttons/handlers:** no empty `onClick={() => {}}`, no `disabled={true}` dead
  buttons, no TODO/FIXME/"coming soon"/"not implemented"/WIP markers in app/components.
- **API wiring:** all 68 referenced `/api/...` paths have a matching route file
  (incl. dynamic `/api/chart/[ticker]`). No broken or orphaned endpoints surfaced.
