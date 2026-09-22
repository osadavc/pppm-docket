# Docket — Parity Backlog (hiring-management → pppm-docket)

Prepared 16 September 2026. Planning document only — **no Jira issues have been created from it yet**, and no source code was changed.

**Goal.** Bring the delivery repository (`pppm-docket`, "D") to feature parity with the reference implementation (`hiring-management`, "H") while keeping Docket's own data model, roles, storage and feedback-gate rules. Everything below is written so it can be pasted into Jira as Epics and Stories in the same house style as Sprint 1 (`JIRA_ISSUES.md`): user story + acceptance criteria + points, with the "Design approach / Tasks" columns the team used in *Sprint 1 Documentation.docx* §2.2.

**Basis.**
- H was run locally (SQLite demo data, Resend disabled so emails were *simulated*) and walked through as all three roles; 31 annotated screenshots are in `../hiring-management-screens/`. A full read of H's schema, actions, queries and pages backs every reference below.
- D was read file-by-file (`apps/app/src/**`, migrations, e2e). "Docket today" statements are source-level facts as of `main @ 6dc87e4`.
- Jira project `SCRUM`: Sprint 1 = 4 epics / 19 stories / 56 points, all Done. Sprint 2 (4 Sep–15 Oct 2026, not started) already holds 28 flat tasks `SCRUM-25…52` from `Next Sprint Tasks.txt`. Section 6 maps every one of them to a story here so nothing is lost or duplicated.
- Prior QA findings `ISSUES.md` #1–#20 are referenced as **QA-n**.

**Conventions.** IDs `PAR-nn` are planning labels, not Jira keys. Points use the Sprint 1 scale (1/2/3/5/8). Priority uses Jira's Highest/High/Medium/Low. MoSCoW is included because the Sprint 1 document ranks the backlog that way. Sprint 1 velocity was 56 points for one developer over six weeks; Section 5 sizes sprints against it.

**Adaptation rules (apply to every story).**
1. Keep D's roles `interviewer` / `hr` / `management` and its permission split: HR advances, rejects, hires and adds candidates; management approves positions, configures stages, and owns skip / move-back / hold / resume and user administration. H's `hiring_manager` role is not copied.
2. Keep D's PostgreSQL schema (Supabase), Drizzle migrations, private Supabase Storage for CVs, and the `activity_log` written in the same transaction as the change. Do not port H's SQLite tables or disk uploads.
3. Keep D's configurable feedback gate (`positions.require_feedback_to_advance`, `position_stages.requires_scorecard` + `min_scorecards`, `evaluateStageGate`) and its 1–5 criterion-rating model. H's single 1–10 score and "every assigned interviewer must submit" rule are UI references only.
4. Keep D's stricter peer-feedback rule (peers visible only after the viewer submits for the **same stage**) and D's pace thresholds (green < 2 days, amber 2–5, red ≥ 6).
5. Every mutation stays a Server Action with Zod validation, server-side permission checks and an `ActionResult`; hiding a control is never access control.

---

## 0. Parity gap summary

| Area | Reference (H) | Docket today (D) | Stories |
| --- | --- | --- | --- |
| Interviewer entry point | `/queue` split *Awaiting your feedback* / *Submitted*; home shows "Waiting on your feedback — N" | No page lists an interviewer's assignments; sidebar "My agenda" 404s; application reachable only by direct URL | PAR-01, PAR-02, PAR-17 |
| Feedback capture | Score 1–10, 4-way recommendation, ≥20-char comments; author-only edit; immutable revisions with word-level diff dialog | `scorecards` / `scorecard_ratings` tables exist, gate logic exists, **nothing writes a scorecard**; gate can never clear without an override | PAR-03, PAR-04, PAR-05, PAR-06, PAR-21 |
| Candidate email | Acknowledgement, advancement, rejection (editable), custom compose; `email_log` sent/failed/simulated; Emails tab with HTML preview | `notifications` table, env vars and `resend` dependency present; nothing sends or records; timeline already knows how to render email rows | PAR-07, PAR-08, PAR-09 |
| Public intake | Careers board grouped by department, apply form with CV, honeypot, deadline/open checks, dedupe, confirmation page, ack email | Careers list/detail only; no apply; deadline never enforced | PAR-10, PAR-11, PAR-12 |
| Application workspace | One page: header with click-to-copy, stage stepper, Advance/Reject/More, tabs Feed / Feedback / Emails / Details | Split across `/candidates/[id]` (actions) and `/applications/[id]` (timeline only); no tabs; no stepper | PAR-13 |
| First-stage review | `/review`: CV iframe left, decision right, ←/→/A keyboard, quick reject with standard email | None; CV is download-only via 60-second signed URL | PAR-14 |
| Pipeline board | 8 cards per column + "View all N →", "Review N at {stage}", List view, Add candidate, resolved strip | All active applications rendered (1,000 cards = 1.8 MB, QA-4); no resolved strip | PAR-15, PAR-16 |
| Dashboards | Role-aware home: approvals, feedback due, open positions with active/stuck/hired, blocked-on-feedback badge, recent activity | Placeholder card for every role (QA-13) | PAR-17 |
| Analytics | KPI tiles, per-position funnels, drop-out reasons, time to fill, recent activity | "Reports" nav 404s; only a per-position rejection breakdown exists | PAR-18 |
| Approval audit | Approval history (requested / approved / sent back + note) on position page | Approval decision stored but never shown (QA-11); position-level activity never displayed | PAR-19 |
| Positions list | Status pills, search, 20/page | Unfiltered table; "Stages" count includes archived stages (QA-10) | PAR-20 |
| Users | Suspend / lift suspension; no public sign-up | No deactivate; `isActive` never written; deactivated user would loop (QA-2); `/sign-up` open (QA-9) | PAR-22, PAR-23 |
| Robustness | UUID guards, generic error page | Malformed UUID → HTTP 500 with SQL on screen (QA-3, QA-18) | PAR-24 |
| Demo data | Seed with 4 positions, 42 candidates, feedback, revisions, emails | Seed creates 5 users only | PAR-27 |
| Tests | — (none) | 5 Playwright auth tests | PAR-28 |

Things H has that we deliberately do **not** copy: SQLite, disk uploads, any-user-with-session CV access, H's `hiring_manager` role, single 1–10 score, "reveal peers after submitting anywhere" rule, 5-day pace cutoff, hard-coded "Acme" branding. Things D already has beyond H (keep): candidate profile page, stage kinds / SLA / scorecard settings, stage restore, criteria with weights, position on-hold status, hiring-manager field, rejection-reason CHECK constraint, server-paginated global candidate search, `application_stages` history rows.

---

## 1. Epics

| ID | Epic | Stories | Points |
| --- | --- | --- | --- |
| EP-1 | Interviewer workspace and navigation | PAR-01, PAR-02 | 8 |
| EP-2 | Interview feedback and scorecards | PAR-03, PAR-04, PAR-05, PAR-06 | 19 |
| EP-3 | Candidate communication | PAR-07, PAR-08, PAR-09 | 13 |
| EP-4 | Public application intake | PAR-10, PAR-11, PAR-12 | 13 |
| EP-5 | Application and pipeline workspace | PAR-13, PAR-14, PAR-15, PAR-16 | 24 |
| EP-6 | Dashboards, analytics and audit visibility | PAR-17, PAR-18, PAR-19 | 16 |
| EP-7 | Positions and stage configuration | PAR-20, PAR-21 | 6 |
| EP-8 | Accounts, access and hardening | PAR-22, PAR-23, PAR-24, PAR-25, PAR-26 | 12 |
| EP-9 | Demo data and verification | PAR-27, PAR-28 | 8 |
| | **Total** | **28 stories** | **119** |

---

## 2. Story overview

| ID | Epic | Story | Priority | MoSCoW | Pts | Proposed sprint | Absorbs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAR-01 | EP-1 | Interviewer queue of assigned candidates | High | Must | 5 | 2 | SCRUM-25, 26, 27 · QA-5 |
| PAR-02 | EP-1 | Role-aware navigation, quick-add menu, no dead links | High | Must | 3 | 2 | SCRUM-28 (nav part) · QA-7 |
| PAR-03 | EP-2 | Submit a scorecard for an assigned stage | Highest | Must | 8 | 2 | SCRUM-29, 30, 31, 32 · QA-6 |
| PAR-04 | EP-2 | Feedback tab with independent-reads-first visibility | High | Must | 3 | 2 | SCRUM-33 |
| PAR-05 | EP-2 | Edit own feedback with immutable revision history | Medium | Should | 5 | 3 | SCRUM-35, 36, 37 |
| PAR-06 | EP-2 | Show feedback, gate status and override reasons in history | High | Must | 3 | 2 | SCRUM-34 · QA-12 |
| PAR-07 | EP-3 | Notification service with record-before-dispatch log | High | Must | 5 | 2 | SCRUM-39, 40 · QA-8 |
| PAR-08 | EP-3 | Email candidates on advancement and rejection | High | Must | 5 | 2 | SCRUM-38 |
| PAR-09 | EP-3 | Compose a free-form email and view the Emails tab | Medium | Should | 3 | 2 | SCRUM-41 |
| PAR-10 | EP-4 | Apply to an open position from the careers board | Highest | Must | 8 | 3 | QA-17 |
| PAR-11 | EP-4 | Application confirmation page and acknowledgement email | High | Must | 2 | 3 | — |
| PAR-12 | EP-4 | Careers board grouping, filter, deadline and openings | Medium | Should | 3 | 3 | — |
| PAR-13 | EP-5 | Unified application page with stepper, tabs and actions | High | Must | 8 | 3 | QA-14 |
| PAR-14 | EP-5 | First-stage review workspace with inline CV preview | High | Should | 8 | 3 | — |
| PAR-15 | EP-5 | Bounded pipeline board, accurate counts, resolved strip | High | Must | 5 | 2 | SCRUM-45, 46, 47 · QA-4 |
| PAR-16 | EP-5 | Position-scoped candidate list with stage/status pills | Medium | Should | 3 | 3 | — |
| PAR-17 | EP-6 | Role-aware dashboard | High | Must | 5 | 3 | SCRUM-28 (dashboard part) · QA-13 |
| PAR-18 | EP-6 | Analytics: KPIs, stage funnels, drop-out reasons, time to fill | High | Should | 8 | 3 | — |
| PAR-19 | EP-6 | Position approval history and position activity feed | Medium | Should | 3 | 3 | QA-11 |
| PAR-20 | EP-7 | Positions list with status filter, search and pagination | Medium | Should | 3 | later | QA-10, QA-20 |
| PAR-21 | EP-7 | Manage scorecard criteria per stage | Medium | Should | 3 | later | — |
| PAR-22 | EP-8 | Deactivate and reactivate staff accounts | High | Must | 3 | 2 | SCRUM-42 · QA-2, QA-16 |
| PAR-23 | EP-8 | Manager-provisioned accounts only (close self sign-up) | High | Must | 2 | 2 | SCRUM-43, 44 · QA-9 |
| PAR-24 | EP-8 | Safe handling of malformed record URLs and errors | High | Must | 3 | 2 | SCRUM-48, 49 · QA-3, QA-18 |
| PAR-25 | EP-8 | Permission matrix clean-up | Low | Could | 2 | later | — |
| PAR-26 | EP-8 | Sprint 1 QA follow-ups bundle | Low | Could | 2 | later | QA-15, QA-19 |
| PAR-27 | EP-9 | Realistic demo seed dataset | Medium | Should | 3 | 2 | — |
| PAR-28 | EP-9 | End-to-end verification of the hiring workflow | High | Must | 5 | 2 | SCRUM-50, 51, 52 |

---

## 3. Epics and stories in full

Each story lists: user story · acceptance criteria · design approach (H reference → D target) · tasks · dependencies · verification. File paths are relative to `hiring-management/` (H) and `pppm-docket/apps/app/` (D).

### EP-1 — Interviewer workspace and navigation

An interviewer today holds zero permission keys, has a sidebar of dead links, and can only reach an application by being handed its URL. This epic gives the role a working front door.

#### PAR-01 — Interviewer queue of assigned candidates

**Priority** High · **MoSCoW** Must · **Points** 5 · **Absorbs** SCRUM-25, SCRUM-26, SCRUM-27 · QA-5

**User story**
As an interviewer, I want a queue of the active candidates sitting at stages I am assigned to, split into those still waiting on my feedback and those I have already assessed, so that I can find my work without anyone sending me a link.

**Acceptance criteria**
- `/queue` replaces the dead `/agenda` link and is visible to every role (an HR or management user who is on a panel sees their own queue too); interviewers see it as their second nav item.
- Rows show candidate name, position, stage, time-in-stage pace badge (D thresholds) and a status badge — **Feedback due** or **Submitted** — grouped under "Awaiting your feedback" and "Submitted — in your stage", oldest-in-stage first, across all positions.
- A row is included only when the application is `active` and its `current_stage_id` is a stage in `position_stage_interviewers` for the viewer; "Submitted" means the viewer has a `submitted` scorecard for that application-stage.
- Each row links to the application page (Feedback tab) and to the authorised CV download; both links enforce access on the server — a guessed application URL for a candidate at a stage the viewer is not assigned to (and has not submitted feedback on) returns 403.
- Lede reads "N candidates waiting on your feedback — they can't advance until it's in." / empty state "Nothing on your plate" with explanation.
- The list is bounded (page size 50 with a "Load more" or pagination) so a heavily assigned interviewer never fetches unbounded rows.

**Design approach**
H: `src/app/(app)/queue/page.tsx`, `getMyQueue` in `src/lib/queries/applications.ts` (join applications → stages → stage_interviewers → candidates, then own feedback per row).
D: new `src/lib/queries/queue.ts` (`getMyQueue(userId, page)` joining `applications` ⋈ `position_stages` ⋈ `position_stage_interviewers` ⋈ `candidates` ⋈ `positions`, left join `scorecards` on `(application_stage_id, author_id, status='submitted')`); new `src/app/(app)/queue/page.tsx`; reuse `components/pipeline/pace-badge.tsx`. Tighten `interviewerCanViewApplication` in `src/lib/queries/stage-interviewers.ts` from "any stage panel on the position" to "current stage panel OR author of a submitted scorecard on this application" (the unused `assignedStageIdsForInterviewer` helper is the starting point); apply the same rule in `src/app/api/files/[attachmentId]/route.ts`.

**Tasks**
1. Write `getMyQueue` with an integration test over seeded data.
2. Build the queue page (two sections, badges, pace, links, empty state).
3. Tighten interviewer application/CV access to current-stage-or-author and cover with tests (allowed / denied / after submission).
4. Replace the `/agenda` nav entry with `/queue`.

**Dependencies** none to ship the list; "Submitted" state and the feedback link become meaningful with PAR-03.
**Verification** TC: assigned interviewer sees exactly the candidates at their stages; unassigned interviewer gets 403 on the application and 403 on the CV; after PAR-03 a submitted row moves to the second section.

#### PAR-02 — Role-aware navigation, quick-add menu, no dead links

**Priority** High · **MoSCoW** Must · **Points** 3 · **Absorbs** SCRUM-28 (navigation half) · QA-7

**User story**
As a staff member, I want the navigation to show only pages that exist for my role, plus a quick "Add" menu for the things I create most, so that I never land on a 404 inside the product.

**Acceptance criteria**
- Every nav entry resolves to a 200 for each role it is shown to; `/interviews`, `/settings/templates` and `/admin/notifications` are removed from `nav-config.ts` until a story builds them; `/reports` appears only once PAR-18 ships (rename to "Analytics").
- Interviewer nav: Dashboard, Queue. HR: Dashboard, Positions, Candidates, Queue (only if on a panel), Analytics (after PAR-18). Management: HR set + Approvals, Users.
- HR sees an "Add" menu (New position / Add candidate) in the header; management sees it too only for items its permissions allow (today: none, because position and candidate creation are HR-only — keep that).
- The account menu shows name, email and role label and a Sign out item; active-route highlighting works for nested routes.
- A route-existence test walks `nav-config.ts` for each role and asserts no 404.

**Design approach**
H: `src/components/app/top-nav.tsx` (per-role links, Add dropdown, avatar menu).
D: `src/components/layout/nav-config.ts`, `app-sidebar.tsx`, `user-menu.tsx`. Keep the sidebar layout (D's shadcn sidebar), change the entries. Add permission keys `queue:view` (all roles) and reuse `report:view` for Analytics.

**Tasks** 1. Prune/rename nav entries. 2. Add "Add" quick-action menu. 3. Add the nav-walk test. 4. Update `permissions.ts` keys used by nav.
**Dependencies** PAR-01 (queue route). **Verification** TC: sign in as each role, click every nav item, all 200.

---

### EP-2 — Interview feedback and scorecards

D has the schema (`scorecards`, `scorecard_ratings`, `scorecard_criteria`), the gate (`evaluateStageGate`) and the timeline reader — but no writer. Assigning interviewers to a stage today makes the pipeline *stop* (QA-6). This epic completes the loop.

#### PAR-03 — Submit a scorecard for an assigned stage

**Priority** Highest · **MoSCoW** Must · **Points** 8 · **Absorbs** SCRUM-29, 30, 31, 32 · QA-6

**User story**
As an assigned interviewer, I want to submit my recommendation, written assessment and criterion ratings for a candidate at my stage, so that HR can advance the candidate once the stage's feedback requirement is met without using an override.

**Acceptance criteria**
- The Feedback tab of an application shows a "Your feedback — {stage}" form only when the viewer is on the current stage's panel, the application is `active`, and the viewer has no `submitted` scorecard for that application-stage.
- Form fields: recommendation (Strong yes / Yes / No / Strong no, required); strengths, concerns, notes (at least one narrative field with ≥ 20 characters — "Write at least a couple of sentences — this drives the decision."); one 1–5 rating per **active** criterion of the stage (all required when criteria exist; stages with no criteria accept recommendation + narrative only). `overall_score` = weight-averaged rating to two decimals, or null when there are no criteria.
- Submission is one transaction: `scorecards` row (`status = submitted`, `submitted_at`, `author_id`, `application_stage_id`) plus `scorecard_ratings` rows; `activity_log` entry `scorecard.submitted` scoped to the application.
- Server re-checks assignment, active status and that the stage is still the application's current stage; a second submission by the same author for the same application-stage is refused with "You already submitted feedback — edit it instead." (backed by the existing unique index).
- Gate: `getAdvanceContext` counts only `submitted` scorecards whose author is **currently** on the panel; `required = min(min_scorecards, assigned)`; outstanding names update after panel changes; position/stage switches and the no-panel bypass keep working. When the gate is satisfied, HR's Advance completes with no override reason.
- Toast "Feedback submitted."; the form disappears and hidden peer feedback (PAR-04) becomes visible.
- No draft scorecards in this story (the `draft` status value stays unused); decide separately whether drafts are ever needed.

**Design approach**
H: `src/lib/actions/feedback.ts` (`submitFeedback`), `src/app/(app)/candidates/[applicationId]/feedback-section.tsx` (form + entry card).
D: new `src/lib/actions/scorecards.ts` (`submitScorecard`) with a Zod schema in `src/lib/validation/scorecard.ts`; new `src/components/applications/scorecard-form.tsx`; extend `getAdvanceContext` in `src/lib/queries/applications.ts` to filter submitted scorecards by current panel membership; new query `getStageCriteria(applicationStageId)` reading `scorecard_criteria` where `is_active`. Rating model: `scorecard_ratings.rating` CHECK 1..5 already exists.

**Tasks** 1. Validation schema + action with permission/assignment checks. 2. Criteria query + form (recommendation toggle group, rating rows, narrative fields). 3. Gate count adjustment + unit tests for `evaluateStageGate` inputs after panel changes. 4. Activity entry + timeline rendering check. 5. Playwright: submit → gate clears → HR advances without override.
**Dependencies** PAR-01 for discoverability; PAR-13 for the tabbed page (until then the form renders on the existing `/applications/[id]` page).
**Verification** TC: 2 assigned interviewers, `min_scorecards = 1` → first submission clears the gate; `min_scorecards = 2` → second needed; unassigning a submitted author reduces `required`; duplicate submit refused.

#### PAR-04 — Feedback tab with independent-reads-first visibility

**Priority** High · **MoSCoW** Must · **Points** 3 · **Absorbs** SCRUM-33

**User story**
As an interviewer, I want colleagues' feedback for a stage hidden until I have submitted my own for that same stage, so that assessments stay independent, while HR and management always see everything.

**Acceptance criteria**
- Feedback tab lists submitted scorecards newest-first: big score (overall or "—"), recommendation label, author, stage, date, and the narrative; ratings expand per criterion.
- Interviewers see: their own scorecards always; peers' scorecards for a stage only once they hold a submitted scorecard for that same application-stage (D's rule, not H's any-stage rule). A notice "N colleague reviews are hidden until you submit your own — independent reads first." shows the hidden count.
- HR and management (`scorecard:read-all`) see all submitted scorecards; drafts are never listed for anyone.
- Tab label shows "Feedback (N)" where N = visible + hidden.
- Empty state "No feedback yet. It appears here as interviewers submit their scorecards."

**Design approach**
H: `getVisibleFeedback` in `src/lib/queries/applications.ts` (adapt the split, keep D's per-stage rule already encoded in `src/lib/queries/activity.ts:171-199`).
D: new `listScorecardsForApplication(applicationId, viewer)` in `src/lib/queries/scorecards.ts`; new `components/applications/feedback-list.tsx`.

**Tasks** 1. Query with visibility filter + hidden count. 2. List component + notice + empty state. 3. Tests for the three viewer types.
**Dependencies** PAR-03. **Verification** TC: interviewer A submits, sees B's; interviewer C (same stage, not submitted) sees notice with count 2; HR sees all.

#### PAR-05 — Edit own feedback with immutable revision history

**Priority** Medium · **MoSCoW** Should · **Points** 5 · **Absorbs** SCRUM-35, 36, 37

**User story**
As the author of a scorecard, I want to correct my assessment without erasing what the hiring team previously saw, so that mistakes can be fixed and the record stays honest.

**Acceptance criteria**
- Only the author can edit (server-enforced); editing is allowed while the application is not `hired`/`rejected` (decide in refinement whether to allow after resolution).
- Every changed save appends a full snapshot to a new `scorecard_revisions` table (`scorecard_id`, `revision_number`, `recommendation`, `overall_score`, `strengths`, `concerns`, `notes`, `ratings jsonb`, `created_at`); revision 1 is written at first submission; `scorecards.revision_count` increments; a no-op save writes nothing and returns "Nothing changed."
- Unique `(scorecard_id, revision_number)` plus an optimistic check (`expected_revision` in the request) so two concurrent edits cannot overwrite or reuse a number; the loser gets "This feedback was changed by another session — reload and try again."
- An edit never changes the gate count (still one submitted scorecard).
- Entries show "Edited ×N" which opens an **Edit history** dialog: revisions newest-first, score/recommendation deltas with strikethrough, and word-level diff of each narrative field (green insertions / red deletions).
- History follows the same visibility rule as the scorecard itself; `activity_log` entry `scorecard.updated`.

**Design approach**
H: `updateFeedback` in `src/lib/actions/feedback.ts`, `feedbackRevisions` table, `HistoryDialog` in `feedback-section.tsx` (uses the `diff` package's `diffWords`).
D: migration adding `scorecard_revisions` and `scorecards.revision_count`; `updateScorecard` action; `components/applications/feedback-history-dialog.tsx`; add `diff` dependency.

**Tasks** 1. Migration + revision write on submit. 2. Update action with optimistic concurrency. 3. History dialog with diffs. 4. Tests: no-op, concurrent, gate unchanged.
**Dependencies** PAR-03, PAR-04. First feature to defer if Sprint 2 runs short; until then submitted feedback is read-only.
**Verification** TC: edit twice → "Edited ×2", dialog shows three revisions with correct diffs; gate count unchanged.

#### PAR-06 — Show feedback, gate status and override reasons in application history

**Priority** High · **MoSCoW** Must · **Points** 3 · **Absorbs** SCRUM-34 · QA-12

**User story**
As HR or management, I want the application history to show submitted feedback, why an advance is blocked, and the reason recorded whenever the feedback requirement was overridden, so that every decision is explainable after the fact.

**Acceptance criteria**
- Timeline renders `scorecard.submitted` / `scorecard.updated` entries (the existing scorecard source in `getApplicationTimeline` starts producing rows once PAR-03 writes them) with author, stage and recommendation · score.
- Override entries render `metadata.overrideReason` as a quoted "Reason: …" line for HR/management (interviewers see the entry but not the reason).
- The application page shows a gate panel: `GATE_EXPLANATIONS` text plus outstanding interviewer names when blocked, "All required feedback is in." when satisfied.
- HR's Advance button: when blocked, the toast names the outstanding interviewers ("Waiting on feedback from A and B…") and the override path is explicitly labelled "Advance anyway — record a reason"; the schema enforces the same ≥ 10-character reason the UI already requires.
- Override, skip, hold and resume toasts read as outcomes ("Put on hold." → "{name} is on hold."), fixing QA-14.

**Design approach**
D only: `src/lib/queries/activity.ts` (surface `metadata.overrideReason` into `detail`/`meta`), `src/components/activity/activity-timeline.tsx` (render meta lines), `src/components/applications/advance-button.tsx`, `src/lib/validation/application.ts` (min length on `overrideReason`), `flow-override-menu.tsx` (toast copy).

**Tasks** 1. Timeline detail for override reason. 2. Gate panel component. 3. Advance button copy + schema. 4. Toast copy pass.
**Dependencies** PAR-03. **Verification** TC: advance with override → history shows the reason; blocked toast names people.

---

### EP-3 — Candidate communication

D already models `notifications` (queued/sent/failed, rendered body snapshot, provider id, error) and parses `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFICATIONS_ENABLED`, `DEMO_EMAIL_REDIRECT`; nothing consumes them. This epic builds the sender H has, on D's table.

#### PAR-07 — Notification service with record-before-dispatch log

**Priority** High · **MoSCoW** Must · **Points** 5 · **Absorbs** SCRUM-39, SCRUM-40 · QA-8

**User story**
As HR, I want every candidate message recorded before it is sent, with who sent it and whether delivery succeeded, so that communication is auditable and a mail failure never undoes a hiring decision.

**Acceptance criteria**
- `sendNotification({ type, to, subject, html, applicationId, candidateId, actorId })` inserts a `notifications` row first (`status = queued`), then dispatches, then updates to `sent` (+ `provider_message_id`, `sent_at`) or `failed` (+ `error`). It never throws to the caller; callers invoke it **after** their transaction commits.
- With `NOTIFICATIONS_ENABLED=false` or no `RESEND_API_KEY`, the row is stored with the rendered body and status `simulated` (new enum value) and the dev console logs `[email:simulated] to=… subject=…`. `DEMO_EMAIL_REDIRECT` rewrites the recipient and keeps the original address in `metadata`.
- Schema additions: `notifications.actor_id → user (set null)`, `metadata jsonb`, enum values `application_received`, `rejection`, `custom` in `notification_type`, `simulated` in `notification_status`. Sender is `"{COMPANY_NAME} Hiring <EMAIL_FROM>"` with the company name from a new `NEXT_PUBLIC_COMPANY_NAME` env (no hard-coded "Acme").
- Templates live in `src/lib/notifications/templates.ts` as pure functions: `applicationReceived`, `stageAdvanced`, `rejection` (plain text, editable), `composeHtml(text)` (escapes `& < >`, blank line → paragraph, newline → `<br/>`), wrapped in one branded HTML shell.
- A "Retry" action re-dispatches a `failed` row in place (same row, `attempts` + `last_attempt_at` columns) so retries are visible and never duplicate messages.
- Delivery failures are visible on the Emails tab and timeline; they never roll back a committed stage change.

**Design approach**
H: `src/lib/email/index.ts` (`sendEmail`), `src/lib/email/templates.ts`.
D: new `src/lib/notifications/send.ts` (Resend via dynamic import, uses `env.ts`), `templates.ts`; migration for enum values/columns; `retryNotification` in `src/lib/actions/notifications.ts` (HR).

**Tasks** 1. Migration. 2. Service + templates + unit tests (simulated / sent / failed with a stub transport). 3. Retry action. 4. README section on email modes.
**Dependencies** none. **Verification** TC: stubbed transport failure → row `failed` with error, stage change intact; retry → `sent`.

#### PAR-08 — Email candidates on advancement and rejection

**Priority** High · **MoSCoW** Must · **Points** 5 · **Absorbs** SCRUM-38

**User story**
As HR, I want to notify a candidate when they move forward or are turned down, reviewing the message before it goes, so that candidates always hear from us and what we sent is on record.

**Acceptance criteria**
- Advance dialog gains "Email the candidate about this step" (default on) with a read-only preview of the `stageAdvanced` subject/body; sent only after a successful commit; a blocked or failed advance sends nothing.
- Reject dialog gains: internal note (never sent — existing `decision_reason`), "Email the candidate" (default on) revealing editable Subject and Message prefilled from the `rejection` template; button reads "Reject & send email" / "Reject candidate". With the checkbox on, an empty subject or body is a validation error (H silently skips — do not copy).
- Skip, move back, hold, resume and hire send nothing. Public acknowledgement is PAR-11.
- Each send is logged with `actor_id` = the HR user, `type` = `stage_advanced` / `rejection`, linked to the application.

**Design approach**
H: `advanceApplication` (`notify`), `rejectApplication` (`sendEmail`, `emailSubject`, `emailBody`) in `src/lib/actions/applications.ts`; `application-actions.tsx` reject dialog.
D: extend `advanceApplicationSchema` / `rejectApplicationSchema` (`src/lib/validation/application.ts`), call `sendNotification` after the transaction in `src/lib/actions/applications.ts`; update `components/applications/advance-button.tsx`, `reject-dialog.tsx`.

**Tasks** 1. Schemas + actions. 2. Dialog UI (preview, editable rejection text). 3. Tests: blocked advance sends nothing; rejection with edited text stored verbatim.
**Dependencies** PAR-07. **Verification** TC: advance → notification `stage_advanced` simulated; reject with checkbox off → no row.

#### PAR-09 — Compose a free-form email and view the Emails tab

**Priority** Medium · **MoSCoW** Should · **Points** 3 · **Absorbs** SCRUM-41

**User story**
As HR, I want to write an ad-hoc email to a candidate from their application and see every message we have sent them, so that all communication lives in one place.

**Acceptance criteria**
- Emails tab (HR and management only) with "Compose email" → dialog "Email {name}" / "Goes to {email} and is recorded in this log.", Subject (3–200) and Message (10–5000, prefilled "Hi {First},"); Send → `custom` notification.
- The tab lists notifications for the application newest-first: subject, status mark (**sent** / **failed** / **simulated**), recipient, timestamp, sender name (blank for system-sent acknowledgements), error text, "Retry" on failed rows, and an expandable sandboxed `<iframe srcDoc>` preview of the stored HTML. Tab label "Emails (N)".
- The timeline shows email entries with actor and delivery status; interviewers see neither the tab nor the entries (existing rule in `getApplicationTimeline`).
- Empty state "No emails yet. Applying, advancing and rejecting all send and log candidate emails here."

**Design approach**
H: `sendCustomCandidateEmail` (`src/lib/actions/emails.ts`), `compose-email.tsx`, Emails tab in `candidates/[applicationId]/page.tsx`.
D: `sendCustomCandidateEmail` in `src/lib/actions/notifications.ts`; `listNotificationsForApplication` query; `components/applications/compose-email-dialog.tsx`, `emails-tab.tsx`.

**Tasks** 1. Action + query. 2. Dialog + list + preview. 3. Timeline actor/status rendering. **Dependencies** PAR-07; PAR-13 for the tab container (ship on the existing application page until then). **Verification** TC: compose → row simulated, visible in tab and feed; interviewer cannot see it.

---

### EP-4 — Public application intake

D's careers board is read-only signage (QA-17). H's public flow is adapted here onto D's private storage, dedupe, `application_stages` rows and the `applications_position_must_be_open` trigger.

#### PAR-10 — Apply to an open position from the careers board

**Priority** Highest · **MoSCoW** Must · **Points** 8 · **Absorbs** QA-17

**User story**
As a job seeker, I want to apply to an open position from the public careers page with my CV, so that my application enters the same pipeline as a referral without HR keying it in.

**Acceptance criteria**
- `/careers/[positionId]` shows an "Apply" section when the position is `open` and its deadline is null or in the future; after the deadline it shows "The application window for this role has closed." (page stays 200; non-open positions stay 404).
- Form: full name, email, phone (optional), salary expectation (optional, ≤ 60 chars), CV (required; PDF/DOC/DOCX ≤ 5 MB, same `validateCvFile`), an off-screen honeypot field; copy "Takes about two minutes. We read every application and reply either way."
- Server action (unauthenticated) in order: honeypot tripped → silently redirect to the confirmation page storing nothing; position must be `open` and within deadline; CV validation; email lower-cased; existing candidate reused (name/phone updated) — a second application to the same position is refused with "You've already applied to this position — we have your application on file." **before** any upload; CV uploaded to the private bucket under `candidates/{id}/…` via the server-only service client; then one transaction: candidate (if new), application at the first active stage with `source = careers_site`, all `application_stages` rows, `attachments` (kind `cv`), `activity_log` `application.applied` with `actor_id` null and summary "…applied via the careers page and entered the pipeline at “{stage}”"; upload removed if the transaction fails.
- Schema: `candidates.created_by_id` and `applications.created_by_id` become nullable (null = public applicant) — or a dedicated system user is introduced; decide in refinement. New `applications.salary_expectation text` shown only to HR/management (Details tab, PAR-13).
- Abuse limits: honeypot, size limit, and a per-IP rate limit on the action (simple in-memory or DB-backed window) documented in README.
- On success redirect to `/careers/[positionId]/applied` (PAR-11).

**Design approach**
H: `submitPublicApplication` in `src/lib/actions/public.ts`, `src/app/(public)/careers/[positionId]/apply-form.tsx`.
D: new `src/lib/actions/public-applications.ts` reusing `validateCvFile`, `buildCvPath`, `uploadCv`, `removeCv` from `src/lib/storage/attachments.ts` and the transaction shape of `addCandidate` in `src/lib/actions/candidates.ts`; new `components/careers/apply-form.tsx`; migration for nullable creators + `salary_expectation`; `isPubliclyVisible`/`acceptsApplications` in `src/lib/domain/position-status.ts` gain a deadline check for the public path.

**Tasks** 1. Migration. 2. Public action with all checks + cleanup. 3. Apply form + honeypot. 4. Rate limiting. 5. Tests: happy path, duplicate, expired deadline, non-open, bad file, honeypot.
**Dependencies** none (PAR-11 for confirmation + email).
**Verification** TC: valid apply → candidate at first stage with CV retrievable by HR only; anonymous CV request 401; duplicate refused; deadline passed → no form.

#### PAR-11 — Application confirmation page and acknowledgement email

**Priority** High · **MoSCoW** Must · **Points** 2

**User story**
As a job seeker, I want an on-screen confirmation and an acknowledgement email after applying, so that I know my application was received.

**Acceptance criteria**
- `/careers/[positionId]/applied` renders "Thanks — you're in the running for {title}." with a back link; 404 if the position does not exist.
- After the application commits, an `application_received` notification is sent (or simulated) to the applicant with `recipient_candidate_id` set and `actor_id` null; it appears on the Emails tab and in the feed for staff.
- A send failure is recorded as `failed` and does not affect the application.

**Design approach** H: `applied/page.tsx`, `applicationReceivedTemplate`. D: page under `src/app/careers/[positionId]/applied/`, call `sendNotification` from PAR-10's action after commit.
**Tasks** 1. Page. 2. Send after commit + test. **Dependencies** PAR-07, PAR-10. **Verification** TC: apply → notification row `application_received` simulated; stub failure → `failed`, application still present.

#### PAR-12 — Careers board grouping, filter, deadline and openings

**Priority** Medium · **MoSCoW** Should · **Points** 3

**User story**
As a job seeker, I want the careers board to show open roles by department with their openings and closing date, so that I can find the right vacancy quickly.

**Acceptance criteria**
- Board lists `open` positions whose deadline is null or in the future, grouped under department headings, with department pills "All (N)" / "{Dept} (N)" via `?department=` (pills only when more than one department).
- Each row shows "{N} openings · apply by {d MMM yyyy}" or "open until filled"; detail page repeats it; description keeps D's markdown rendering.
- Public layout header uses `NEXT_PUBLIC_COMPANY_NAME`, links "Staff sign in"; footer copy configurable.
- Manual HR intake after the deadline is still allowed but the candidate form shows a warning (decision recorded).
- Empty state "Nothing open right now — check back soon."

**Design approach** H: `src/app/(public)/careers/page.tsx`, `(public)/layout.tsx`. D: `src/app/careers/page.tsx`, `careers/layout.tsx`, `listPublicPositions` in `src/lib/queries/positions.ts` (add deadline predicate, department grouping).
**Tasks** 1. Query + grouping. 2. Pills + copy. 3. Deadline predicate + candidate-form warning. **Dependencies** none. **Verification** TC: expired position hidden from list; department pill filters.

---

### EP-5 — Application and pipeline workspace

H's single application page and its review screen are the reference. D keeps its candidate-profile page (a person can have several applications) and adds the application-centred workspace on `/applications/[id]`.

#### PAR-13 — Unified application page with stepper, tabs and actions

**Priority** High · **MoSCoW** Must · **Points** 8 · **Absorbs** QA-14

**User story**
As a staff member, I want one application page that shows where the candidate is, lets me act according to my role, and organises history, feedback, emails and details into tabs, so that I never have to hop between pages to make a decision.

**Acceptance criteria**
- `/applications/[applicationId]` header: candidate name, click-to-copy email and phone, "applied {date}", position link (for `position:view`), status badge + pace badge while active, rejected banner "Rejected — {reason label} · {note}".
- Stage stepper: "{n} {stage}" for every live stage — past, current (highlighted) and future — plus archived stages the candidate visited shown muted.
- Action bar by role: HR → Advance (or **Hire** when at the final stage) and Reject; management → "More" menu with Skip stage / Move back a stage / Put on hold / Resume / Hire now (keeps D's permission split; Hire now stays HR-permission-gated unless refinement moves it); interviewer → no actions. All existing dialogs (`AdvanceButton`, `HireDialog`, `RejectDialog`, `FlowOverrideMenu`) move here; the candidate profile keeps a compact per-application row linking to this page.
- Tabs via `?tab=`: **Feed** (existing timeline), **Feedback** (PAR-04), **Emails** (PAR-09, staff only), **Details** (email, phone, location, current title/company, source label, applied, salary expectation or "Restricted" for interviewers, resolved date; CV row with inline-open link and download button). Default tab: interviewers → Feedback, staff → Feed.
- Success toasts are past-tense outcomes (QA-14); pipeline cards, candidate list rows, queue rows and review screen all link here.
- Interviewer access uses the tightened rule from PAR-01.

**Design approach**
H: `src/app/(app)/candidates/[applicationId]/page.tsx`, `application-actions.tsx`, `src/components/app/click-to-copy.tsx`.
D: rebuild `src/app/(app)/applications/[applicationId]/page.tsx` with tab components; `getApplicationHeader` extended (phone, location, salary, CV attachment); move action components from `candidates/[candidateId]/page.tsx`; new `components/app/click-to-copy.tsx`, `stage-stepper.tsx`.

**Tasks** 1. Header + stepper + query extension. 2. Tab shell + Feed/Details. 3. Move actions; role gating; Hire-at-final-stage swap. 4. Update inbound links. 5. Playwright smoke per role.
**Dependencies** PAR-04, PAR-09 for the Feedback/Emails tabs (can land with placeholders). **Verification** TC: each role sees the correct actions/tabs; final-stage HR sees Hire instead of Advance.

#### PAR-14 — First-stage review workspace with inline CV preview

**Priority** High · **MoSCoW** Should · **Points** 8

**User story**
As HR, I want to work through everyone at the first stage with the CV on screen and a decision panel beside it, so that screening a large applicant pool takes minutes, not an afternoon.

**Acceptance criteria**
- `/positions/[positionId]/review` (HR and management): queue = `active` applications at the first live stage, oldest applied first; header "{i} of {n} in queue · {reviewed} reviewed this session"; ← / → navigate, `A` advances (ignored while typing in inputs).
- Left pane: CV rendered inline for PDFs via a new inline-capable file route (`/api/files/[attachmentId]?inline=1` → signed URL without the `download` option; response `Content-Disposition: inline`); DOC/DOCX show a download link; "No CV attached" when absent. The route keeps D's authorisation and 60-second TTL.
- Right pane: name, email, phone, applied date, salary expectation (HR/management), "Full record →"; "Advance to {next stage}" (goes through the normal gate — first stages usually have no panel); "Reject with reason" select + "Send the standard rejection email" checkbox (default on, PAR-08 template unedited) + Reject.
- After an action the card leaves the local queue, the counter increments and the server data refreshes; empty state "Queue clear — every application at {stage} has been reviewed."
- Pipeline page shows "Review {N} at {first stage}" when N > 0.

**Design approach** H: `src/app/(app)/positions/[positionId]/review/review-screen.tsx`, `getReviewQueue`, `/api/files/[uploadId]` inline serving. D: new page + client component; `getReviewQueue(positionId)` in `src/lib/queries/pipeline.ts`; extend `src/app/api/files/[attachmentId]/route.ts` and `createCvSignedUrl` in `src/lib/storage/attachments.ts` with an inline mode.
**Tasks** 1. Inline file mode + test (401/403 unchanged). 2. Queue query. 3. Review screen with keyboard handling. 4. Pipeline CTA. **Dependencies** PAR-08 (standard rejection email), PAR-13 (Full record link). **Verification** TC: advance via `A` moves candidate and advances the queue; reject with reason logs rejection + email.

#### PAR-15 — Bounded pipeline board, accurate counts, resolved strip

**Priority** High · **MoSCoW** Must · **Points** 5 · **Absorbs** SCRUM-45, 46, 47 · QA-4

**User story**
As HR, I want the pipeline board to stay fast with 1,000+ applicants while its counts stay exact, so that the primary view of a position never becomes the slowest page.

**Acceptance criteria**
- `getPipelineBoard` fetches at most 8 cards per live stage in SQL (`row_number() over (partition by current_stage_id order by entered_at)`), while per-stage totals, the active total and the stalled count come from grouped `count(*)` queries independent of the loaded cards.
- Counts exclude archived stages and `on_hold` applications; the stalled rule uses D's `redFrom = 6`.
- Columns show "View all {total} →" when more cards exist, linking to the position candidate list filtered by stage (PAR-16); empty column copy "Nobody here right now."
- Header actions: "Review N at {first stage}" (PAR-14), "List view", "Add candidate" (HR); below the board a **Resolved** strip: Hired / On hold / Rejected counts linking to the filtered list.
- Verified against a position with 1,000+ applications: response size and card count bounded, counts exact, timings recorded in the story (the QA-4 numbers are historical, not a benchmark).

**Design approach** H: `getPipelineBoard` (`BOARD_CARDS_PER_STAGE = 8`), `pipeline/page.tsx`. D: rewrite `src/lib/queries/pipeline.ts`, update `src/components/pipeline/pipeline-board.tsx` and `positions/[positionId]/pipeline/page.tsx`.
**Tasks** 1. Windowed card query + count queries. 2. Board UI (View all, resolved strip, CTAs). 3. Load script for 1,000 apps + recorded timings. **Dependencies** none. **Verification** TC: 1,000 apps → ≤ 8 cards/column, totals match SQL, page under target time.

#### PAR-16 — Position-scoped candidate list with stage/status pills

**Priority** Medium · **MoSCoW** Should · **Points** 3

**User story**
As HR, I want a per-position candidate list I can flip to from the board, filtered by stage or outcome, so that "View all" and the resolved counts land somewhere useful.

**Acceptance criteria**
- `/positions/[positionId]/candidates`: pills All / each live stage / On hold / Hired / Rejected (`?stage=` clears `?status=` and vice-versa), search name/email, 25 per page server-side, "Page x of y · N total"; unknown stage/status values are ignored.
- Columns: Candidate (link to application page), Email, Stage, In stage (pace or "—"), Applied, Source, Status; "Board view" toggle; filters live in the URL and survive navigation (D already does this for the global list).
- The global `/candidates` list stays as is.

**Design approach** H: `positions/[positionId]/candidates/page.tsx`, `listApplicationsForPosition`. D: reuse `searchCandidates` + `parseCandidateSearch` (`src/lib/validation/candidate-search.ts`) with `positionId` fixed; new page + pill component.
**Tasks** 1. Page + pills. 2. Board/list toggles. **Dependencies** PAR-15 links. **Verification** TC: stage pill and "View all" agree with board counts.

---

### EP-6 — Dashboards, analytics and audit visibility

#### PAR-17 — Role-aware dashboard

**Priority** High · **MoSCoW** Must · **Points** 5 · **Absorbs** SCRUM-28 (dashboard half) · QA-13

**User story**
As a staff member, I want the landing page to show what needs my decision today, so that I start from the work rather than from a menu.

**Acceptance criteria**
- Management: "Waiting on your approval" (pending positions with requester → approvals page); HR and management: "Open positions" rows with "{active} active · {stuck} stuck 6+ days · {hired}/{openings} hired" and a "{N} candidates blocked on feedback" badge; "Recent activity" (last 8 application events from `activity_log`).
- Any role on a panel: "Waiting on your feedback — N" (first 6 rows, link "All N in your queue →").
- Interviewers see only the feedback section; empty state "Nothing needs you right now. New tasks land here the moment they exist."
- All numbers come from grouped SQL (no loading rows to count); "blocked on feedback" counts active applications whose current stage gate is `feedback_outstanding` — computed with one query over stages requiring scorecards, panel size and submitted counts.

**Design approach** H: `src/lib/queries/home.ts`, `src/app/(app)/home/page.tsx`. D: replace `src/app/(app)/dashboard/page.tsx`; new `src/lib/queries/dashboard.ts` (`getPositionsOverview`, `getPendingApprovals` — `countPendingApprovals` already exists unused — `getBlockedOnFeedbackCount`, `getRecentActivity`).
**Tasks** 1. Queries + tests. 2. Page sections per role. 3. Nav badge for approvals count (optional). **Dependencies** PAR-01 (queue link), PAR-03 (blocked count meaningful). **Verification** TC: each role's dashboard matches seeded data.

#### PAR-18 — Analytics: KPIs, stage funnels, drop-out reasons, time to fill

**Priority** High · **MoSCoW** Should · **Points** 8

**User story**
As management, I want a single analytics page showing how the hiring machine is performing, so that I can see where candidates stall or drop out and how long roles take to fill.

**Acceptance criteria**
- `/reports` (nav label "Analytics", permission `report:view` = HR + management): KPI tiles — open positions, active candidates, hired, average time to hire (`decision_at − applied_at` over hired, in days, "—" when none).
- One funnel per `open`/`filled` position: bars for each live stage = number of applications that ever entered that stage (`application_stages.entered_at is not null`), plus a trailing "Hired" bar.
- "Why candidates drop out": horizontal bars per `rejection_reason` label across all positions; "Time to fill": filled positions with `closed_at − opened_at` days; "Recent activity": last 12 application events with actor.
- Charts use Recharts (as H) or lightweight CSS bars — decide in refinement; colours from the theme tokens; layout works at phone width.
- Queries are grouped SQL in PostgreSQL (`extract(epoch from …)/86400`), no N+1; the page renders under 500 ms on the seeded dataset.

**Design approach** H: `src/lib/queries/analytics.ts`, `src/app/(app)/analytics/page.tsx`, `charts.tsx`. D: new `src/lib/queries/analytics.ts`, `src/app/(app)/reports/page.tsx`; reuse `getRejectionBreakdown` shape from `src/lib/queries/applications.ts`.
**Tasks** 1. Metric queries + unit tests on seeded data. 2. Page + charts. 3. Nav entry + permission. **Dependencies** PAR-27 for meaningful demo numbers. **Verification** TC: numbers reconcile with SQL on the seed.

#### PAR-19 — Position approval history and position activity feed

**Priority** Medium · **MoSCoW** Should · **Points** 3 · **Absorbs** QA-11

**User story**
As HR, I want to see who requested, approved or sent back a position and what they said, along with the position's own history, so that the approval audit trail is readable without SQL.

**Acceptance criteria**
- Position detail shows "Approval history": "Requested by {name} · {datetime}", then "Approved by {name} · {datetime}" or "Sent back by {name} · {datetime}" with the note quoted — for **both** decisions (today only the rejection note renders); "Not submitted yet." when empty.
- A "Position activity" feed lists `activity_log` rows with `position_id` (created, updated, submitted, approved/rejected, stage added/renamed/reordered/archived/restored, panel changed, filled/closed/cancelled) for HR/management.
- Approvals page shows the same requester/date info per row.

**Design approach** H: position detail "Approval history" (`position_approvals`). D: `positions.submitted_by_id/at`, `reviewed_by_id/at`, `review_note`, `last_review_decision` already stored; new `getPositionActivity(positionId)` in `src/lib/queries/activity.ts`; update `src/app/(app)/positions/[positionId]/page.tsx`.
**Tasks** 1. Approval history card. 2. Position feed query + list. **Dependencies** none. **Verification** TC: approve with note → note visible; feed lists stage changes.

---

### EP-7 — Positions and stage configuration

#### PAR-20 — Positions list with status filter, search and pagination

**Priority** Medium · **MoSCoW** Should · **Points** 3 · **Absorbs** QA-10, QA-20

**User story**
As HR, I want to filter, search and page through positions, so that the list stays usable as the number of roles grows.

**Acceptance criteria**
- Pills All / Draft / Pending / Open / On hold / Filled / Cancelled / Closed (`?status=`), search on title or department (`?q=`, ≤ 80 chars, ILIKE), 20 per page with "Page x of y · N total".
- "Stages" column counts **live** stages only (fix `listPositions` and `listPendingApprovals`); "On hold" shows 0, not "—" (QA-20).
- Empty states: "No positions match — try clearing the search or status filter." / "Open your first position…".

**Design approach** H: `positions/page.tsx`, `listPositions` (20/page). D: `src/lib/queries/positions.ts` (`listPositions` gains filters/paging and `is_archived = false` in the stage count), `src/app/(app)/positions/page.tsx`.
**Tasks** 1. Query. 2. Pills/search/pagination UI. 3. Count fix + test. **Dependencies** none. **Verification** TC: archive a stage → list count matches detail.

#### PAR-21 — Manage scorecard criteria per stage

**Priority** Medium · **MoSCoW** Should · **Points** 3

**User story**
As management, I want to define the criteria a stage is scored on, so that stages added after position creation get a scorecard that means something.

**Acceptance criteria**
- Stage editor: add / rename / reorder / deactivate criteria (label 2–80, description, weight 1–5) per stage; stages created via "Add stage" can receive criteria immediately.
- Deactivating keeps historic ratings (restrict delete via the existing FK); the scorecard form (PAR-03) shows only active criteria at submission time.
- Default template criteria continue to seed at position creation; activity `position.stage_criteria_changed`.

**Design approach** D only: `src/lib/actions/stages.ts` (new criteria actions), `src/components/positions/stage-editor.tsx` + `stage-form-fields.tsx`, `scorecard_criteria` table already exists.
**Tasks** 1. Actions + validation. 2. Editor UI. **Dependencies** PAR-03. **Verification** TC: new stage + 2 criteria → scorecard form shows 2 rating rows.

---

### EP-8 — Accounts, access and hardening

#### PAR-22 — Deactivate and reactivate staff accounts

**Priority** High · **MoSCoW** Must · **Points** 3 · **Absorbs** SCRUM-42 · QA-2, QA-16

**User story**
As management, I want to deactivate a departing colleague's account (and reactivate it if needed) with their sessions revoked immediately, so that access ends the day they leave.

**Acceptance criteria**
- Users table gains Status (Active / Deactivated) and Created columns; row menu gains "Deactivate account" / "Reactivate" (management; disabled for self; refuses to deactivate the last active manager).
- Deactivation sets `user.is_active = false` and deletes all `session` rows in one transaction; reactivation sets it true. Activity `user.deactivated` / `user.reactivated`.
- Sign-in as a deactivated account fails with "That account has been deactivated. Contact your administrator." and mints no session (Better Auth hook or post-sign-in check that signs out); the sign-in page never redirects a deactivated user away, so the QA-2 loop is impossible.
- `getCurrentUser` treats inactive users as signed out for pages, Server Actions **and** `/api/files/[attachmentId]`; existing e2e auth tests keep passing.
- Deactivated users are excluded from assignable interviewers (already) and shown greyed-out on existing panels.

**Design approach** H: `users-table.tsx` (Suspend / Lift suspension via better-auth admin ban). D: `src/lib/actions/users.ts` (`setUserActive`), `src/components/admin/user-table.tsx`, `user-row-actions.tsx`, `src/lib/auth/guards.ts`, `src/app/(auth)/sign-in/page.tsx`, `src/app/api/files/[attachmentId]/route.ts`.
**Tasks** 1. Action + last-manager guard. 2. Table + menu. 3. Guard/sign-in fixes. 4. Tests: deactivated sign-in, live session revoked, CV route 401. **Dependencies** none. **Verification** TC: deactivate while signed in elsewhere → next request lands on sign-in with the message; reactivate → sign-in works.

#### PAR-23 — Manager-provisioned accounts only (close self sign-up)

**Priority** High · **MoSCoW** Must · **Points** 2 · **Absorbs** SCRUM-43, SCRUM-44 · QA-9

**User story**
As management, I want staff accounts to exist only when a manager creates them, so that nobody can mint an account by visiting a URL.

**Acceptance criteria**
- `/sign-up` is removed from the UI and the proxy's public paths; Better Auth `emailAndPassword.disableSignUp = true` so the API refuses `POST /api/auth/sign-up/email`.
- Sign-in page copy: "Accounts are created by your hiring manager — there is no public sign-up."
- The e2e suite replaces the two sign-up tests with account creation through `createStaffAccount` (management) followed by sign-in, keeping login / logout / session-persistence / invalid-credential coverage; fixtures create users through the action instead of the public API.
- Seed and `createStaffAccount` keep working.

**Design approach** H: `src/lib/auth.ts` (`disableSignUp: true`), sign-in footer copy. D: `src/lib/auth.ts`, `src/proxy.ts`, delete `src/app/(auth)/sign-up/`, `components/auth/sign-up-form.tsx`, update `e2e/auth.spec.ts` + `e2e/fixtures.ts`.
**Tasks** 1. Config + route removal. 2. Test rewrite. 3. README. **Dependencies** none — but **confirm the policy in refinement**: the current tests deliberately allow self sign-up. **Verification** TC: `POST /api/auth/sign-up/email` → 4xx; `/sign-up` → 404.

#### PAR-24 — Safe handling of malformed record URLs and errors

**Priority** High · **MoSCoW** Must · **Points** 3 · **Absorbs** SCRUM-48, SCRUM-49 · QA-3, QA-18

**User story**
As any visitor, I want a wrong or malformed link to produce a proper "not found" page rather than a server error, so that the product never leaks internals or looks broken.

**Acceptance criteria**
- Every `[id]` page and route handler validates the parameter with `z.uuid()` before querying: positions (detail, edit, pipeline, stages, review, candidates), candidates, applications, public careers, files. Malformed → 404; well-formed but missing → 404; forbidden → 403; signed-out on protected routes → existing sign-in redirect.
- The app error boundary shows generic copy ("Something went wrong … Reference: {digest}") and a Try-again button; it never renders `error.message`.
- Route tests cover malformed, missing and forbidden for each family, including public careers URLs and authenticated file requests.

**Design approach** H: `not-found.tsx`, `(app)/error.tsx`. D: shared `parseUuidParam()` helper in `src/lib/validation/params.ts` used by every page under `src/app/(app)/**/[…]/page.tsx`, `src/app/careers/[positionId]/page.tsx`, `src/app/api/files/[attachmentId]/route.ts`; update `src/app/(app)/error.tsx`.
**Tasks** 1. Helper + apply everywhere. 2. Error boundary copy. 3. Tests. **Dependencies** none. **Verification** TC: `/positions/abc` → 404; `/careers/abc` → 404 signed out; `/api/files/abc` → 404 signed in.

#### PAR-25 — Permission matrix clean-up

**Priority** Low · **MoSCoW** Could · **Points** 2

**User story**
As a developer, I want the permission matrix to contain only keys the code checks, and every guard to go through it, so that the role model is trustworthy.

**Acceptance criteria**
- Remove never-checked keys (`template:view`, `interview:manage`, `comparison:view`, `attachment:upload`, `report:export`) or wire them; `user:manage` replaces `requireRole("management")` in admin layout/actions; `position:manage` replaces `requireRole("hr")` in `createDraftPosition` / `updatePosition`; `canEditStagesDestructively` is removed or guarded.
- README documents the matrix per role; a unit test asserts every key in `permissions.ts` is referenced at least once outside `nav-config.ts`.

**Design approach** D only: `src/lib/auth/permissions.ts`, `src/lib/actions/users.ts`, `src/lib/actions/positions.ts`, `src/app/(app)/admin/layout.tsx`.
**Tasks** 1. Key pruning + guard swaps. 2. Test + README. **Dependencies** PAR-02 (nav keys). **Verification** unit test passes; role behaviour unchanged in e2e.

#### PAR-26 — Sprint 1 QA follow-ups bundle

**Priority** Low · **MoSCoW** Could · **Points** 2 · **Absorbs** QA-15, QA-19

**User story**
As HR, I want the small rough edges found in Sprint 1 QA fixed, so that the product feels finished.

**Acceptance criteria**
- Existing-candidate notice on the add-candidate form shows each prior application's **status** (hired / rejected / on hold / active) next to the stage (QA-15).
- Mobile: the floating avatar no longer overlaps table rows; wide tables show a horizontal-scroll affordance (QA-19).
- `.env.example` and the storage error message point at the file the app actually reads (repo-root `.env`) (QA-1 note).
- Positions list "On hold" renders 0 rather than "—" if not already fixed by PAR-20.

**Design approach** D only: `components/candidates/existing-candidate-notice.tsx`, `components/layout/user-menu.tsx`, `.env.example`, `src/lib/storage/supabase.ts`.
**Tasks** one per bullet. **Dependencies** none. **Verification** manual TC per bullet.

---

### EP-9 — Demo data and verification

#### PAR-27 — Realistic demo seed dataset

**Priority** Medium · **MoSCoW** Should · **Points** 3

**User story**
As the team, we want `db:seed` to produce a realistic hiring scenario, so that sprint reviews, screenshots and automated tests run against the same believable data instead of hand-built rows.

**Acceptance criteria**
- Idempotent seed (`--reset` supported) creates: the 5 staff accounts; four positions — one `open` with ~40 applications spread across stages with varied time-in-stage (green/amber/red), one `pending_approval`, one `draft`, one `filled` with a measurable time-to-fill; panels on interview stages; submitted scorecards including one with revisions and one stage deliberately gate-blocked; ~8 rejections across reasons with notes; a handful of `simulated` notifications; sources mixed `careers_site` / `referral` / `manual`.
- CVs are generated one-page PDFs uploaded to the private bucket when storage is configured; otherwise the seed logs a warning and skips attachments.
- All people and emails are synthetic (`@example.com`); demo sign-ins documented in README.

**Design approach** H: `scripts/seed.ts`. D: extend `src/db/seed.ts` using the real actions where practical (so activity rows are consistent), otherwise direct inserts inside transactions.
**Tasks** 1. Position/stage/panel seed. 2. Applications with staggered `entered_at`. 3. Scorecards + revisions + notifications. 4. PDF generation + upload. **Dependencies** PAR-03, PAR-05, PAR-07 for the feedback/email rows (seed can insert directly before those ship). **Verification** dashboard, board, analytics and queue all show non-trivial data after `db:seed`.

#### PAR-28 — End-to-end verification of the hiring workflow

**Priority** High · **MoSCoW** Must · **Points** 5 · **Absorbs** SCRUM-50, SCRUM-51, SCRUM-52

**User story**
As the team, we want automated coverage of the critical hiring paths, so that "Done" in Jira means the acceptance criteria actually pass.

**Acceptance criteria**
- Playwright suites on the existing Docker PostgreSQL setup (`compose.test.yml`, port 55432, app on 3107): (1) intake — manual add and public apply → candidate at first stage, CV retrievable by HR, anonymous CV 401; (2) interviewer queue → scorecard submit → gate clears → HR advances without override → history shows feedback and movement; (3) role visibility — unassigned interviewer denied application and CV, peer feedback hidden until submitted, salary "Restricted"; (4) revisions — edit twice, history has three versions, gate count unchanged; (5) notifications — advance/reject simulated rows, stub transport failure recorded as `failed` with the stage change intact, retry succeeds; (6) hardening — deactivated user, malformed IDs, bounded board with 1,000 applications and recorded timings.
- Unit tests for `evaluateStageGate`, `paceLevel`, `canTransition`, template rendering and the UUID param helper.
- A single `bun run test:e2e` runs everything; results linked from each story before it is moved to Done.

**Design approach** D: extend `e2e/` (new spec files, seeded fixtures through actions), add a unit-test runner (Bun test or Vitest) under `src/**/__tests__`.
**Tasks** one per suite + unit tests + CI script. **Dependencies** PAR-01…PAR-08, PAR-15, PAR-22…PAR-24. **Verification** all suites green on a clean database.

---

## 4. Definition of Done (carried from Sprint 1 practice)

- Acceptance criteria demonstrated through the UI as the role named in the story, with synthetic data.
- Server-side permission and validation checks present; hiding a control is not access control.
- State changes and their `activity_log` entry written in one transaction; the timeline shows the entry.
- Automated test (unit or Playwright) for the primary path and the main refusal path; `tsc --noEmit`, `eslint` and `next build` clean.
- Migration committed (`drizzle/`), README/`.env.example` updated where configuration changed.
- Story moved to Done only after review evidence is attached (screenshot or test run link).

---

## 5. Suggested sprint allocation (velocity 56)

Sprint 2's goal in Jira already reads "complete interviewer feedback and candidate communication"; the allocation below keeps that goal and adds the hardening that Sprint 1 QA flagged.

| Sprint | Stories | Points |
| --- | --- | --- |
| **Sprint 2** (4 Sep–15 Oct 2026) — *interviewers submit feedback, HR advances on evidence, candidates hear from us* | PAR-01, PAR-02, PAR-03, PAR-04, PAR-06, PAR-07, PAR-08, PAR-09, PAR-15, PAR-22, PAR-23, PAR-24, PAR-27, PAR-28 | 56 |
| **Sprint 3** (proposed 16 Oct–27 Nov 2026) — *candidates apply themselves, staff work from one application page, management sees the whole machine* | PAR-05, PAR-10, PAR-11, PAR-12, PAR-13, PAR-14, PAR-16, PAR-17, PAR-18, PAR-19 | 53 |
| **Later / stretch** | PAR-20, PAR-21, PAR-25, PAR-26 | 10 |

Descope order if Sprint 2 runs short: PAR-09 (compose email) → PAR-27 (seed) → PAR-02's "Add" menu. Do not descope PAR-03/PAR-07/PAR-22–24; they are the sprint goal and the security fixes.

Sprint review evidence for Sprint 2 (unchanged from `Next Sprint Focus.txt`): HR adds a candidate to a position with a panel → the assigned interviewer finds them in the queue and an unrelated interviewer cannot → missing feedback blocks advancement → the interviewer submits → the gate clears and HR advances without override → the advancement email is recorded as simulated and shown in the timeline → deactivated user, malformed URL and a 1,000-application board are demonstrated.

---

## 6. Mapping to existing Jira work (SCRUM-25…52) and QA findings

Recommended handling when the stories above are created in Jira: create the nine Epics and 28 Stories, then either **convert each SCRUM-25…52 task into a sub-task of the story that absorbs it** (keeps the 11 Sep history) or close them as duplicates with a link. Nothing in SCRUM-25…52 is dropped.

| Existing task | Absorbed by | Note |
| --- | --- | --- |
| SCRUM-25 Build a queue of active candidates at assigned stages | PAR-01 | |
| SCRUM-26 Show candidate, position, stage, time in stage, feedback status | PAR-01 | |
| SCRUM-27 Link queue entry to application, CV and feedback form | PAR-01 | |
| SCRUM-28 Queue link/outstanding count on dashboard; hide dead nav | PAR-02 (nav) + PAR-17 (dashboard) | split |
| SCRUM-29 Feedback form with recommendation, narrative, 1–5 ratings | PAR-03 | |
| SCRUM-30 Save scorecards/ratings atomically | PAR-03 | |
| SCRUM-31 Enforce assignment permissions, prevent duplicates | PAR-03 | |
| SCRUM-32 Count eligible submissions against the configurable gate | PAR-03 | |
| SCRUM-33 Keep peer feedback hidden until same-stage submission | PAR-04 | |
| SCRUM-34 Show feedback and override reasons in history | PAR-06 | |
| SCRUM-35 Authors edit their own feedback | PAR-05 | |
| SCRUM-36 Preserve revisions with values, author, time | PAR-05 | |
| SCRUM-37 Revision viewer; edits don't inflate gate | PAR-05 | |
| SCRUM-38 Email preview/composition and templates | PAR-08 (+ templates in PAR-07) | |
| SCRUM-39 Record intended messages before dispatch | PAR-07 | |
| SCRUM-40 Sent/failed/demo outcomes and retry | PAR-07 | |
| SCRUM-41 Communication in the timeline with role visibility | PAR-09 | |
| SCRUM-42 Inactive-user loops; block actions/CV downloads | PAR-22 | |
| SCRUM-43 Confirm registration policy; align UI/API | PAR-23 | |
| SCRUM-44 Update auth fixtures/tests | PAR-23 | |
| SCRUM-45 Limit board cards at the database level | PAR-15 | |
| SCRUM-46 Stage/stalled totals independent of loaded cards | PAR-15 | |
| SCRUM-47 Verify counts and bounded loading at 1,000+ | PAR-15 | |
| SCRUM-48 Validate UUIDs before queries | PAR-24 | |
| SCRUM-49 Missing/forbidden responses and safe errors | PAR-24 | |
| SCRUM-50 Test intake → queue → feedback → advance → history | PAR-28 | |
| SCRUM-51 Test visibility, unauthorised requests, revisions, failures | PAR-28 | |
| SCRUM-52 Recheck CV, inactive users, malformed URLs | PAR-28 | |

| QA finding (`ISSUES.md`) | Story |
| --- | --- |
| QA-1 CV upload / placeholder key (superseded by the rehearsed setup) | PAR-26 (message/paths only) |
| QA-2 Deactivated redirect loop | PAR-22 |
| QA-3 Malformed UUID → 500 | PAR-24 |
| QA-4 Board loads every candidate | PAR-15 |
| QA-5 Interviewers have no navigation | PAR-01, PAR-02 |
| QA-6 No scorecard capture | PAR-03 |
| QA-7 Five sidebar links 404 | PAR-02 |
| QA-8 Email advertised, not implemented | PAR-07 |
| QA-9 Public self-sign-up | PAR-23 |
| QA-10 Stage count includes archived | PAR-20 |
| QA-11 Approval decision never shown | PAR-19 |
| QA-12 Override reason never displayed | PAR-06 |
| QA-13 Empty dashboard | PAR-17 |
| QA-14 Override toasts read as commands | PAR-06, PAR-13 |
| QA-15 Duplicate notice lacks status | PAR-26 |
| QA-16 No way to deactivate a user | PAR-22 |
| QA-17 Careers board has no apply | PAR-10 |
| QA-18 Error boundary prints `error.message` | PAR-24 |
| QA-19 Mobile avatar overlap | PAR-26 |
| QA-20 "—" instead of 0 | PAR-20 |

---

## 7. Decisions to confirm in refinement

1. **Interviewer access scope** (PAR-01): tighten from position-wide panel membership to "current stage panel or scorecard author". H is stage-scoped; D is currently looser. Recommended: tighten.
2. **Public applicants and `created_by_id`** (PAR-10): make the column nullable (null = candidate/public) vs. a system user row. Recommended: nullable, with `actor_id` null in `activity_log` meaning "candidate".
3. **Scorecard drafts** (PAR-03): the `draft` status exists in the enum; H has no drafts. Recommended: no drafts now; keep the value.
4. **Editing feedback after resolution** (PAR-05): allow edits on hired/rejected applications? Recommended: no.
5. **Sign-up policy** (PAR-23): Sprint 1's AC says accounts are manager-created; the current tests deliberately allow self sign-up. Recommended: close sign-up (matches H and the story).
6. **Charts library** (PAR-18): Recharts (adds ~100 kB) vs. CSS bars. Recommended: Recharts, matching H and the team's familiarity.
7. **Hire-now for management** (PAR-13): H lets the admin tier hire from any stage; D keeps hire under HR's `application:manage`. Recommended: keep D's split; management uses skip/hold.
8. **Notification retry semantics** (PAR-07): in-place retry (recommended) vs. new row per attempt.
9. **Company branding**: `NEXT_PUBLIC_COMPANY_NAME` env for public pages and email sender rather than "Acme".

---

## 8. Reference material

- Reference app screenshots (31): `docket-materials/hiring-management-screens/01-…31-*.jpg` — public board & apply form, HR home, positions list, position detail, pipeline board, review screen, candidate list, application tabs, compose/reject dialogs, interviewer home/queue/feedback/edit/history, gate toast, approvals, users & suspend menu, new-user dialog, analytics, stages editor, quick-add menu, forms, sign-in.
- To run H locally: `bun install && RESEND_API_KEY= PORT=3001 bun run dev` (its `.env.local` pins `BETTER_AUTH_URL` to port 3001); demo sign-ins in H's README. The seeded open position's deadline had lapsed; it was moved to 31 Dec 2026 in H's SQLite so the public flow could be exercised — nothing else in H was changed.
- D facts cited above come from `apps/app/src/**` at `main @ 6dc87e4`; H facts from its working tree (single scaffold commit `8156f96`).
- Prior planning: `../Next Sprint Focus.txt`, `../Next Sprint Tasks.txt` (11 Sep 2026), `JIRA_ISSUES.md`, `ISSUES.md`, `../Sprint 1 Documentation.docx`.

---

## 9. Jira keys (created 16 September 2026)

Site: <https://osadavidath.atlassian.net>, project `SCRUM`. Points in "Story point estimate"; labels `parity`, `ep-n` / `par-nn`, and `sprint-2` (in Sprint 2, id 3) / `sprint-3` / `backlog` (both in the backlog). Former Sprint 2 tasks SCRUM-25…52 are superseded and slated for deletion; each new story's description names the ones it replaces.

| Epic | Key | | Story | Key | Sprint |
| --- | --- | --- | --- | --- | --- |
| EP-1 Interviewer workspace and navigation | SCRUM-53 | | PAR-01 | SCRUM-62 | 2 |
| | | | PAR-02 | SCRUM-63 | 2 |
| EP-2 Interview feedback and scorecards | SCRUM-54 | | PAR-03 | SCRUM-64 | 2 |
| | | | PAR-04 | SCRUM-65 | 2 |
| | | | PAR-05 | SCRUM-66 | 3 |
| | | | PAR-06 | SCRUM-67 | 2 |
| EP-3 Candidate communication | SCRUM-55 | | PAR-07 | SCRUM-68 | 2 |
| | | | PAR-08 | SCRUM-69 | 2 |
| | | | PAR-09 | SCRUM-70 | 2 |
| EP-4 Public application intake | SCRUM-56 | | PAR-10 | SCRUM-71 | 3 |
| | | | PAR-11 | SCRUM-72 | 3 |
| | | | PAR-12 | SCRUM-73 | 3 |
| EP-5 Application and pipeline workspace | SCRUM-57 | | PAR-13 | SCRUM-74 | 3 |
| | | | PAR-14 | SCRUM-75 | 3 |
| | | | PAR-15 | SCRUM-76 | 2 |
| | | | PAR-16 | SCRUM-77 | 3 |
| EP-6 Dashboards, analytics and audit visibility | SCRUM-58 | | PAR-17 | SCRUM-78 | 3 |
| | | | PAR-18 | SCRUM-79 | 3 |
| | | | PAR-19 | SCRUM-80 | 3 |
| EP-7 Positions and stage configuration | SCRUM-59 | | PAR-20 | SCRUM-81 | later |
| | | | PAR-21 | SCRUM-82 | later |
| EP-8 Accounts, access and hardening | SCRUM-60 | | PAR-22 | SCRUM-83 | 2 |
| | | | PAR-23 | SCRUM-84 | 2 |
| | | | PAR-24 | SCRUM-85 | 2 |
| | | | PAR-25 | SCRUM-86 | later |
| | | | PAR-26 | SCRUM-87 | later |
| EP-9 Demo data and verification | SCRUM-61 | | PAR-27 | SCRUM-88 | 2 |
| | | | PAR-28 | SCRUM-89 | 2 |
