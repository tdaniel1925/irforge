# Social Content Engine ("Predis for IRForge") — Implementation Plan

A per-company AI engine that: takes company data (filings, profile, press) + a
guided interview → builds and populates a **social calendar** → generates
**fully compliant, per-platform** posts (with AI images) for the channels the
company selects → lets the client **bulk review / edit / approve** → publishes
to channels on schedule via **Ayrshare native scheduling**.

This is a Predis-style workflow with IRForge's compliance enforced in code as
the differentiator: nothing publishes without human approval; FLS +
Section 17(b) disclosures are appended in the publish path; banned-claims +
Reg FD gates run before a human ever sees a draft.

---

## What already exists (reuse, don't rebuild)

| Capability | Where | Reuse as |
|---|---|---|
| Post storage + state machine (`draft→reviewed→approved→scheduled→published`) | `lib/iros.ts` (`iros_posts`) | Each calendar slot **is** an `iros_posts` row |
| `channels[]`, `scheduledAt`, `voiceProfileId` on the post | `iros_posts` row | Already there — no schema change for these |
| Voice profiles | `lib/iros.ts` `VoiceProfile`, `/api/iros/voices` | The "voice" output of the interview |
| AI drafting (Claude) | `lib/ai.ts` (`generateCadencePost`, `generateFilingThread`) | Extend with a calendar-aware generator |
| Compliance: banned-claims, FLS/disclosure append | `lib/compliance.ts` (`checkContent`, `hasBlockingFlags`, `buildPublishedThread`) | Run on every generated post; unchanged |
| Reg FD classifier | `lib/ai.ts` `classifyRegFD` | Run on every generated post |
| Ayrshare publish | `lib/ayrshare.ts` `publishToChannels` | Extend with `scheduleDate` + `mediaUrls` |
| Per-company Ayrshare profileKey (just fixed) | `company.ayrshareProfileKey` | Scopes every publish to the client's socials |
| Quiet mode / quiet periods | `lib/iros.ts` `isQuietPeriodActive` | Calendar must skip/blocking quiet windows |

**New deps:** `@google/genai` (image gen — `GEMINI_API_KEY` already in env), one
Supabase Storage bucket for generated images.

---

## Phase 1 — full build (everything), broken into shippable steps

### Step 1 — Interview & strategy (the "voice + plan" seed)
- New table `social_strategy` (one per company): cadence (posts/week), platforms
  selected, themes/pillars, audience, tone, do/don't list, derived from a guided
  interview.
- `app/social/interview` — short questionnaire UI (goals, audience, voice, topics,
  posting frequency, which platforms). Maps onto / creates a `VoiceProfile`.
- `lib/social/strategy.ts` — CRUD + `buildStrategyContext()` that assembles the
  interview answers **plus** company data (name, ticker, sector, description,
  peers, recent filings, press) into one context blob for the generator.

### Step 2 — Calendar generation
- New table `social_calendar` (or reuse `iros_posts` with a `calendar_slot` field
  — see Open Question 1). Each slot: date/time, platform(s), theme, status.
- `lib/social/calendar.ts` — `generateCalendar(strategy, month)`: Claude plans a
  month of slots (mix of post types: filing-driven, educational, milestone,
  engagement), respecting cadence + quiet periods. Returns slots, not yet drafted.
- `app/social/calendar` — month grid view; each cell shows planned slots + status.

### Step 3 — Per-platform compliant draft generation (+ images)
- `lib/ai.ts` `generateSocialPost(slot, strategyContext, platform)` → returns
  platform-formatted text (X thread vs LinkedIn long-form vs etc.).
- Run through the existing gate: `checkContent` → `classifyRegFD` → block if
  flagged. Store classification on the post.
- `lib/image.ts` — `generatePostImage(prompt)` via `@google/genai`
  (`gemini-3-pro-image-preview`, ported from PrismGraphs). Upload PNG to Supabase
  Storage → public URL → store as `mediaUrl` on the post.
- Each drafted slot becomes an `iros_posts` row (`status: draft`), with
  `channels`, `scheduledAt`, `mediaUrl`, classification.

### Step 4 — Bulk review / edit / approve
- `app/social/review` — list/grid of all draft posts for the calendar, with
  per-platform preview + image + compliance badges.
- Bulk actions: **approve selected**, **reject selected**, inline edit, regenerate
  text, regenerate image. Approving runs `recordApproval` (human-named, audited)
  and advances each post to `approved`/`scheduled`.
- Blocked posts (compliance flags) cannot be bulk-approved until edited clean —
  reuse `hasBlockingFlags`.

### Step 5 — Scheduled publish (Ayrshare native)
- Extend `lib/ayrshare.ts` `publishToChannels(text, channels, profileKey, opts)`
  with `opts.scheduleDate` (ISO) and `opts.mediaUrls`. When `scheduleDate` is set,
  Ayrshare holds and posts at the slot — IRForge hands off and records the
  schedule in the audit log.
- On bulk approve, approved+scheduled posts are sent to Ayrshare with their
  `scheduledAt`. Status → `scheduled`. A reconcile cron (existing Vercel cron)
  confirms `published` via Ayrshare history / webhook.

### Step 6 — Compliance & audit wiring (cross-cutting, not last)
- Every generated post: banned-claims + Reg FD before human sees it.
- Publish path still appends FLS + disclosure via `buildPublishedThread`.
- Quiet mode / quiet periods block scheduling into those windows.
- Audit log entries: calendar generated, draft generated, bulk approval (named
  human), scheduled, published.

---

## STATUS — all six steps shipped ✅

| Step | State | Key files |
|---|---|---|
| 1 Interview & strategy | ✅ | `lib/social/strategy.ts`, `/social`, `SocialEngine` |
| 2 Calendar generation | ✅ | `lib/social/calendar.ts` `generateCalendar`, `SocialCalendar` |
| 3 Drafts + AI images | ✅ | `lib/image.ts`, `draftCalendarBatch`, `/api/social/draft` |
| 4 Bulk review/approve | ✅ | `iros.ts` `bulkDecision`, `/social/review`, `SocialReview` |
| 5 Scheduled publish | ✅ | `ayrshare.ts` opts, `scheduleApprovedPosts` |
| 6 Compliance/audit | ✅ | banned-claims merged into classification; RED gates |

**Compliance guarantees verified end-to-end:**
- Every drafted post runs banned-claims (`checkContent`) + Reg FD (`classifyRegFD`)
  before any human sees it. A hard banned claim forces **RED**; other flags
  escalate green→yellow — so nothing slips through bulk-approve silently.
- RED is blocked from bulk approval (counsel only) and from scheduling (defense
  in depth in `scheduleApprovedPosts`).
- FLS + Section 17(b) disclosures are appended in the **publish path**, not the
  draft — they cannot be edited out.
- Quiet mode blocks the whole schedule run; quiet periods block sensitive approvals.
- Bulk approval records a **separate named-human approval per post** (audited).

## Posting dashboard (delivery visibility)
After approval, posts are scheduled to Ayrshare and tracked end-to-end at
`/social/outbox`: status (scheduled → posting → posted ✓ / failed), channel,
scheduled/posted time, a preview with image, a live link to the published post,
and a warning if a channel isn't connected. `scheduleApprovedPosts` persists
Ayrshare's post id + URL on the row; `reconcileScheduledPosts` (manual "Check
delivery status" button) and `/api/cron/reconcile-social` (every 15 min) ask
Ayrshare each post's live status and flip rows to published/failed.

## Operator setup (one-time, per environment)
1. Run `supabase/RUN-THIS-social-engine.sql` (table + columns + `social-images`
   bucket + publish-tracking columns: `ayr_post_id` / `post_url` /
   `publish_error` / `posted_at`). Idempotent — safe to re-run.
2. Toggle the **`social`** feature on for each company in Admin → Features.
3. Ensure `GEMINI_API_KEY` is set in env (images degrade gracefully without it).
4. Ayrshare must be connected per company (the profileKey fix is already in `main`).
5. Optional: `SOCIAL_MONTHLY_DRAFT_CAP` (default 120) bounds AI-drafted posts per
   company per UTC month; set 0 for unlimited.

## Cost cap
Each drafted post spends Claude (text + Reg FD) + Gemini (image). `draftCalendarBatch`
enforces a per-company monthly cap (`SOCIAL_MONTHLY_DRAFT_CAP`, default 120) by
counting `social.post_drafted` audit events since the start of the UTC month, and
refuses to spend AI calls past it (with a clear message + remaining-slot count).

## Live verification
`scripts/verify-social-engine.mjs` exercises the real pipeline end-to-end against
the live APIs (no browser/auth needed): Claude strategy/calendar/post + Reg FD,
banned-claims gate (incl. a negative control that MUST be caught), Gemini image,
and Ayrshare `scheduleDate`/`mediaUrls` field validation. All stages passing
confirms the engine produces real, compliant output. Run: `node scripts/verify-social-engine.mjs`.

---

## Open questions (resolve before Step 2)

1. **Calendar storage:** add `calendar_slot`/`scheduled_at` usage to `iros_posts`
   (reuse the state machine + approval + publish we already have) **vs** a
   separate `social_calendar` table that spawns `iros_posts` on approval.
   *Recommendation:* reuse `iros_posts` — a calendar slot is just a scheduled post.
2. **Image hosting:** Supabase Storage public bucket (simplest; Ayrshare needs a
   public URL for `mediaUrls`). Confirm bucket + size/cost expectations.
3. **Per-platform formatting depth:** v1 = X + LinkedIn well-formatted; others
   (FB, IG, GMB) get a sensible default. Which platforms must be first-class?
4. **Credits / cost:** Gemini image + Claude per post × a month × platforms can
   add up. Cap per calendar generation? Per-company monthly limit?

---

## Risks / notes
- Ayrshare native scheduling means IRForge doesn't control the exact send moment;
  treat Ayrshare history as source of truth for `published` (mirror the video
  webhook lesson: poll/confirm, don't assume).
- Image generation is synchronous (~seconds) but can fail/refuse — always allow
  "skip image" so a post isn't blocked on an image.
- Bulk approval is the compliance-sensitive action: it must record a named human
  per post (not one approval for the batch) to keep the audit log defensible.
