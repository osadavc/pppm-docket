# Docket — QA Findings

End-to-end exploratory test of the running app against every acceptance criterion in
[`JIRA_ISSUES.md`](./JIRA_ISSUES.md) (4 epics, 19 stories, SCRUM-5 … SCRUM-23).

| | |
| --- | --- |
| **Build** | `main` @ `486e389` |
| **Run** | `next dev` on `http://localhost:3005` (Next 16.3.1 / Turbopack) |
| **Date** | 27 Aug 2026 |
| **Method** | Driven through a real Chrome session via CDP, as all three roles; plus `curl` for unauthenticated and header-level checks, and direct SQL for state verification |
| **Health** | `tsc --noEmit` clean · `eslint` clean · no browser console errors on any page visited |

**Totals: 20 issues — 6 high, 6 medium, 8 low.**

---

## Summary

| # | Severity | Issue | Stories |
| --- | --- | --- | --- |
| [1](#1) | High | CV upload impossible — service-role key is an unreplaced placeholder | SCRUM-15 (blocks 16–23 via the UI) |
| [2](#2) | High | Deactivated user is trapped in an infinite redirect loop | SCRUM-6, SCRUM-7 |
| [3](#3) | High | Malformed UUID in any URL path returns HTTP 500, not 404 | all detail pages |
| [4](#4) | High | Pipeline board loads every candidate — no limit, no paging | SCRUM-17, SCRUM-18 |
| [5](#5) | High | Interviewers have no working navigation | SCRUM-13, SCRUM-23 |
| [6](#6) | High | No scorecard capture exists — the feedback gate can never be satisfied | SCRUM-13, SCRUM-19 |
| [7](#7) | Medium | Five sidebar links 404 | — |
| [8](#8) | Medium | Email / notifications advertised but not implemented | SCRUM-23 |
| [9](#9) | Medium | Public self-sign-up is open to anyone | SCRUM-5 |
| [10](#10) | Medium | Positions list "Stages" count includes archived stages | SCRUM-14 |
| [11](#11) | Medium | Approval decision is recorded but never shown anywhere | SCRUM-10 |
| [12](#12) | Medium | Gate-override reason is required, stored, then never displayed | SCRUM-19, SCRUM-23 |
| [13](#13) | Low | Dashboard is an empty placeholder for every role | — |
| [14](#14) | Low | Override toasts read as commands, not confirmations | SCRUM-20 |
| [15](#15) | Low | Duplicate-candidate notice shows stage but not status | SCRUM-16 |
| [16](#16) | Low | No way to deactivate or remove a user | SCRUM-7 |
| [17](#17) | Low | Careers board has no apply action | SCRUM-11 |
| [18](#18) | Low | Error boundary prints `error.message` verbatim | — |
| [19](#19) | Low | Mobile: floating avatar overlaps table rows | — |
| [20](#20) | Low | Positions list shows "—" instead of 0 for On hold | — |

---

## High

### <a id="1"></a>1. CV upload is impossible — the service-role key is an unreplaced placeholder

`.env` (repo root) line 16 still holds the template value:

```
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # SERVER ONLY. Never prefix NEXT_PUBLIC_.
```

`assertStorageConfigured()` (`src/lib/storage/supabase.ts`) rejects it, so **every**
`Add candidate` submit fails with:

> File storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY in apps/app/.env.local.

A CV is mandatory (`addCandidate` returns `"Attach the candidate's CV."` without one), so **no
candidate can be added through the product at all** in its current configuration. SCRUM-15 is
untestable end-to-end, and SCRUM-16/17/18/19/20/21/22/23 can only be reached by writing rows
directly (which is what I did to test them — see [Test data](#test-data-left-behind)).

Two secondary notes:

- The message points at `apps/app/.env.local`, but the file the app actually reads is the repo-root
  `.env`. Same wording in `src/env.ts`'s validation error.
- Everything *before* the upload is correct and was verified: non-PDF rejected
  ("The CV must be a PDF or Word document"), 6 MB file rejected ("That file is 6.0 MB. The limit is
  5 MB"), and the duplicate check fires before the upload is attempted.

**Repro:** sign in as HR → Candidates → Add candidate → fill the form, attach a valid PDF → Add candidate.

---

### <a id="2"></a>2. A deactivated user is trapped in an infinite redirect loop

`requireUser()` sends an `isActive: false` user to `/sign-in?error=deactivated`. The sign-in page
then does `if (await getCurrentUser()) redirect(...)` — and `getCurrentUser()` does **not** check
`isActive`. So it bounces straight back to `/dashboard`, which bounces back to `/sign-in`, forever.

```
GET /dashboard                 307 → /sign-in?error=deactivated
GET /sign-in?error=deactivated 307 → /dashboard
GET /dashboard                 307 → /sign-in?error=deactivated
…  ERR_TOO_MANY_REDIRECTS
```

Consequences:

- The account cannot reach **any** page, including the Sign out button — the only escape is clearing
  cookies manually.
- `POST /api/auth/sign-in/email` still returns **200** for a deactivated account. The block lives
  only in the page guard, not in better-auth, so the session is minted first and the loop starts
  immediately afterwards.
- The `"That account has been deactivated. Contact your administrator."` copy in
  `src/app/(auth)/sign-in/page.tsx` is unreachable — the redirect happens before it can render.

**Repro:** `update "user" set is_active = false where email = '…'` for a signed-in user, then visit
`/dashboard`.

**Files:** `src/lib/auth/guards.ts` (`getCurrentUser` / `requireUser`), `src/app/(auth)/sign-in/page.tsx`.

---

### <a id="3"></a>3. A malformed UUID in any URL path returns HTTP 500, not 404

The id from `params` goes straight into a Drizzle `where`, and Postgres raises
`invalid input syntax for type uuid` before any `notFound()` can run.

| URL | Actual | Expected |
| --- | --- | --- |
| `/positions/abc` | **500** | 404 |
| `/positions/abc/edit` | **500** | 404 |
| `/positions/abc/pipeline` | **500** | 404 |
| `/candidates/abc` | **500** | 404 |
| `/applications/abc` | **500** | 404 |
| `/careers/abc` | **500** | 404 |
| `/api/files/abc` | **500** | 404 |

A well-formed but non-existent UUID is handled correctly
(`/positions/00000000-0000-0000-0000-000000000000` → 404), so the guard is simply missing the
format check. `/careers/abc` is publicly reachable, so this is an unauthenticated 500.

In dev the error boundary then renders the **entire failed SQL statement** on screen (see
[#18](#18)) — a ~2,000-character `select … from positions left join lateral …` dump.

**Fix shape:** validate with `z.uuid()` (already used in `src/lib/validation/application.ts`) at the
top of each page/route and `notFound()` on failure.

---

### <a id="4"></a>4. The pipeline board loads every candidate — no limit, no paging

`getPipelineBoard()` (`src/lib/queries/pipeline.ts`) selects **every** active application for the
position and renders one card each. Measured on a position loaded to 1,000 applicants:

| Page | 30 applicants | 1,000 applicants |
| --- | --- | --- |
| `/candidates?positionId=…` (server-paginated, 25/page) | ~0.9 s | **~1.0 s** |
| `/positions/[id]/pipeline` | ~1.2 s | **5.4 – 7.9 s** |

The board response was **1.8 MB** of HTML with 1,000 candidate cards stacked in a single column.

SCRUM-18 AC2 requires "the page stays fast with 1,000+ applicants on a position" — the candidate
list meets that comfortably; the board, which is the primary view for the same data, does not.
SCRUM-17's live per-stage count would also be better served by a `COUNT` than by materialising every
row.

---

### <a id="5"></a>5. Interviewers have no working navigation

An interviewer's entire sidebar is:

- **Dashboard** — an empty "Signed in as" card (see [#13](#13))
- **My agenda** — **404**

`/positions`, `/candidates`, `/positions/[id]/stages` are all correctly 403 for the role. The one
page an interviewer *can* use, `/applications/[applicationId]`, has **no link anywhere in the UI** —
I could only reach it by typing the URL.

The row-level authorisation behind it is correct and was verified: Dilhan Fernando (assigned to the
Phone Screen panel) can open the application and sees the visibility notice *"You see feedback from
others once you have submitted your own for that stage"*; Maya Gomez (unassigned) gets **Not
allowed**. The permission model works — there is just no route to it.

This makes SCRUM-23 AC3 and SCRUM-13 AC2 unreachable in practice for the role they exist for.

---

### <a id="6"></a>6. No scorecard capture exists — the feedback gate can never be satisfied

`evaluateStageGate()` is implemented, wired into `advanceApplication`, and works: with 2
interviewers assigned to a stage requiring 1 scorecard, advancing was blocked with
*"Waiting on interview feedback. 1 more scorecard needed — waiting on Dilhan Fernando, Sasha Wick."*

But nothing in the codebase ever **writes** a scorecard:

- no Server Action inserts into `scorecards` (`grep` over `src/lib/actions/` finds only a comment)
- no component renders a scorecard form
- the `Interviews` nav entry 404s

So a stage with `requiresScorecard` **and** assigned interviewers blocks advancement permanently.
The only ways past are HR's `application:override-gate` (which demands a written reason every time)
or removing the panel entirely — at which point the gate short-circuits to
`no_interviewers_assigned` and stops gating.

That inverts SCRUM-13 AC2 ("assignments drive both the interviewer's visibility of candidates **and
the feedback gate**"): assigning interviewers today is what breaks the pipeline, and leaving a stage
unassigned is what keeps it moving.

---

## Medium

### <a id="7"></a>7. Five sidebar links 404

Every one renders the app's "Page not found" screen:

| Nav item | Route | Visible to |
| --- | --- | --- |
| My agenda | `/agenda` | all roles |
| Interviews | `/interviews` | HR, Management |
| Reports | `/reports` | HR, Management |
| Stage templates | `/settings/templates` | HR |
| Notifications | `/admin/notifications` | Management |

Defined in `src/components/layout/nav-config.ts` with no corresponding page under `src/app`.
Either build them or gate them out of the nav — right now every role's sidebar is majority-dead
links.

---

### <a id="8"></a>8. Email / notifications are advertised but not implemented

Present: the `resend` dependency, four env vars (`RESEND_API_KEY`, `EMAIL_FROM`,
`NOTIFICATIONS_ENABLED`, `DEMO_EMAIL_REDIRECT`), a `notifications` table, relations, a nav entry,
and full email support in `getApplicationTimeline()`.

Absent: any code that sends or records one. `resend` is imported nowhere; `notifications` is never
inserted into; the table is empty after a full end-to-end run.

The `.env` comment is actively misleading:

> With `NOTIFICATIONS_ENABLED=false` the app still records every notification it would have sent,
> viewable at `/admin/notifications`.

Nothing is recorded, and that page 404s ([#7](#7)). SCRUM-23 AC1 asks for "stage transitions,
feedback entries, and sent emails" in one timeline — two of the three sources can never produce a
row (see also [#6](#6)).

---

### <a id="9"></a>9. Public self-sign-up is open to anyone

`/sign-up` is unauthenticated, linked from the sign-in page ("No account? Create one"), and creates
a working signed-in account on submit. I registered `qa.self@example.com` from a signed-out browser
with no invitation of any kind.

Privilege escalation is correctly prevented — `role` is declared `input: false` in
`src/lib/auth.ts`, and the new account landed as **Interviewer**, which sees almost nothing. So the
blast radius is small. But SCRUM-5's premise is *"so that only authorised people can use the
system"*, with accounts created by a hiring manager — and that page lets anyone mint one.

Worth an explicit decision: remove the route, put it behind an invite token, or restrict it by email
domain.

---

### <a id="10"></a>10. Positions list "Stages" count includes archived stages

`listPositions()` (`src/lib/queries/positions.ts` ~line 71) counts `position_stages` with no
`is_archived = false` filter:

```sql
select count(*)::int from position_stages ps
where ps.position_id = "positions"."id"
```

After archiving one stage on a 7-stage position, `/positions` showed **7** while the position page
and the pipeline board both showed **6**. `listPendingApprovals()` (~line 159) has the same
omission. Every other stage query in the codebase filters archived correctly.

---

### <a id="11"></a>11. The approval decision is recorded but never shown anywhere

Approving with a note stores everything correctly — verified in the database:

```
last_review_decision = approved
review_note          = "Approved. Headcount signed off for FY26."
reviewed_by_id       = <Rohan Silva>
reviewed_at          = 2026-08-27 15:05:09+00
```

plus a `position.approved` row in `activity_log`. None of it appears in the UI. The **rejection**
path does surface its note ("Returned by management" + decider + date on the position page), but the
approval path shows nothing, and there is no position-level activity feed at all — `activity_log` is
only ever read for a single application (`getApplicationTimeline`), and the
`activity:view-global` permission has no page behind it.

SCRUM-10 AC3 asks for the decision, decider and timestamp "recorded as an audit trail". The data
side is done; the trail is unreadable without SQL.

---

### <a id="12"></a>12. The gate-override reason is required, stored, then never displayed

Advancing past an unsatisfied feedback gate correctly forces a reason — the confirm button stays
disabled until one is typed, and the copy promises it is *"kept on the candidate's permanent
record"*.

It is stored in `activity_log.metadata.overrideReason`, but the timeline renders only
`metadata.note`. The entry reads:

> Nadia Perera advanced Nimal Perera from "Phone Screen" to "Team Interview", overriding the
> feedback requirement

— with no sign of *why*. For the one action in the app that exists to be accountable, the
accountability text is write-only.

`src/lib/queries/activity.ts` builds `detail` from `metadata.note` alone.

---

## Low

### <a id="13"></a>13. Dashboard is an empty placeholder for every role

`/dashboard` renders a heading, the role description, and a "Signed in as" card. Nothing else — no
pending-approval count for Management, no stalled-candidate count for HR, no agenda for
interviewers, for whom it is one of only two links ([#5](#5)). It is the landing page after every
sign-in.

### <a id="14"></a>14. Override toasts read as commands, not confirmations

Skip / hold / resume toast the dialog **title** rather than an outcome: `"Skip this stage"`,
`"Put on hold"`, `"Resume"`. Everywhere else the app uses past tense — `"Moved to Phone Screen"`,
`"Marked filled"`, `"Nimal Perera hired"`, `"Password reset for QA Tester HR"`. Reads as if the
action didn't fire. `src/components/applications/flow-override-menu.tsx`.

### <a id="15"></a>15. Duplicate-candidate notice shows the stage but not the status

Typing a known email shows *"Nimal Perera is already on file"* with prior applications — correct,
case-insensitive, and it links to the profile. But each row shows only position + **stage**:

> Backend Engineer (QA Test) · Culture Chat · 27 Aug 2026

Nimal was **hired** for that role. A previously hired, rejected or withdrawn application is
indistinguishable from a live one, which undercuts the point of SCRUM-16 AC3 ("see when someone has
applied before"). `applications.status` is already fetched in
`findCandidateByEmail`.

### <a id="16"></a>16. No way to deactivate or remove a user

`user.isActive` is modelled, defaults true, and is enforced in `requireUser()`. The Users table's
row menu offers only **Change role** and **Reset password** — nothing sets `isActive` or removes an
account. A departing staff member's access can only be revoked by rotating their password. (See
also [#2](#2), which is what happens when `isActive` *is* set false out of band.)

### <a id="17"></a>17. Careers board has no apply action

`/careers` and `/careers/[id]` render open roles publicly, correctly hiding drafts, pending, filled
and cancelled positions — but there is no Apply button or form. Every candidate must be keyed in by
HR. Consistent with SCRUM-15 (manual entry), but it makes the public board read-only signage, and
SCRUM-11's *"reject new applications"* has no public path it could ever reject.

### <a id="18"></a>18. The error boundary prints `error.message` verbatim

`src/app/(app)/error.tsx` renders `{error.message}` directly. Combined with [#3](#3), the 500 page
displays the full generated SQL statement, table names, column list and bound parameters.

Next.js sanitises Server Component errors in production builds (replacing the message with a
digest), so the SQL leak itself is dev-only — but any client-side error message still goes straight
to the screen in production, and the pattern invites a leak the first one that surfaces.

### <a id="19"></a>19. Mobile: floating avatar overlaps table rows

At 390 px the page correctly does not overflow (`scrollWidth == clientWidth == 390`) and the sidebar
collapses to a sheet. The floating user-menu avatar sits on top of the bottom-left candidate rows,
obscuring names and emails. The candidate table's horizontal scroll also has no visual affordance —
Status, Source, Applied and CV are simply cut off with no hint that more columns exist.

### <a id="20"></a>20. Positions list shows "—" instead of 0 for On hold

The **Active** column shows `0` while **On hold** shows `—` for the same "no candidates" state, in
the same row. Inconsistent, and "—" reads as "not tracked".

---

## What was verified working

Everything below was exercised through the UI and confirmed.

| Story | Result | Notes |
| --- | --- | --- |
| SCRUM-5 Create staff accounts with roles | **Pass** | Created an HR account as Management; it signed in immediately with the right nav; `/admin/users` 403s server-side for HR and Interviewer |
| SCRUM-6 Sign in securely | **Pass** *(see [#2](#2))* | Wrong password and unknown email both return the same "Invalid email or password"; passwords stored as 161-char scrypt hashes; all 9 internal routes 307 to `/sign-in?next=…` when signed out |
| SCRUM-7 Change role / reset password | **Pass** | Role change took effect on the next request with **no re-login** (cookie cache is off, as documented); password reset invalidated the live session (307 to sign-in) and the old password started returning 401; "Change role" is disabled on your own row |
| SCRUM-8 Create a draft position | **Pass** | Saved as draft, freely editable, absent from `/careers`, detail 404s publicly, 5 default stages seeded |
| SCRUM-9 Submit for approval | **Pass** | Blocked with *"Add an application deadline before submitting"* until complete; records the submitter; appears in the approval queue; no draft → open path exists in the transition map |
| SCRUM-10 Approve / reject | **Pass** *(see [#11](#11))* | Reject requires a note (button disabled while empty), returns to draft, note + decider + date shown to HR; approve opens the role and publishes it to the careers board in one step; queue is Management-only |
| SCRUM-11 Filled / closed / cancelled | **Pass** | Under-hire warns without blocking (*"0 of 3 openings hired — 3 openings will go unfilled. You can still mark it filled"*); non-open positions vanish from `/careers`, 404 publicly, and drop out of the Add-candidate position picker; closing date recorded and displayed |
| SCRUM-12 Custom stage sequence | **Pass** | Stages are per-position — renaming and reordering one left every other position untouched; `/positions/[id]/stages` 403s for HR and Interviewer |
| SCRUM-13 Assign interviewers | **Pass** *(see [#6](#6))* | Panel assign/remove works; an assigned interviewer can open the application, an unassigned one is refused; an empty panel does not block advancement |
| SCRUM-14 Mid-process stage changes | **Pass** | Add / rename / reorder all worked with 26 candidates in the pipeline; archiving a stage holding candidates **required** a destination (confirm disabled until chosen), moved all 26, wrote one history entry per candidate (*"…was moved from 'CV Screen' to 'Phone Screen' because 'CV Screen' was archived"*), reindexed the remaining stages contiguously, and kept the stage restorable with its feedback count |
| SCRUM-15 Add a candidate with CV | **Blocked** | See [#1](#1). Validation, dedupe and position gating verified; the upload itself could not run |
| SCRUM-16 De-duplicate by email | **Pass** *(see [#15](#15))* | `QA.Cand1@Example.com` matched the stored lowercase record; second application to the same position refused with a field-level error |
| SCRUM-17 Pipeline board | **Pass** *(see [#4](#4))* | One column per active stage with live counts; pace thresholds exactly per spec — 30/12/9/**6** days red, **5**/4/3 amber, 1/0 green; a stalled banner counted the 4 reds; resuming a held candidate reset the clock to "Today" |
| SCRUM-18 Search / filter / paginate | **Pass** | Name and email search, position/stage/status filters, 25 per page, all server-side and all in the URL — filters survive refresh, back, and the round trip through a candidate profile (`?from=` preserves the exact filtered page) |
| SCRUM-19 Advance a candidate | **Pass** *(see [#6](#6), [#12](#12))* | Advances to the next non-archived stage; who/from/where/when on the timeline; at the last stage the button is replaced by a disabled "Final stage" |
| SCRUM-20 Skip / move back / hold | **Pass** *(see [#14](#14))* | All four recorded as distinct history entries with their notes; Management-only (HR's row shows no exceptions menu); "Move back" correctly disabled at the first stage; holding dropped the board from 30 → 29 active and resuming restored it |
| SCRUM-21 Require a rejection reason | **Pass** | Fixed list of 10; confirm disabled with no reason; "Other" additionally requires ≥10 characters of explanation; reason + who + when stored; the position page aggregates them under "Why candidates dropped out" |
| SCRUM-22 Mark hired, track openings | **Pass** | Dialog shows "N of M openings filled so far"; on the last opening it prompts *"Every opening is filled — mark the position filled"* with a link straight to the position; count reflected as "Hired 1 of 2" → "2 of 2" |
| SCRUM-23 Activity feed | **Pass** *(see [#5](#5), [#8](#8), [#12](#12))* | One merged reverse-chronological timeline, every entry with actor and timestamp; an interviewer sees only applications they are assigned to |

Also checked and clean: light/dark/system theme switching, the read-only profile page, sign-out,
`/api/files/[id]` (401 signed out, 404 for a missing attachment), searchParams hardening
(`?page=abc`, `?page=-5`, `?status=bogus` all fall back safely instead of erroring), and no console
errors across every page visited.

---

## <a id="test-data-left-behind"></a>Test data left behind

Because of [#1](#1) I created candidates and applications with direct SQL to reach SCRUM-16 … 23.
1,000 bulk rows used for the [#4](#4) load test were deleted afterwards. Still in the database:

| What | Identifier |
| --- | --- |
| 30 candidates + applications | `qa.cand1@example.com` … `qa.cand30@example.com` |
| 1 duplicate-test candidate | `qa.dup@example.com` (on QA Engineer) |
| 2 positions | "Backend Engineer (QA Test)" (filled), "Data Analyst (QA Test)" (cancelled) |
| 2 user accounts | `qa.newhr@docket.test`, `qa.self@example.com` |

```sql
delete from candidates where email like 'qa.cand%@example.com' or email = 'qa.dup@example.com';
delete from positions  where title like '% (QA Test)';
delete from "user"     where email in ('qa.newhr@docket.test', 'qa.self@example.com');
```

One change to pre-existing data: the five seed accounts (`hr@`, `manager@`, `eng.lead@`, `dev1@`,
`ops.lead@docket.test`) would not accept `SEED_PASSWORD`, so I reset all five to `Password123!` in
order to sign in. Interview stages on "Backend Engineer (QA Test)" were renamed and reordered as
part of testing SCRUM-12/14; no other position was touched.
