# Dashboard state-consistency gap audit

## FIXED

### 1. Member sees "view-only" banner but every company-profile input is editable
`app/settings/page.tsx`
- Banner (line 71-75) tells members "these company settings are view-only", the Save button is disabled for members (line 154), and a `beforeunload` "unsaved changes" warning fires (line 23-28) — yet **all** company-profile inputs (name, ticker, exchange, CIK, X handle, sector, approver name/title, brand colors, description, peers) and the two disclosure textareas had **no `disabled` guard**. A member could type edits, trigger the unsaved-changes warning, and never be able to save — a direct analogue of the reference bug (contradictory state shown alongside a still-live edit affordance).
- Severity: medium (UX contradiction + implies member can edit compliance disclosure text).
- Fix applied: added `disabled={!isAdmin}` to all `<Field>` inputs, the description/peers/disclosure/FLS textareas, and threaded a `disabled` prop through the `Field` component (with `disabled:opacity-60` styling). Quiet-mode toggle (line 86) and Save (line 154) were already correctly gated.

## REPORTED (structural / needs decision)

### 2. AddDisclosure card is usable by members
`app/settings/page.tsx:181-260` (`AddDisclosure`)
- "Add a disclosure" writes a filing via `/api/filings/add`. Disclosure editing is an admin-only dimension per the audit, but this nested component receives no `isAdmin` prop, so the "+ Add" button and form are live for members. Fix requires plumbing `isAdmin` into `AddDisclosure` (and ideally relying on server-side role enforcement in `/api/filings/add`). Left as report because it's a prop-threading change and depends on whether the API already blocks members.
- Severity: medium.

### 3. Quiet-mode banner and publish-guard read different sources
`components/QuickPostComposer.tsx:269` vs `:262`
- The visible quiet-mode banner keys off `db.company.quietMode` (client app-state), while `canPublish` keys off `preview.quietMode` (server preview response). If the two ever diverge (e.g. app-state stale after a settings change, or preview built before quiet mode toggled), the UI could show no banner while still blocking publish, or show the banner while `preview.quietMode` is false and allow publish. Both are guards so neither fully breaks, but they should read one source of truth. Report — needs a decision on canonical source.
- Severity: low.

## CHECKED — no gap

- `components/FreeTierBanner.tsx`: only renders when `tier === "free"` — does not show for paid users. OK.
- `components/FeatureGate.tsx`: fails closed, unlocks only when `tierHasFeature`. OK.
- `components/ComposeShell.tsx`: schedule/month modes correctly gated by `canPipeline`/`canSocial` with `UpgradePrompt` fallback. OK.
- `app/app/page.tsx`: not-onboarded (`!ticker`) short-circuits to a "finish setup" screen before dashboard renders. OK.
- `app/setup/page.tsx`: company section admin-only; `allDone` banner correct; members told company items are admin-handled. OK.
- `app/social/setup/page.tsx`: all editable controls guarded by `disabled={!isAdmin}`; member view-only banner present. OK.
- `QuickPostComposer` channels: "no accounts connected" only shows when `connectedKeys.size === 0`; `notConnected` warning drives publish guard. OK.
- `app/settings` SocialConnections: connect/disconnect states derive from live `connected` set; "Connect accounts" vs "Manage connections" label switches on `connected.size`. OK.
