# Docket | PPPM Assignment

## Email modes

Every candidate message is **recorded before it is dispatched**. The advance and
reject dialogs write the rendered subject/body, the HR user who approved it,
the recipient and a stable idempotency key into `notifications` *inside the
same transaction* as the stage decision. Dispatch only starts after that
transaction commits, so a blocked or failed decision sends nothing, and a mail
failure can never undo a decision that already happened. Outcomes are shown on
the application page (History timeline and the Emails panel), where HR can
retry a failed send.

Configuration lives in `apps/app/.env.local`:

| Variable | Purpose |
| --- | --- |
| `NOTIFICATIONS_ENABLED` | `true` to hand messages to Resend; anything else simulates. |
| `RESEND_API_KEY` | Required for real delivery. Missing key ⇒ simulated. |
| `EMAIL_FROM` | Bare sender address. The header reads `"{NEXT_PUBLIC_COMPANY_NAME} Hiring <EMAIL_FROM>"`. |
| `NEXT_PUBLIC_COMPANY_NAME` | Company name used in the sender, templates and HTML shell (default `Docket`). |
| `DEMO_EMAIL_REDIRECT` | Optional inbox that receives *every* message; the original recipient is kept in `metadata.originalRecipient`. |

### Simulated (default)

`NOTIFICATIONS_ENABLED=false` **or** no `RESEND_API_KEY`. The row is stored with
the rendered body and `status = simulated`; no provider is contacted. The dev
console logs one line per message:

```
[email:simulated] to=candidate@example.com subject=Your application for Backend Engineer
```

Use this for local development, demos and CI.

### Sent (Resend)

`NOTIFICATIONS_ENABLED=true` and a valid `RESEND_API_KEY`. The row is claimed
(`dispatching`), Resend is called with `idempotencyKey = notification/<row id>`,
and the row ends as `sent` (with the provider message id) or `failed` (with the
provider error). Set `DEMO_EMAIL_REDIRECT` to test real delivery against one
safe inbox without emailing candidates.

### Failed, unknown and retry

- **Failed** — the provider answered and refused. HR can **Retry** from the
  Emails panel; the same row and idempotency key are reused, and
  `attempt_count` / `last_attempt_at` are updated.
- **Outcome unknown** — the provider call threw or timed out (15 s). The row
  stays claimed and marked `metadata.outcome = "unknown"` so nobody sends a
  fresh copy. **Retry & reconcile** re-sends with the same idempotency key,
  which Resend dedupes, so the earlier attempt is resolved rather than
  duplicated.
- Only one dispatcher can claim a row at a time; a crashed claim becomes
  reclaimable after 15 minutes.

### Templates

`apps/app/src/lib/notifications/templates.ts` holds `applicationReceived`,
`stageAdvanced` and `rejection` as pure plain-text functions (HR edits the
text in the dialog before sending). `composeHtml(text)` escapes `& < >`, turns
blank lines into paragraphs and newlines into `<br/>`, and wraps the result in
one branded HTML shell for the provider's HTML alternative.

### Ad-hoc email

HR can **Compose email** from the Emails panel on an application (subject
3–200 characters, message 10–5,000, prefilled greeting). It is recorded as a
`custom` notification and dispatched exactly like a decision email. Management
can read the log but cannot compose, send or retry; interviewers see neither
the panel nor email entries on the timeline.

## Public applications (careers site)

`/careers/[positionId]` shows an **Apply** form while the role is open and its
deadline is unset or in the future; after the deadline the page stays up but
the form is replaced by "The application window for this role has closed."
Non-open roles remain 404.

The unauthenticated action (`submitPublicApplication`) checks, in order: the
honeypot field, the per-IP rate limit, field validation (email normalised to
lower case; salary expectation ≤ 60 chars), CV validation (PDF/DOC/DOCX,
≤ 5 MB — the same `validateCvFile` HR uses), the role's status/deadline, a
live first stage, and whether this email already applied to this role. Only
then is the CV uploaded to the private bucket, and the candidate (if new),
application, stage history, attachment, `application.applied` activity and
`application_received` acknowledgement are written in one transaction. A
database failure removes the orphaned upload; the unique indexes on candidate
email and (candidate, position) settle concurrent duplicates. An existing
candidate is reused without overwriting their stored name or phone.

Candidate-originated rows carry `created_by_id`/`uploaded_by_id`/`actor_id =
NULL` and are shown as "Candidate via careers site". On success the browser is
sent to `/careers/[positionId]/applied`; the acknowledgement email follows the
[email modes](#email-modes) above (simulated locally).

### Rate limit

**10 attempts per client address per hour**, counted on every attempt
including ones refused by validation. The counter lives in the
`rate_limit_buckets` table (one fixed-window row per key, bumped with a single
atomic upsert), so the limit holds across every deployed instance — no
per-process memory is involved. The address comes from `x-forwarded-for` /
`x-real-ip`; requests with neither share one `unknown` bucket. Tune it in
`src/lib/validation/public-application.ts`.

### Tests

```
cd apps/app
bun run test:unit            # domain, validation, templates, transport — no database
bun run test:notifications   # templates + transport only
bun run test:decisions       # record-before-dispatch against the seeded DB
NOTIFICATIONS_ENABLED=true RESEND_API_KEY=stub bun run test:decisions   # provider path with a stub transport
bun run test:public-apply    # careers intake: happy path, duplicate (incl. concurrent), deadline, non-open, bad file, honeypot, rate limit
```
