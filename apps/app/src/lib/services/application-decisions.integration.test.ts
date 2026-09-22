import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activityLog,
  applications,
  applicationStages,
  candidates,
  notifications,
  positions,
  positionStageInterviewers,
  positionStages,
  user,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/guards";
import { isUserRole } from "@/lib/auth/roles";
import type { EmailTransport } from "@/lib/notifications/transport";
import { getApplicationTimeline } from "@/lib/queries/activity";
import { dispatchNotification } from "@/lib/notifications/send";
import {
  advanceApplicationAs,
  rejectApplicationAs,
} from "./application-decisions";

/**
 * Record-before-dispatch, end to end against the real schema. Needs the seed
 * users and a database; run with `bun run test:decisions`.
 */
test(
  "decisions record email intent only with a committed decision",
  { timeout: 60_000 },
  async () => {
    const seeded = await db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(
        inArray(user.email, [
          "hr@example.com",
          "interviewone@example.com",
          "interviewtwo@example.com",
        ]),
      );
    const by = (email: string) => seeded.find((row) => row.email === email);
    const hr = by("hr@example.com");
    const lead = by("interviewone@example.com");
    const dev = by("interviewtwo@example.com");
    if (!hr || !lead || !dev) {
      throw new Error("Run `bun run db:seed` before the decisions integration test.");
    }
    const session = (row: typeof hr): SessionUser => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: isUserRole(row.role) ? row.role : "interviewer",
      isActive: true,
    });
    const hrSession = session(hr);
    const leadSession = session(lead);
    // The panel is listed alphabetically, however it was assigned.
    const [firstName, secondName] = [dev.name, lead.name].sort((a, b) => a.localeCompare(b));

    const marker = crypto.randomUUID();
    const [position] = await db
      .insert(positions)
      .values({
        title: `Decisions integration ${marker}`,
        department: "Test",
        description: "Synthetic decisions position",
        status: "open",
        requireFeedbackToAdvance: true,
        createdById: hr.id,
      })
      .returning({ id: positions.id });
    const candidateIds: string[] = [];

    try {
      const [screen, panel] = await db
        .insert(positionStages)
        .values([
          {
            positionId: position.id,
            name: "Screen",
            orderIndex: 0,
            requiresScorecard: true,
            minScorecards: 2,
          },
          {
            positionId: position.id,
            name: "Panel",
            orderIndex: 1,
            requiresScorecard: false,
            minScorecards: 0,
          },
        ])
        .returning({ id: positionStages.id });
      await db.insert(positionStageInterviewers).values([
        { positionStageId: screen.id, userId: lead.id },
        { positionStageId: screen.id, userId: dev.id },
      ]);

      const [alice, bob] = await db
        .insert(candidates)
        .values([
          {
            fullName: "Alice Advance",
            email: `alice-${marker}@docket.test`,
            createdById: hr.id,
          },
          {
            fullName: "Bob Reject",
            email: `bob-${marker}@docket.test`,
            createdById: hr.id,
          },
        ])
        .returning({ id: candidates.id, email: candidates.email });
      candidateIds.push(alice.id, bob.id);

      const [aliceApp, bobApp] = await db
        .insert(applications)
        .values([
          { candidateId: alice.id, positionId: position.id, currentStageId: screen.id, status: "active", createdById: hr.id },
          { candidateId: bob.id, positionId: position.id, currentStageId: screen.id, status: "active", createdById: hr.id },
        ])
        .returning({ id: applications.id });
      await db.insert(applicationStages).values(
        [aliceApp, bobApp].map((app) => ({
          applicationId: app.id,
          positionStageId: screen.id,
          orderIndex: 0,
          status: "in_progress" as const,
          enteredAt: new Date(),
        })),
      );

      const email = { subject: "Moving forward", body: "Hi Alice,\n\nGood news." };

      // 1. Blocked advance: refused, names the outstanding panel, sends nothing.
      const blocked = await advanceApplicationAs(hrSession, {
        applicationId: aliceApp.id,
        notification: email,
      });
      assert.equal(blocked.ok, false);
      assert.match(
        blocked.ok ? "" : blocked.error,
        new RegExp(`Waiting on feedback from ${firstName} and ${secondName}\\.`),
      );
      assert.equal(
        (await db.select().from(notifications).where(eq(notifications.applicationId, aliceApp.id))).length,
        0,
        "a blocked advance must not record an email intent",
      );
      const [stillThere] = await db
        .select({ currentStageId: applications.currentStageId })
        .from(applications)
        .where(eq(applications.id, aliceApp.id));
      assert.equal(stillThere.currentStageId, screen.id);

      // 2. A short override reason is refused by the schema, not just the UI.
      const tooShort = await advanceApplicationAs(hrSession, {
        applicationId: aliceApp.id,
        overrideReason: "because",
        notification: email,
      });
      assert.equal(tooShort.ok, false);
      assert.ok(!tooShort.ok && tooShort.fieldErrors?.overrideReason);

      // 3. Management holds application:manage? No — only HR may advance.
      const notHr = await advanceApplicationAs(leadSession, {
        applicationId: aliceApp.id,
        overrideReason: "Panel member on leave, manager approved.",
      });
      assert.equal(notHr.ok, false);

      // 4. Override with a reason: decision commits, intent recorded, then
      //    dispatched through a stub provider *after* commit.
      const calls: Array<{ to: string; key: string; from: string; html: string }> = [];
      const transport: EmailTransport = {
        send: async (payload, options) => {
          const claimed = await db
            .select({ status: notifications.status })
            .from(notifications)
            .where(inArray(notifications.applicationId, [aliceApp.id, bobApp.id]));
          assert.ok(
            claimed.some((r) => r.status === "dispatching"),
            "row is claimed before the provider is called",
          );
          calls.push({ to: payload.to, key: options.idempotencyKey, from: payload.from, html: payload.html });
          return { data: { id: "msg_stub_1" }, error: null };
        },
      };
      const advanced = await advanceApplicationAs(
        hrSession,
        {
          applicationId: aliceApp.id,
          overrideReason: "Panel member on leave; hiring manager approved by email.",
          notification: email,
        },
        { transport },
      );
      assert.ok(advanced.ok, advanced.ok ? "" : advanced.error);
      assert.equal(advanced.data.overridden, true);
      assert.equal(advanced.data.toStageId, panel.id);

      const [aliceMail] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.applicationId, aliceApp.id));
      assert.equal(aliceMail.type, "stage_advanced");
      assert.equal(aliceMail.actorId, hr.id);
      assert.equal(aliceMail.recipientCandidateId, alice.id);
      assert.equal(aliceMail.recipientEmail, alice.email);
      assert.equal(aliceMail.subject, email.subject);
      assert.equal(aliceMail.body, email.body);
      assert.equal(aliceMail.metadata?.idempotencyKey, `notification/${aliceMail.id}`);
      assert.equal(aliceMail.metadata?.originalRecipient, alice.email);

      if (process.env.NOTIFICATIONS_ENABLED === "true") {
        assert.equal(advanced.data.email.status, "sent");
        assert.equal(aliceMail.status, "sent");
        assert.equal(aliceMail.providerMessageId, "msg_stub_1");
        assert.equal(calls.length, 1);
        assert.equal(calls[0].key, `notification/${aliceMail.id}`);
        assert.match(calls[0].from, /Hiring </);
        assert.match(calls[0].html, /Good news\./);
      } else {
        assert.equal(advanced.data.email.status, "simulated");
        assert.equal(aliceMail.status, "simulated");
        assert.equal(calls.length, 0, "simulated mode never contacts a provider");
      }
      assert.equal(aliceMail.attemptCount, 1);
      assert.ok(aliceMail.lastAttemptAt);

      // The override reason is on the timeline for HR, hidden from interviewers.
      const hrTimeline = await getApplicationTimeline(aliceApp.id, hrSession);
      const override = hrTimeline.find((entry) => entry.title.includes("overriding"));
      assert.ok(override);
      assert.equal(
        override.meta?.overrideReason,
        "Panel member on leave; hiring manager approved by email.",
      );
      assert.deepEqual(override.meta?.outstandingInterviewers, [firstName, secondName]);
      assert.ok(!override.detail?.includes("Panel member on leave"));
      assert.ok(hrTimeline.some((entry) => entry.kind === "email" && entry.communication?.body === email.body));

      // 5. Rejection with edited text: stored verbatim; internal note never in the email.
      const edited = {
        subject: `  Thanks, Bob — about ${marker}  `,
        body: "Hi Bob,\n\nWe edited this line by hand.\n\nRegards",
      };
      const rejected = await rejectApplicationAs(
        hrSession,
        {
          applicationId: bobApp.id,
          reason: "skills_mismatch",
          note: "Internal only: not for the candidate.",
          notification: edited,
        },
        { transport },
      );
      assert.ok(rejected.ok, rejected.ok ? "" : rejected.error);
      const [bobMail] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.applicationId, bobApp.id));
      assert.equal(bobMail.type, "rejection");
      assert.equal(bobMail.actorId, hr.id);
      assert.equal(bobMail.subject, edited.subject.trim());
      assert.equal(bobMail.body, edited.body);
      assert.ok(!bobMail.body.includes("Internal only"));
      const [bobRow] = await db
        .select({ status: applications.status, decisionReason: applications.decisionReason })
        .from(applications)
        .where(eq(applications.id, bobApp.id));
      assert.equal(bobRow.status, "rejected");
      assert.equal(bobRow.decisionReason, "Internal only: not for the candidate.");

      // 6. Rejection with the checkbox on but an empty body is a validation error.
      const empty = await rejectApplicationAs(hrSession, {
        applicationId: bobApp.id,
        reason: "other",
        note: "Long enough note for other.",
        notification: { subject: "x", body: "   " },
      });
      assert.equal(empty.ok, false);
      assert.ok(!empty.ok && JSON.stringify(empty.fieldErrors ?? {}).includes("Enter an email message"));

      // 7. A second dispatch of a delivered/simulated row is refused: the
      //    claim is the concurrency control the Retry action relies on.
      const again = await dispatchNotification(bobMail.id, { transport });
      assert.equal(again.status, "skipped");
      const [bobMailAfter] = await db
        .select({ attemptCount: notifications.attemptCount })
        .from(notifications)
        .where(eq(notifications.id, bobMail.id));
      assert.equal(bobMailAfter.attemptCount, 1);
      // 8. Unknown provider outcome: the row stays claimed and marked, a
      //    fresh copy is never sent, and a deliberate retry reconciles through
      //    the same idempotency key.
      const [carol] = await db
        .insert(candidates)
        .values({ fullName: "Carol Timeout", email: `carol-${marker}@docket.test`, createdById: hr.id })
        .returning({ id: candidates.id });
      candidateIds.push(carol.id);
      const [carolApp] = await db
        .insert(applications)
        .values({ candidateId: carol.id, positionId: position.id, currentStageId: screen.id, status: "active", createdById: hr.id })
        .returning({ id: applications.id });
      await db.insert(applicationStages).values({
        applicationId: carolApp.id, positionStageId: screen.id, orderIndex: 0, status: "in_progress", enteredAt: new Date(),
      });
      const keys: string[] = [];
      let hang = true;
      const flaky: EmailTransport = {
        send: async (_payload, options) => {
          keys.push(options.idempotencyKey);
          if (hang) throw new Error("ETIMEDOUT");
          return { data: { id: "msg_reconciled" }, error: null };
        },
      };
      const carolResult = await rejectApplicationAs(
        hrSession,
        { applicationId: carolApp.id, reason: "position_closed", notification: edited },
        { transport: flaky },
      );
      assert.ok(carolResult.ok);
      const [carolMail] = await db.select().from(notifications).where(eq(notifications.applicationId, carolApp.id));
      if (process.env.NOTIFICATIONS_ENABLED === "true") {
        assert.equal(carolResult.data.email.status, "unknown");
        assert.equal(carolMail.status, "dispatching");
        assert.equal(carolMail.metadata?.outcome, "unknown");
        assert.match(carolMail.error ?? "", /outcome unknown/);
        hang = false;
        const reconciled = await dispatchNotification(carolMail.id, { transport: flaky });
        assert.equal(reconciled.status, "sent");
        assert.deepEqual(keys, [`notification/${carolMail.id}`, `notification/${carolMail.id}`]);
        const [carolAfter] = await db.select().from(notifications).where(eq(notifications.id, carolMail.id));
        assert.equal(carolAfter.status, "sent");
        assert.equal(carolAfter.attemptCount, 2);
        assert.equal(carolAfter.providerMessageId, "msg_reconciled");
      } else {
        assert.equal(carolMail.status, "simulated");
      }
      // Whatever happened to the email, the rejection stood.
      const [carolRow] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, carolApp.id));
      assert.equal(carolRow.status, "rejected");
    } finally {
      await db.delete(activityLog).where(eq(activityLog.positionId, position.id));
      await db.delete(positions).where(eq(positions.id, position.id));
      if (candidateIds.length > 0) {
        await db.delete(candidates).where(inArray(candidates.id, candidateIds));
      }
    }
  },
);
