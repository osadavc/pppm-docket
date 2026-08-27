# Docket — Jira Issues

Exported from Jira project **Docket** (`SCRUM`) at <https://osadavidath.atlassian.net>.

- **Epics:** 4
- **Stories:** 19 (19 done, 0 not done)
- **Story points:** 56

---

## Overview

| Key | Type | Epic | Summary | Status | Points |
| --- | --- | --- | --- | --- | --- |
| [SCRUM-1](https://osadavidath.atlassian.net/browse/SCRUM-1) | Epic | — | Accounts and access control | To Do | — |
| [SCRUM-2](https://osadavidath.atlassian.net/browse/SCRUM-2) | Epic | — | Positions and approval | To Do | — |
| [SCRUM-3](https://osadavidath.atlassian.net/browse/SCRUM-3) | Epic | — | Interview stage configuration | To Do | — |
| [SCRUM-4](https://osadavidath.atlassian.net/browse/SCRUM-4) | Epic | — | Candidates and pipeline | To Do | — |
| [SCRUM-5](https://osadavidath.atlassian.net/browse/SCRUM-5) | Story | SCRUM-1 | Create staff accounts with roles | Done | 3 |
| [SCRUM-6](https://osadavidath.atlassian.net/browse/SCRUM-6) | Story | SCRUM-1 | Sign in securely with email and password | Done | 2 |
| [SCRUM-7](https://osadavidath.atlassian.net/browse/SCRUM-7) | Story | SCRUM-1 | Change a user's role and reset passwords | Done | 2 |
| [SCRUM-8](https://osadavidath.atlassian.net/browse/SCRUM-8) | Story | SCRUM-2 | Create a draft position | Done | 3 |
| [SCRUM-9](https://osadavidath.atlassian.net/browse/SCRUM-9) | Story | SCRUM-2 | Submit a position for approval | Done | 2 |
| [SCRUM-10](https://osadavidath.atlassian.net/browse/SCRUM-10) | Story | SCRUM-2 | Approve or reject a submitted position | Done | 3 |
| [SCRUM-11](https://osadavidath.atlassian.net/browse/SCRUM-11) | Story | SCRUM-2 | Mark a position filled, closed, or cancelled | Done | 2 |
| [SCRUM-12](https://osadavidath.atlassian.net/browse/SCRUM-12) | Story | SCRUM-3 | Define a custom interview stage sequence per position | Done | 5 |
| [SCRUM-13](https://osadavidath.atlassian.net/browse/SCRUM-13) | Story | SCRUM-3 | Assign interviewers to each stage | Done | 3 |
| [SCRUM-14](https://osadavidath.atlassian.net/browse/SCRUM-14) | Story | SCRUM-3 | Add, rename, reorder, and archive stages mid-process | Done | 5 |
| [SCRUM-15](https://osadavidath.atlassian.net/browse/SCRUM-15) | Story | SCRUM-4 | Add a candidate manually with their CV | Done | 3 |
| [SCRUM-16](https://osadavidath.atlassian.net/browse/SCRUM-16) | Story | SCRUM-4 | De-duplicate candidates by email address | Done | 2 |
| [SCRUM-17](https://osadavidath.atlassian.net/browse/SCRUM-17) | Story | SCRUM-4 | Pipeline board with time-in-stage indicators | Done | 5 |
| [SCRUM-18](https://osadavidath.atlassian.net/browse/SCRUM-18) | Story | SCRUM-4 | Search, filter, and paginate candidate lists | Done | 3 |
| [SCRUM-19](https://osadavidath.atlassian.net/browse/SCRUM-19) | Story | SCRUM-4 | Advance a candidate to the next stage | Done | 3 |
| [SCRUM-20](https://osadavidath.atlassian.net/browse/SCRUM-20) | Story | SCRUM-4 | Skip, move back, or hold a candidate | Done | 3 |
| [SCRUM-21](https://osadavidath.atlassian.net/browse/SCRUM-21) | Story | SCRUM-4 | Require a reason on every rejection | Done | 2 |
| [SCRUM-22](https://osadavidath.atlassian.net/browse/SCRUM-22) | Story | SCRUM-4 | Mark a candidate hired and track against openings | Done | 2 |
| [SCRUM-23](https://osadavidath.atlassian.net/browse/SCRUM-23) | Story | SCRUM-4 | Chronological activity feed on each application | Done | 3 |

---

## SCRUM-1 — Accounts and access control

**Type:** Epic  |  **Status:** To Do  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-1](https://osadavidath.atlassian.net/browse/SCRUM-1)

Staff accounts, secure sign-in, and the three role tiers (interviewer, HR executive, hiring manager) that gate every other feature in Docket.

_3 stories · 7 points_

### SCRUM-5 — Create staff accounts with roles

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-5](https://osadavidath.atlassian.net/browse/SCRUM-5)

**User story**
As a hiring manager, I want to create staff accounts with a role (interviewer, HR executive, hiring manager) so that only authorised people can use the system, each with appropriate permissions.

**Acceptance criteria**

* A hiring manager can create an account with name, email, password and one of the three roles.
* The new user can sign in immediately and sees only what their role permits.
* Non-admin roles cannot reach user management at all, enforced server-side.

### SCRUM-6 — Sign in securely with email and password

**Type:** Story  |  **Status:** Done  |  **Points:** 2  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-6](https://osadavidath.atlassian.net/browse/SCRUM-6)

**User story**
As a staff member, I want to sign in securely with my email and password so that candidate data is protected.

**Acceptance criteria**

* Valid credentials start a session; invalid ones are rejected without revealing which field was wrong.
* Passwords are stored hashed, never in plain text.
* Unauthenticated visitors are redirected away from every internal page.

### SCRUM-7 — Change a user's role and reset passwords

**Type:** Story  |  **Status:** Done  |  **Points:** 2  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-7](https://osadavidath.atlassian.net/browse/SCRUM-7)

**User story**
As a hiring manager, I want to change a user's role or reset their password so that access stays correct as the team changes.

**Acceptance criteria**

* A hiring manager can change any user's role, and the change takes effect on their next request.
* A hiring manager can set a new password for a user.
* A hiring manager cannot demote themselves out of the admin tier and lock everyone out.

---

## SCRUM-2 — Positions and approval

**Type:** Epic  |  **Status:** To Do  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-2](https://osadavidath.atlassian.net/browse/SCRUM-2)

Creating positions as drafts, the HR to hiring manager approval gate before a role opens, and the full position lifecycle through to filled, closed, or cancelled.

_4 stories · 10 points_

### SCRUM-8 — Create a draft position

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-8](https://osadavidath.atlassian.net/browse/SCRUM-8)

**User story**
As an HR executive, I want to create a draft position (title, department, description, application deadline, number of openings) so that a new vacancy can be prepared before it is advertised.

**Acceptance criteria**

* A position can be saved as a draft and edited freely before submission.
* Drafts are never visible on the public careers board.
* Creating a position seeds a default set of interview stages that can then be customised.

### SCRUM-9 — Submit a position for approval

**Type:** Story  |  **Status:** Done  |  **Points:** 2  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-9](https://osadavidath.atlassian.net/browse/SCRUM-9)

**User story**
As an HR executive, I want to submit a draft position for approval so that no role is advertised without management sign-off.

**Acceptance criteria**

* Submitting moves the position from draft to pending approval and records who submitted it.
* A pending position appears in the hiring manager's approval queue.
* A position cannot skip straight from draft to open.

### SCRUM-10 — Approve or reject a submitted position

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-10](https://osadavidath.atlassian.net/browse/SCRUM-10)

**User story**
As a hiring manager, I want to approve or reject a submitted position with a note so that only vetted roles open, and HR knows what to fix.

**Acceptance criteria**

* Approving opens the position and publishes it to the careers board.
* Rejecting returns it to draft with the manager's note visible to HR.
* The decision, decider, and timestamp are recorded as an audit trail.
* Only the hiring manager role can decide.

### SCRUM-11 — Mark a position filled, closed, or cancelled

**Type:** Story  |  **Status:** Done  |  **Points:** 2  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-11](https://osadavidath.atlassian.net/browse/SCRUM-11)

**User story**
As an HR executive, I want to mark a position as filled, closed, or cancelled so that its full lifecycle is tracked and reflected on the careers board.

**Acceptance criteria**

* Marking a position filled warns (but does not block) if fewer candidates were hired than there are openings.
* Positions that are not open disappear from the public board and reject new applications.
* The closing date is recorded so time-to-fill can be reported.

---

## SCRUM-3 — Interview stage configuration

**Type:** Epic  |  **Status:** To Do  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-3](https://osadavidath.atlassian.net/browse/SCRUM-3)

Per-position interview stage sequences, interviewer assignments per stage, and safe mid-process changes (add, rename, reorder, archive).

_3 stories · 13 points_

### SCRUM-12 — Define a custom interview stage sequence per position

**Type:** Story  |  **Status:** Done  |  **Points:** 5  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-12](https://osadavidath.atlassian.net/browse/SCRUM-12)

**User story**
As a hiring manager, I want to define a custom sequence of interview stages for each position so that every role gets an appropriate process rather than a one-size-fits-all pipeline.

**Acceptance criteria**

* Each position owns its own ordered list of stages, independent of every other position.
* Stages can be created, named, and ordered before candidates arrive.
* Only the hiring manager role can configure stages.

### SCRUM-13 — Assign interviewers to each stage

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-13](https://osadavidath.atlassian.net/browse/SCRUM-13)

**User story**
As a hiring manager, I want to assign interviewers to each stage so that responsibility for assessing candidates is explicit.

**Acceptance criteria**

* One or more interviewers can be assigned to (and removed from) any stage.
* Assignments drive both the interviewer's visibility of candidates and the feedback gate.
* A stage with no assigned interviewers does not block candidate advancement.

### SCRUM-14 — Add, rename, reorder, and archive stages mid-process

**Type:** Story  |  **Status:** Done  |  **Points:** 5  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-14](https://osadavidath.atlassian.net/browse/SCRUM-14)

**User story**
As a hiring manager, I want to add, rename, reorder, or archive stages even while candidates are mid-process so that the process can adapt, with candidates on an archived stage moved safely to another stage.

**Acceptance criteria**

* Stages can be changed at any time, including while candidates occupy them.
* Archiving a stage that holds active candidates requires choosing a destination stage.
* Each forced move is written to the candidate's history so the audit trail stays intact.
* Historic feedback attached to an archived stage is preserved, not deleted.

---

## SCRUM-4 — Candidates and pipeline

**Type:** Epic  |  **Status:** To Do  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-4](https://osadavidath.atlassian.net/browse/SCRUM-4)

Candidate entry and de-duplication, the pipeline board, search and filtering at scale, and every stage movement through to hired or rejected with a full audit trail.

_9 stories · 26 points_

### SCRUM-15 — Add a candidate manually with their CV

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-15](https://osadavidath.atlassian.net/browse/SCRUM-15)

**User story**
As an HR executive, I want to add a candidate manually with their CV so that applicants from any source (referrals, walk-ins, email) enter the same pipeline.

**Acceptance criteria**

* HR can enter a candidate's details and upload a CV (PDF or Word, size limited).
* The candidate lands at the position's first stage with an "applied" history entry.
* The CV is downloadable only by signed-in staff, never by an anonymous link.

### SCRUM-16 — De-duplicate candidates by email address

**Type:** Story  |  **Status:** Done  |  **Points:** 2  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-16](https://osadavidath.atlassian.net/browse/SCRUM-16)

**User story**
As an HR executive, I want candidates de-duplicated by email address so that I can see when someone has applied before and to which positions.

**Acceptance criteria**

* A person is stored once; applying to a second position reuses the same candidate record.
* Applying twice to the same position is refused rather than duplicated.
* A candidate's other applications are visible from their profile.

### SCRUM-17 — Pipeline board with time-in-stage indicators

**Type:** Story  |  **Status:** Done  |  **Points:** 5  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-17](https://osadavidath.atlassian.net/browse/SCRUM-17)

**User story**
As an HR executive, I want a pipeline board showing candidates per stage with colour-coded time-in-stage indicators so that stalled candidates are visible at a glance.

**Acceptance criteria**

* The board shows one column per active stage with a live count of candidates.
* Each candidate carries a pace indicator: green under 2 days in stage, amber 2 to 5, red over 5.
* Time in stage resets whenever the candidate moves.

### SCRUM-18 — Search, filter, and paginate candidate lists

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-18](https://osadavidath.atlassian.net/browse/SCRUM-18)

**User story**
As an HR executive, I want to search, filter, and paginate candidate lists so that applicant pools of 1,000+ stay manageable.

**Acceptance criteria**

* Candidates can be searched by name or email and filtered by stage and status.
* Results are paginated server-side; the page stays fast with 1,000+ applicants on a position.
* Filters survive navigation so HR does not lose their place.

### SCRUM-19 — Advance a candidate to the next stage

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-19](https://osadavidath.atlassian.net/browse/SCRUM-19)

**User story**
As an HR executive, I want to advance a candidate to the next stage so that their progress is recorded with a full audit trail of who moved them and when.

**Acceptance criteria**

* Advancing moves the candidate to the next non-archived stage in order.
* Who moved them, from where, to where, and when is recorded permanently.
* Advancing past the final stage is refused, directing HR to hire or reject instead.

### SCRUM-20 — Skip, move back, or hold a candidate

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-20](https://osadavidath.atlassian.net/browse/SCRUM-20)

**User story**
As a hiring manager, I want to skip a stage, move a candidate back, or put them on hold so that exceptional cases are handled without breaking the audit trail.

**Acceptance criteria**

* Skip, move back, hold, and resume are each recorded as their own history entry with an optional note.
* These overrides are restricted to the hiring manager role.
* A candidate on hold is excluded from active pipeline counts until resumed.

### SCRUM-21 — Require a reason on every rejection

**Type:** Story  |  **Status:** Done  |  **Points:** 2  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-21](https://osadavidath.atlassian.net/browse/SCRUM-21)

**User story**
As an HR executive, I want every rejection to require a reason so that drop-out analytics are meaningful and decisions are accountable.

**Acceptance criteria**

* Rejecting a candidate is impossible without selecting a reason from a fixed list.
* The reason, the person who rejected, and the timestamp are stored on the application.
* Reasons are structured data so they can be aggregated for reporting later.

### SCRUM-22 — Mark a candidate hired and track against openings

**Type:** Story  |  **Status:** Done  |  **Points:** 2  |  **Priority:** Highest  |  **Labels:** sprint-1  |  **Link:** [SCRUM-22](https://osadavidath.atlassian.net/browse/SCRUM-22)

**User story**
As an HR executive, I want to mark a candidate as hired and be warned when all openings are filled so that hires are tracked against approved headcount.

**Acceptance criteria**

* Hiring sets the application to hired and records the decision in history.
* The position shows hired count against its number of openings.
* When hires reach the opening count, HR is prompted to mark the position filled.

### SCRUM-23 — Chronological activity feed on each application

**Type:** Story  |  **Status:** Done  |  **Points:** 3  |  **Priority:** Medium  |  **Labels:** sprint-1  |  **Link:** [SCRUM-23](https://osadavidath.atlassian.net/browse/SCRUM-23)

**User story**
As a staff member, I want each application to show a chronological feed of stage changes, feedback, and emails so that anyone can understand a candidate's history at a glance.

**Acceptance criteria**

* One merged timeline shows stage transitions, feedback entries, and sent emails in order.
* Each entry shows who did it and when.
* The feed respects role visibility: interviewers never see entries they are not entitled to.

---
