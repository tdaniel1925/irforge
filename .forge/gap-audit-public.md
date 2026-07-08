# State-Consistency Gap Audit — Public + Claim/Verified Surfaces

Reference bug (already fixed): `/t/[ticker]` showed a "CLAIMED" badge AND the ClaimCard because the box had no `!claimed` guard. This audit hunts for the same class of contradiction.

## FIXED

### 1. `app/t/[ticker]/page.tsx:526` — claim-pressure paragraph shown to CLAIMED pages — HIGH
The "The conversation about $X" section rendered a hard claim-pressure line for every visitor:
> "…Replies from the company: 0. Investors are writing $X's story without it."

This block had no `claimed` guard, so a **claimed** company (whose page shows the green "✓ CLAIMED" badge at the top) still saw "Replies from the company: 0. Investors are writing $X's story without it." — the exact contradiction pattern of the reference bug (claimed badge + unclaimed pressure copy).
**Fix applied:** wrapped the `<p>` in `{!claimed && ( … )}`. The message list above it still renders for everyone; only the "company is silent / writing your story without it" pressure line is now suppressed once claimed.

## REPORTED (not changed — structural)

### 2. `app/snapshot/[ticker]/page.tsx:79-127` — snapshot always assumes UNCLAIMED — HIGH (structural)
The snapshot page has **no notion of claimed state at all** (`buildSnapshot` in `lib/snapshot.ts` never queries `isTickerClaimed` — confirmed by grep: no `claimed`/`verified` reference in that lib). As a result the page unconditionally renders claim-pressure + claim CTAs even for a company that already owns its page:
- line 80-81: "⚠ Where $X is losing investor attention" (loss-aversion gap block)
- line 114-126: "This is your company's story — are you telling it? … **Claim $X** & get the full report →" plus "Free to claim. No card required."

For a claimed company this is the same contradiction as the reference bug, but the fix is not a one-line guard: it requires (a) awaiting `isTickerClaimed(ticker)` in the server component, and (b) branching the hero CTA to a "manage your page" link and softening/hiding the gap-pressure copy when claimed. Left for a deliberate change because it alters data-fetching and copy, not just visibility. Recommended guard once `claimed` is available: gate the CTA card and the gaps block on `!claimed`, and show a "View your live page → /t/$X" affordance when claimed.

### 3. `app/t/[ticker]/page.tsx:344-375` — AI Analyst claim-pressure line is dead code — LOW
Line 113 hardcodes `analyst = { bull: "", bear: "", faq: [] }` ("legacy section now hidden; panel covers it"), so the whole `{(analyst.bull || analyst.bear) && …}` block at 345 — including the line "If this is your company, claim this page to add your verified voice." (line 372) — can never render. No live contradiction today. If the legacy analyst is ever re-enabled, that claim-pressure sentence must be gated on `!claimed`. Reported only; no change (it cannot currently produce a contradiction).

## CHECKED — CONSISTENT (no bug)

- `app/t/[ticker]/page.tsx`
  - Hero badge (201-209): correct — CLAIMED vs UNCLAIMED are mutually exclusive branches.
  - ClaimCard (758-762): already gated `!claimed` (the reference fix).
  - "What $X could be doing" locked-features block (728-753): already gated `!claimed`.
  - Company disclosures (146, 427): `companyFilings` computed `claimed && db …`; section only renders when non-empty → company-only content never leaks to unclaimed. Correct.
  - Q&A section badge (702) and per-question status line (719): both branch on `claimed`. Correct.
- `components/ClaimCard.tsx` — hard-codes "UNCLAIMED PAGE" copy, which is fine because its only call site is already `!claimed`-gated.
- `components/AskCompany.tsx` — takes `claimed` prop; all claimed-dependent copy (43, 66) branches correctly.
- `components/MessageBoard.tsx` — no claimed assumption; "verified"/"answered"/"FROM THE COMPANY" derive per-post from `p.verified`, independent of page claim state. Consistent.
- `components/ManipulationRadar.tsx` — no claimed logic; neutral board-activity banner. Consistent.
- `app/welcome/[ticker]/page.tsx` — intentionally claim-agnostic marketing splash; no claimed/unclaimed contradiction (no badge, no state claim). OK.
- `app/discover/page.tsx` — rankings/quotes only; no claimed/verified surface. OK.
- `app/sample-brief/page.tsx` — static sample, clearly labeled "SAMPLE"; no per-company claimed state. OK.

## Verification
`npx tsc --noEmit -p tsconfig.json` — clean (no errors) after the fix.
