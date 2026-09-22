import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activityLog,
  applications,
  applicationStages,
  attachments,
  candidates,
  notifications,
  positions,
  positionStages,
  rateLimitBuckets,
  user,
} from "@/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { PUBLIC_APPLY_RATE_LIMIT } from "@/lib/validation/public-application";
import { submitPublicApplication } from "./public-applications";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function form(fields: Record<string, string>, cv?: File) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  if (cv) data.set("cv", cv);
  return data;
}

/**
 * Public intake against the real schema, with storage stubbed so the test
 * never needs a bucket. Run with `bun run test:public-apply`.
 */
test(
  "public application: happy path, duplicate, deadline, non-open, bad file, honeypot, rate limit",
  { timeout: 60_000 },
  async () => {
    const [hr] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "hr@docket.test"));
    if (!hr) throw new Error("Run `bun run db:seed` first.");

    const marker = crypto.randomUUID();
    const ip = `test-${marker}`;
    const uploads: string[] = [];
    const removed: string[] = [];
    const storage = {
      upload: async (path: string) => {
        uploads.push(path);
        return { ok: true as const };
      },
      remove: async (path: string) => {
        removed.push(path);
      },
    };
    const cv = () => new File([PDF], "cv.pdf", { type: "application/pdf" });

    const [openRole, expiredRole, draftRole, emptyRole] = await db
      .insert(positions)
      .values([
        { title: `Public open ${marker}`, department: "Test", description: "x", status: "open", createdById: hr.id },
        {
          title: `Public expired ${marker}`, department: "Test", description: "x", status: "open", createdById: hr.id,
          applicationDeadline: new Date(Date.now() - 86_400_000),
        },
        { title: `Public draft ${marker}`, department: "Test", description: "x", status: "draft", createdById: hr.id },
        { title: `Public no stages ${marker}`, department: "Test", description: "x", status: "open", createdById: hr.id },
      ])
      .returning({ id: positions.id });
    const candidateEmails = [`pub-${marker}@example.com`, `existing-${marker}@example.com`];

    try {
      const [first] = await db
        .insert(positionStages)
        .values([
          { positionId: openRole.id, name: "CV screen", orderIndex: 0 },
          { positionId: openRole.id, name: "Interview", orderIndex: 1 },
          { positionId: expiredRole.id, name: "CV screen", orderIndex: 0 },
          { positionId: draftRole.id, name: "CV screen", orderIndex: 0 },
        ])
        .returning({ id: positionStages.id });

      const base = { positionId: openRole.id, fullName: "Pat Public", email: `PUB-${marker}@Example.com` };
      // Refused attempts count against the limit, so the happy path uses a
      // fresh address rather than inheriting the probes above.
      const ctx = { clientAddress: `${ip}-refusals` };
      const okCtx = { clientAddress: `${ip}-ok` };

      // Honeypot: "success" with nothing written.
      const decoy = await submitPublicApplication(form({ ...base, website: "http://spam" }, cv()), ctx, { storage });
      assert.ok(decoy.ok && decoy.data.decoy);
      assert.equal(uploads.length, 0);

      // Bad file: refused before upload.
      const badFile = await submitPublicApplication(
        form(base, new File([PDF], "cv.exe", { type: "application/x-msdownload" })),
        ctx,
        { storage },
      );
      assert.equal(badFile.ok, false);
      assert.ok(!badFile.ok && badFile.fieldErrors?.cv);
      const tooBig = await submitPublicApplication(
        form(base, new File([new Uint8Array(5 * 1024 * 1024 + 1)], "cv.pdf", { type: "application/pdf" })),
        ctx,
        { storage },
      );
      assert.equal(tooBig.ok, false);
      assert.equal(uploads.length, 0);

      // Expired deadline and non-open: refused.
      const expired = await submitPublicApplication(form({ ...base, positionId: expiredRole.id }, cv()), ctx, { storage });
      assert.ok(!expired.ok && /window for this role has closed/.test(expired.error));
      const draft = await submitPublicApplication(form({ ...base, positionId: draftRole.id }, cv()), ctx, { storage });
      assert.equal(draft.ok, false);
      const noStages = await submitPublicApplication(form({ ...base, positionId: emptyRole.id }, cv()), ctx, { storage });
      assert.ok(!noStages.ok && /not accepting applications yet/.test(noStages.error));
      assert.equal(uploads.length, 0);
      assert.equal(
        (await db.select().from(applications).where(eq(applications.positionId, emptyRole.id))).length,
        0,
        "no partial application without a live stage",
      );

      // Happy path: candidate + application + stages + CV + activity + acknowledgement.
      const okResult = await submitPublicApplication(
        form({ ...base, phone: "0771234567", salaryExpectation: "120k" }, cv()),
        okCtx,
        { storage },
      );
      assert.ok(okResult.ok, okResult.ok ? "" : okResult.error);
      assert.ok(!okResult.data.decoy && okResult.data.applicationId);
      assert.equal(uploads.length, 1);
      assert.equal(removed.length, 0);

      const [candidate] = await db.select().from(candidates).where(eq(candidates.email, candidateEmails[0]));
      assert.ok(candidate, "email is normalised to lower case");
      assert.equal(candidate.createdById, null);
      assert.equal(candidate.source, "careers_site");
      const [application] = await db.select().from(applications).where(eq(applications.id, okResult.data.applicationId!));
      assert.equal(application.createdById, null);
      assert.equal(application.currentStageId, first.id);
      assert.equal(application.salaryExpectation, "120k");
      const stageRows = await db.select().from(applicationStages).where(eq(applicationStages.applicationId, application.id));
      assert.equal(stageRows.length, 2);
      assert.equal(stageRows.find((r) => r.positionStageId === first.id)?.status, "in_progress");
      const [cvRow] = await db.select().from(attachments).where(eq(attachments.applicationId, application.id));
      assert.equal(cvRow.uploadedById, null);
      assert.equal(cvRow.storagePath, uploads[0]);
      const [applied] = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.applicationId, application.id));
      assert.equal(applied.actorId, null);
      assert.equal(applied.action, "application.applied");
      assert.match(applied.summary, /from the careers site/);
      const [ack] = await db.select().from(notifications).where(eq(notifications.applicationId, application.id));
      assert.equal(ack.type, "application_received");
      assert.equal(ack.actorId, null);
      assert.equal(ack.recipientCandidateId, candidate.id);
      assert.ok(["simulated", "sent", "failed"].includes(ack.status));
      assert.equal(okResult.data.acknowledgement, ack.status);

      // Duplicate: refused before upload, no second acknowledgement.
      const dup = await submitPublicApplication(form(base, cv()), okCtx, { storage });
      assert.ok(!dup.ok && /already applied/.test(dup.error));
      assert.equal(uploads.length, 1);
      assert.equal(
        (await db.select().from(notifications).where(eq(notifications.applicationId, application.id))).length,
        1,
      );

      // Existing candidate keeps their stored name/phone.
      const [existing] = await db
        .insert(candidates)
        .values({ fullName: "Existing Person", email: candidateEmails[1], phone: "111", createdById: hr.id })
        .returning({ id: candidates.id });
      const reuse = await submitPublicApplication(
        form({ ...base, fullName: "Different Name", email: candidateEmails[1], phone: "999" }, cv()),
        okCtx,
        { storage },
      );
      assert.ok(reuse.ok);
      const [kept] = await db.select().from(candidates).where(eq(candidates.id, existing.id));
      assert.equal(kept.fullName, "Existing Person");
      assert.equal(kept.phone, "111");
      assert.equal(kept.createdById, hr.id);

      // Concurrent duplicate: a second submission slips in between the
      // duplicate check and the transaction. The unique index refuses it,
      // the orphaned upload is removed, and the caller gets the duplicate
      // message rather than a crash.
      const racerEmail = `racer-${marker}@example.com`;
      candidateEmails.push(racerEmail);
      const racingStorage = {
        ...storage,
        upload: async (path: string) => {
          uploads.push(path);
          const [racer] = await db
            .insert(candidates)
            .values({ fullName: "Racer", email: racerEmail, createdById: hr.id })
            .returning({ id: candidates.id });
          await db.insert(applications).values({
            candidateId: racer.id,
            positionId: openRole.id,
            currentStageId: first.id,
            createdById: hr.id,
          });
          return { ok: true as const };
        },
      };
      const removedBefore = removed.length;
      const raced = await submitPublicApplication(
        form({ ...base, email: racerEmail }, cv()),
        okCtx,
        { storage: racingStorage },
      );
      assert.ok(!raced.ok && /already applied/.test(raced.error));
      assert.equal(removed.length, removedBefore + 1, "orphaned upload removed");
      assert.equal(removed[removed.length - 1], uploads[uploads.length - 1]);
      assert.equal(
        (await db.select().from(candidates).where(eq(candidates.email, racerEmail))).length,
        1,
        "no second candidate row",
      );

      // Rate limit: shared counter, refuses once over the limit.
      const limitIp = `limit-${marker}`;
      for (let i = 0; i < PUBLIC_APPLY_RATE_LIMIT.limit; i += 1) {
        const r = await consumeRateLimit(`public-apply:${limitIp}`, PUBLIC_APPLY_RATE_LIMIT.limit, PUBLIC_APPLY_RATE_LIMIT.windowMs);
        assert.equal(r.allowed, true);
      }
      const limited = await submitPublicApplication(
        form({ ...base, email: `limited-${marker}@example.com` }, cv()),
        { clientAddress: limitIp },
        { storage },
      );
      assert.ok(!limited.ok && /Too many applications/.test(limited.error));
      // A lapsed window resets the counter.
      await db
        .update(rateLimitBuckets)
        .set({ windowStartedAt: new Date(Date.now() - PUBLIC_APPLY_RATE_LIMIT.windowMs - 1000) })
        .where(eq(rateLimitBuckets.key, `public-apply:${limitIp}`));
      const reset = await consumeRateLimit(`public-apply:${limitIp}`, PUBLIC_APPLY_RATE_LIMIT.limit, PUBLIC_APPLY_RATE_LIMIT.windowMs);
      assert.equal(reset.hits, 1);
    } finally {
      await db.delete(activityLog).where(inArray(activityLog.positionId, [openRole.id, expiredRole.id, draftRole.id, emptyRole.id]));
      await db.delete(positions).where(inArray(positions.id, [openRole.id, expiredRole.id, draftRole.id, emptyRole.id]));
      await db.delete(candidates).where(inArray(candidates.email, candidateEmails));
      await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, `%${marker}%`));
    }
  },
);
