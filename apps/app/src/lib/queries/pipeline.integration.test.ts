import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activityLog,
  applications,
  applicationStages,
  candidates,
  positions,
  positionStageInterviewers,
  positionStages,
  scorecards,
  user,
} from "@/db/schema";
import { getBlockedOnFeedbackByPosition, getPositionsOverview } from "./dashboard";
import { BOARD_CARDS_PER_STAGE, getPipelineBoard, getReviewQueue } from "./pipeline";

const LOAD = Number(process.env.PIPELINE_LOAD ?? 1000);
const DAY = 86_400_000;

/**
 * Bounded board + exact counts against a synthetic position with `LOAD`
 * applications (default 1,000). Also the timing record for the story: run
 * with `bun run test:pipeline` and read the numbers it prints.
 */
test(
  `pipeline board is bounded and exact at ${LOAD} applications`,
  { timeout: 300_000 },
  async () => {
    const seeded = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.email, ["hr@example.com", "interviewone@example.com", "interviewtwo@example.com"]));
    const hr = seeded.find((u) => u.email === "hr@example.com");
    const lead = seeded.find((u) => u.email === "interviewone@example.com");
    const dev = seeded.find((u) => u.email === "interviewtwo@example.com");
    if (!hr || !lead || !dev) throw new Error("Run `bun run db:seed` first.");

    const marker = crypto.randomUUID();
    const now = new Date();
    const [position] = await db
      .insert(positions)
      .values({
        title: `Load ${marker}`,
        department: "Load",
        description: "x",
        status: "open",
        openings: 3,
        requireFeedbackToAdvance: true,
        createdById: hr.id,
      })
      .returning({ id: positions.id });
    let candidateIds: string[] = [];

    try {
      const stages = await db
        .insert(positionStages)
        .values([
          { positionId: position.id, name: "Screen", orderIndex: 0, requiresScorecard: true, minScorecards: 1 },
          { positionId: position.id, name: "Interview", orderIndex: 1, requiresScorecard: true, minScorecards: 2 },
          { positionId: position.id, name: "Offer", orderIndex: 2, requiresScorecard: false, minScorecards: 0 },
          { positionId: position.id, name: "Old stage", orderIndex: 3, isArchived: true },
        ])
        .returning({ id: positionStages.id, name: positionStages.name });
      const [screen, interview, offer, archived] = stages;
      await db.insert(positionStageInterviewers).values([
        { positionStageId: screen.id, userId: lead.id },
        { positionStageId: interview.id, userId: lead.id },
        { positionStageId: interview.id, userId: dev.id },
      ]);

      // Distribution: 70% screen, 15% interview, 5% offer, 3% archived stage,
      // 3% on hold, 2% hired, 2% rejected. Entered dates spread over 12 days.
      type Kind = "screen" | "interview" | "offer" | "archived" | "on_hold" | "hired" | "rejected";
      const kinds: Kind[] = [];
      for (let i = 0; i < LOAD; i += 1) {
        const r = i % 100;
        kinds.push(
          r < 70 ? "screen" : r < 85 ? "interview" : r < 90 ? "offer" : r < 93 ? "archived" : r < 96 ? "on_hold" : r < 98 ? "hired" : "rejected",
        );
      }

      const t0 = performance.now();
      const candidateRows = await db
        .insert(candidates)
        .values(
          kinds.map((_, i) => ({
            fullName: `Load Candidate ${String(i).padStart(4, "0")}`,
            email: `load-${marker}-${i}@example.com`,
            createdById: hr.id,
          })),
        )
        .returning({ id: candidates.id });
      candidateIds = candidateRows.map((c) => c.id);

      const stageFor = (k: Kind) =>
        k === "interview" ? interview : k === "offer" ? offer : k === "archived" ? archived : screen;
      const appRows = await db
        .insert(applications)
        .values(
          kinds.map((k, i) => ({
            candidateId: candidateIds[i],
            positionId: position.id,
            currentStageId: stageFor(k).id,
            status:
              k === "on_hold" ? ("on_hold" as const)
              : k === "hired" ? ("hired" as const)
              : k === "rejected" ? ("rejected" as const)
              : ("active" as const),
            rejectionReason: k === "rejected" ? ("other" as const) : null,
            appliedAt: new Date(now.getTime() - (i % 30) * DAY),
            createdById: hr.id,
          })),
        )
        .returning({ id: applications.id, currentStageId: applications.currentStageId });
      const stageRows = await db
        .insert(applicationStages)
        .values(
          appRows.map((a, i) => ({
            applicationId: a.id,
            positionStageId: a.currentStageId!,
            orderIndex: 0,
            status: "in_progress" as const,
            // i % 12 days ago: 6..11 are stalled (redFrom = 6).
            enteredAt: new Date(now.getTime() - (i % 12) * DAY),
          })),
        )
        .returning({ id: applicationStages.id, applicationId: applicationStages.applicationId });
      // Every 7th screen candidate has the lead's scorecard in → gate clear.
      const screenAppStages = stageRows.filter((_, i) => kinds[i] === "screen" && i % 7 === 0);
      await db.insert(scorecards).values(
        screenAppStages.map((s) => ({
          applicationId: s.applicationId,
          applicationStageId: s.id,
          authorId: lead.id,
          status: "submitted" as const,
          recommendation: "yes" as const,
          submittedAt: now,
        })),
      );
      console.info(`[load] seeded ${LOAD} applications in ${(performance.now() - t0).toFixed(0)}ms`);

      // Expected numbers, computed from the distribution, not the board.
      const n = (k: Kind) => kinds.filter((x) => x === k).length;
      const activeLive = n("screen") + n("interview") + n("offer");
      const stalledExpected = kinds.filter(
        (k, i) => (k === "screen" || k === "interview" || k === "offer") && i % 12 >= 6,
      ).length;

      const t1 = performance.now();
      const board = await getPipelineBoard(position.id, now);
      const boardMs = performance.now() - t1;
      const t1b = performance.now();
      await getPipelineBoard(position.id, now);
      const boardWarmMs = performance.now() - t1b;

      assert.equal(board.columns.length, 3, "archived stage has no column");
      assert.equal(board.total, activeLive);
      assert.equal(board.columns[0].count, n("screen"));
      assert.equal(board.columns[1].count, n("interview"));
      assert.equal(board.columns[2].count, n("offer"));
      for (const column of board.columns) {
        assert.ok(column.candidates.length <= BOARD_CARDS_PER_STAGE, `${column.name} bounded`);
        assert.equal(column.candidates.length, Math.min(column.count, BOARD_CARDS_PER_STAGE));
        // Oldest in stage first.
        for (let i = 1; i < column.candidates.length; i += 1) {
          assert.ok(
            (column.candidates[i - 1].enteredAt?.getTime() ?? 0) <=
              (column.candidates[i].enteredAt?.getTime() ?? 0),
          );
        }
      }
      assert.equal(board.stalled, stalledExpected);
      assert.deepEqual(board.resolved, { hired: n("hired"), onHold: n("on_hold"), rejected: n("rejected") });
      assert.equal(board.firstStage?.reviewable, n("screen"));
      const payload = JSON.stringify(board).length;
      assert.ok(
        board.columns.reduce((s, c) => s + c.candidates.length, 0) <= 3 * BOARD_CARDS_PER_STAGE,
      );

      const t2 = performance.now();
      const review = await getReviewQueue(position.id, { includeSalary: true });
      const reviewMs = performance.now() - t2;
      assert.ok(review);
      assert.equal(review.total, n("screen"));
      assert.equal(review.cards.length, 25);
      assert.equal(review.stage?.id, screen.id);
      assert.equal(review.nextStage?.id, interview.id);
      for (let i = 1; i < review.cards.length; i += 1) {
        assert.ok(review.cards[i - 1].appliedAt.getTime() <= review.cards[i].appliedAt.getTime());
      }
      const withFeedback = review.cards.filter((c) => !c.gate.blocked);
      const without = review.cards.filter((c) => c.gate.blocked);
      assert.ok(withFeedback.length > 0 && without.length > 0, "both gate states present");
      assert.deepEqual(without[0].outstandingInterviewers, [
        (await db.select({ name: user.name }).from(user).where(eq(user.id, lead.id)))[0].name,
      ]);

      // Dashboard: blocked on feedback = screen without the lead's card
      // (interview needs 2, nobody submitted; offer needs none).
      const t3 = performance.now();
      const blocked = await getBlockedOnFeedbackByPosition();
      const overview = await getPositionsOverview(now);
      const dashMs = performance.now() - t3;
      const expectedBlocked = n("screen") - screenAppStages.length + n("interview");
      assert.equal(blocked.get(position.id), expectedBlocked);
      const row = overview.find((p) => p.id === position.id);
      assert.ok(row);
      assert.equal(row.active, activeLive);
      assert.equal(row.stuck, stalledExpected);
      assert.equal(row.hired, n("hired"));
      assert.equal(row.openings, 3);
      assert.equal(row.blockedOnFeedback, expectedBlocked);

      console.info(
        `[load] ${LOAD} apps · board ${boardMs.toFixed(0)}ms cold / ${boardWarmMs.toFixed(0)}ms warm (${payload} bytes, ${board.columns.reduce((s, c) => s + c.candidates.length, 0)} cards) · review ${reviewMs.toFixed(0)}ms (${review.cards.length} cards) · dashboard ${dashMs.toFixed(0)}ms`,
      );
    } finally {
      await db.delete(activityLog).where(eq(activityLog.positionId, position.id));
      await db.delete(positions).where(eq(positions.id, position.id));
      if (candidateIds.length > 0) {
        await db.delete(candidates).where(inArray(candidates.id, candidateIds));
      }
    }
  },
);
