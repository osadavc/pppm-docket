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
  scorecardCriteria,
  scorecardRatings,
  scorecards,
  user,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/guards";
import { getFeedbackContext } from "./feedback";
import { listScorecardsForApplication } from "./scorecards";

/**
 * Criteria edits shape future scorecards only. A submitted rating keeps the
 * label and weight it was given against, and a deactivated criterion drops
 * out of the form without touching history.
 */
test("criterion rename/deactivate never relabels submitted ratings", { timeout: 60_000 }, async () => {
  const seeded = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(inArray(user.email, ["hr@example.com", "eng.lead@example.com", "dev1@example.com"]));
  const hr = seeded.find((u) => u.email === "hr@example.com");
  const lead = seeded.find((u) => u.email === "eng.lead@example.com");
  const peer = seeded.find((u) => u.email === "dev1@example.com");
  if (!hr || !lead || !peer) throw new Error("Run `bun run db:seed` first.");
  const hrSession: SessionUser = { id: hr.id, name: hr.name, email: hr.email, role: "hr", isActive: true };

  const marker = crypto.randomUUID();
  const [position] = await db
    .insert(positions)
    .values({ title: `Criteria ${marker}`, department: "Test", description: "x", status: "open", createdById: hr.id })
    .returning({ id: positions.id });
  let candidateId: string | undefined;
  let applicationId: string | undefined;

  try {
    const [stage] = await db
      .insert(positionStages)
      .values({ positionId: position.id, name: "Panel", orderIndex: 0, requiresScorecard: true, minScorecards: 1 })
      .returning({ id: positionStages.id });
    const [design, comms] = await db
      .insert(scorecardCriteria)
      .values([
        { positionStageId: stage.id, label: "System design", weight: 3, orderIndex: 0 },
        { positionStageId: stage.id, label: "Communication", weight: 1, orderIndex: 1 },
      ])
      .returning({ id: scorecardCriteria.id });
    const [candidate] = await db
      .insert(candidates)
      .values({ fullName: "Criteria Candidate", email: `criteria-${marker}@example.com`, createdById: hr.id })
      .returning({ id: candidates.id });
    candidateId = candidate.id;
    const [application] = await db
      .insert(applications)
      .values({ candidateId: candidate.id, positionId: position.id, currentStageId: stage.id, status: "active", createdById: hr.id })
      .returning({ id: applications.id });
    applicationId = application.id;
    const [appStage] = await db
      .insert(applicationStages)
      .values({ applicationId: application.id, positionStageId: stage.id, orderIndex: 0, status: "in_progress", enteredAt: new Date() })
      .returning({ id: applicationStages.id });

    // A submitted scorecard, rated against the criteria as they read today.
    const [card] = await db
      .insert(scorecards)
      .values({
        applicationId: application.id, applicationStageId: appStage.id, authorId: lead.id,
        status: "submitted", recommendation: "yes", overallScore: "4.50", submittedAt: new Date(), revisionCount: 1,
      })
      .returning({ id: scorecards.id });
    await db.insert(scorecardRatings).values([
      { scorecardId: card.id, criterionId: design.id, rating: 5, criterionLabel: "System design", criterionWeight: 3 },
      { scorecardId: card.id, criterionId: comms.id, rating: 3, criterionLabel: "Communication", criterionWeight: 1 },
    ]);

    // Management renames, re-weights and deactivates.
    await db.update(scorecardCriteria).set({ label: "Architecture", weight: 5 }).where(eq(scorecardCriteria.id, design.id));
    await db.update(scorecardCriteria).set({ isActive: false }).where(eq(scorecardCriteria.id, comms.id));

    const listed = await listScorecardsForApplication(application.id, hrSession);
    const submitted = listed.scorecards[0];
    assert.ok(submitted, "the scorecard is visible to HR");
    const byId = new Map(submitted.ratings.map((r) => [r.criterionId, r]));
    assert.equal(byId.get(design.id)?.label, "System design", "old label retained");
    assert.equal(byId.get(design.id)?.weight, 3, "old weight retained");
    assert.equal(byId.get(comms.id)?.label, "Communication", "deactivated criterion still shown on history");
    assert.equal(submitted.overallScore, "4.50", "frozen score untouched");

    // The live form for a fresh interviewer shows only active criteria, with
    // the new label.
    await db.insert(positionStageInterviewers).values({ positionStageId: stage.id, userId: peer.id });
    const context = await getFeedbackContext(peer.id, application.id);
    assert.ok(context);
    assert.deepEqual(context.criteria.map((c) => [c.label, c.weight]), [["Architecture", 5]]);

    // Deleting a rated criterion is refused by the database.
    await assert.rejects(db.delete(scorecardCriteria).where(eq(scorecardCriteria.id, design.id)));
  } finally {
    // Ratings restrict criterion deletion by design, so the scorecard (and
    // its ratings, by cascade) must go before the position's stages can.
    if (applicationId) await db.delete(scorecards).where(eq(scorecards.applicationId, applicationId));
    await db.delete(activityLog).where(eq(activityLog.positionId, position.id));
    await db.delete(positions).where(eq(positions.id, position.id));
    if (candidateId) await db.delete(candidates).where(eq(candidates.id, candidateId));
  }
});
