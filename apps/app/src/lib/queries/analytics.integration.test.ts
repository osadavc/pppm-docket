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
  positionStages,
  user,
} from "@/db/schema";
import { getDropoutReasons, getKpis, getStageFunnels, getTimeToFill } from "./analytics";

const DAY = 86_400_000;

/**
 * Metric correctness on a controlled fixture; deltas are asserted against a
 * baseline so the test is indifferent to whatever else the seeded database
 * holds. Prints timings for the documented environment.
 */
test("analytics aggregates: KPIs, funnels, drop-outs, time to fill", { timeout: 60_000 }, async () => {
  const [hr] = await db.select({ id: user.id }).from(user).where(eq(user.email, "hr@example.com"));
  if (!hr) throw new Error("Run `bun run db:seed` first.");
  const marker = crypto.randomUUID();
  const now = new Date();

  const before = { kpis: await getKpis(), drop: await getDropoutReasons() };
  const dropBefore = (r: string) => before.drop.find((d) => d.reason === r)?.count ?? 0;

  const [open, filled] = await db
    .insert(positions)
    .values([
      { title: `Analytics open ${marker}`, department: "Test", description: "x", status: "open", openings: 2, createdById: hr.id, openedAt: new Date(now.getTime() - 20 * DAY) },
      {
        // Inserted open (a trigger refuses applications on a filled role) and
        // marked filled once its applications exist.
        title: `Analytics filled ${marker}`, department: "Test", description: "x", status: "open", openings: 1, createdById: hr.id,
        openedAt: new Date(now.getTime() - 30 * DAY), closedAt: new Date(now.getTime() - 5 * DAY),
      },
    ])
    .returning({ id: positions.id });
  const candidateIds: string[] = [];

  try {
    const [s1, s2, , f1] = await db
      .insert(positionStages)
      .values([
        { positionId: open.id, name: "Screen", orderIndex: 0 },
        { positionId: open.id, name: "Interview", orderIndex: 1 },
        { positionId: open.id, name: "Old", orderIndex: 2, isArchived: true },
        { positionId: filled.id, name: "Only", orderIndex: 0 },
      ])
      .returning({ id: positionStages.id });

    const people = await db
      .insert(candidates)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          fullName: `Analytics ${i}`,
          email: `analytics-${marker}-${i}@example.com`,
          createdById: hr.id,
        })),
      )
      .returning({ id: candidates.id });
    candidateIds.push(...people.map((p) => p.id));

    // Open position: 4 applications — 2 active at Interview (entered both
    // stages), 1 hired (decision 10 days after applying), 1 rejected at Screen.
    // Filled position: 1 hired (decision 4 days after applying).
    const apps = await db
      .insert(applications)
      .values([
        { candidateId: people[0].id, positionId: open.id, currentStageId: s2.id, status: "active", createdById: hr.id },
        { candidateId: people[1].id, positionId: open.id, currentStageId: s2.id, status: "active", createdById: hr.id },
        {
          candidateId: people[2].id, positionId: open.id, currentStageId: s2.id, status: "hired", createdById: hr.id,
          appliedAt: new Date(now.getTime() - 12 * DAY), decisionAt: new Date(now.getTime() - 2 * DAY),
        },
        {
          candidateId: people[3].id, positionId: open.id, currentStageId: s1.id, status: "rejected", rejectionReason: "skills_mismatch", createdById: hr.id,
        },
        {
          candidateId: people[4].id, positionId: filled.id, currentStageId: f1.id, status: "hired", createdById: hr.id,
          appliedAt: new Date(now.getTime() - 9 * DAY), decisionAt: new Date(now.getTime() - 5 * DAY),
        },
        {
          candidateId: people[5].id, positionId: filled.id, currentStageId: f1.id, status: "rejected", rejectionReason: "skills_mismatch", createdById: hr.id,
        },
      ])
      .returning({ id: applications.id, positionId: applications.positionId });
    const [a0, a1, a2, a3, a4, a5] = apps;
    await db.insert(applicationStages).values([
      { applicationId: a0.id, positionStageId: s1.id, orderIndex: 0, status: "passed", enteredAt: now },
      { applicationId: a0.id, positionStageId: s2.id, orderIndex: 1, status: "in_progress", enteredAt: now },
      { applicationId: a1.id, positionStageId: s1.id, orderIndex: 0, status: "passed", enteredAt: now },
      { applicationId: a1.id, positionStageId: s2.id, orderIndex: 1, status: "in_progress", enteredAt: now },
      { applicationId: a2.id, positionStageId: s1.id, orderIndex: 0, status: "passed", enteredAt: now },
      { applicationId: a2.id, positionStageId: s2.id, orderIndex: 1, status: "passed", enteredAt: now },
      { applicationId: a3.id, positionStageId: s1.id, orderIndex: 0, status: "failed", enteredAt: now },
      { applicationId: a3.id, positionStageId: s2.id, orderIndex: 1, status: "pending", enteredAt: null },
      { applicationId: a4.id, positionStageId: f1.id, orderIndex: 0, status: "passed", enteredAt: now },
      { applicationId: a5.id, positionStageId: f1.id, orderIndex: 0, status: "failed", enteredAt: now },
    ]);

    await db.update(positions).set({ status: "filled" }).where(eq(positions.id, filled.id));

    const t0 = performance.now();
    const [kpis, funnels, drop, ttf] = await Promise.all([
      getKpis(), getStageFunnels(), getDropoutReasons(), getTimeToFill(),
    ]);
    const ms = performance.now() - t0;

    // KPIs move by exactly the fixture's contribution.
    assert.equal(kpis.openPositions, before.kpis.openPositions + 1);
    assert.equal(kpis.activeCandidates, before.kpis.activeCandidates + 2);
    assert.equal(kpis.hired, before.kpis.hired + 2);
    assert.ok(kpis.averageTimeToHireDays !== null);
    // Two new hires at 10 and 4 days; with the baseline mean m over n hires,
    // the new mean is (m*n + 14) / (n + 2).
    const n = before.kpis.hired;
    const m = before.kpis.averageTimeToHireDays ?? 0;
    assert.ok(Math.abs(kpis.averageTimeToHireDays - (m * n + 14) / (n + 2)) < 0.05);

    const openFunnel = funnels.find((f) => f.positionId === open.id);
    assert.ok(openFunnel);
    assert.deepEqual(
      openFunnel.bars.map((b) => [b.label, b.count]),
      [["Screen", 4], ["Interview", 3], ["Hired", 1]],
      "archived stage excluded; entered_at null not counted",
    );
    const filledFunnel = funnels.find((f) => f.positionId === filled.id);
    assert.deepEqual(filledFunnel?.bars.map((b) => [b.label, b.count]), [["Only", 2], ["Hired", 1]]);

    assert.equal(
      drop.find((d) => d.reason === "skills_mismatch")?.count,
      dropBefore("skills_mismatch") + 2,
    );
    assert.equal(drop.find((d) => d.reason === "skills_mismatch")?.label, "Skills do not match the role");

    const filledRow = ttf.find((t) => t.positionId === filled.id);
    assert.equal(filledRow?.days, 25);
    assert.ok(!ttf.some((t) => t.positionId === open.id), "open positions are not in time-to-fill");

    console.info(`[analytics] all four aggregates in parallel: ${ms.toFixed(0)}ms`);
  } finally {
    await db.delete(activityLog).where(inArray(activityLog.positionId, [open.id, filled.id]));
    await db.delete(positions).where(inArray(positions.id, [open.id, filled.id]));
    if (candidateIds.length) await db.delete(candidates).where(inArray(candidates.id, candidateIds));
  }
});
