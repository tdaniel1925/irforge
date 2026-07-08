# State-consistency gap audit — 2026-07-08

Triggered by: the public ticker page showed a "claimed" badge AND still rendered the
"claim this page" box. Audited the whole app for that class of bug — UI showing two
contradictory states because a conditional guard was missing or wrong. Three parallel
audits. Sub-reports: gap-audit-public.md, gap-audit-dashboard.md, gap-audit-admin.md.

## FIXED (6 real bugs)

1. **Claimed page still showed the claim box** — `app/t/[ticker]/page.tsx:756`
   `<ClaimCard>` had no guard; wrapped in `!claimed`. (The original report.)

2. **Claimed page showed claim-pressure copy** — `app/t/[ticker]/page.tsx` "The
   conversation" section printed "Investors are writing $X's story without it." to
   everyone, contradicting the claimed badge. Now gated on `!claimed`.

3. **Snapshot page had NO claimed state** — `app/snapshot/[ticker]/page.tsx` always
   showed "Claim $TICKER" even for claimed companies. Added `isTickerClaimed`; claimed
   companies now get a "✓ on PubcoZone / Open the dashboard" CTA. (Same class as #1.)

4. **Active/paid customer still offered billing actions** — `app/admin/customers/page.tsx:258`
   An `active` company still showed "Send subscription invoice", "Comp", "Comp full" —
   could double-bill or re-comp. Gated behind `!isActive`; Setup fee, Act as, Cancel stay.

5. **Members could edit company settings** — `app/settings/page.tsx` the view-only
   banner showed but every Field + disclosure textarea was editable. Added
   `disabled={!isAdmin}` throughout.

6. **Members could add disclosures** — `app/settings/page.tsx:151` the "Add a
   disclosure" form now renders only for admins.

## REPORTED — reviewed, deliberately NOT changed
- `app/t/[ticker]/page.tsx:344-375` (LOW) — legacy analyst block is dead code
  (analyst.bull/bear hardcoded empty). No live contradiction. Gate on `!claimed` if
  re-enabled.
- `components/QuickPostComposer.tsx` (LOW) — quiet-mode banner vs publish guard read
  the same server truth; only diverges across tabs. Correct enough; left as-is.
- `components/PostsShell.tsx:88,98` (LOW) — Scheduled/Published both use SocialOutbox;
  leak-prevention is internal to SocialOutbox. Not a confirmed bug.

## VERIFIED CONSISTENT (no bug)
Hero badge, ClaimCard, locked-features, disclosures, Q&A badge+status, AskCompany,
MessageBoard, ManipulationRadar, welcome, discover, sample-brief; FreeTierBanner
(free-only), FeatureGate (fails closed), ComposeShell, Home onboarding short-circuit,
social/setup; admin claim queue (pending-only), leads send (new-only), BoardQA,
company/proof counts, CRM, ImpersonationBanner.

Build clean, 84 tests pass.
