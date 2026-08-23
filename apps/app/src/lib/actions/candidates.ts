"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  attachments,
  candidates,
  positions,
  positionStages,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requirePermission } from "@/lib/auth/guards";
import { acceptsApplications } from "@/lib/domain/position-status";
import {
  buildCvPath,
  removeCv,
  uploadCv,
  validateCvFile,
} from "@/lib/storage/attachments";
import {
  findCandidateByEmail,
  type ExistingCandidate,
} from "@/lib/queries/candidates";
import { candidateSchema } from "@/lib/validation/candidate";
import { fail, ok, type ActionResult } from "./result";

/**
 * Add a candidate by hand and drop them into a position's pipeline.
 *
 * Takes FormData rather than a plain object because it carries a file: a File
 * survives FormData intact, where a plain zod object over one yields `{}`.
 */
export async function addCandidate(
  formData: FormData,
): Promise<ActionResult<{ candidateId: string; applicationId: string }>> {
  const actor = await requirePermission("candidate:manage");

  const parsed = candidateSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    location: formData.get("location") || undefined,
    linkedinUrl: formData.get("linkedinUrl") || undefined,
    currentTitle: formData.get("currentTitle") || undefined,
    currentCompany: formData.get("currentCompany") || undefined,
    source: formData.get("source"),
    referredById: formData.get("referredById") || undefined,
    notes: formData.get("notes") || undefined,
    positionId: formData.get("positionId"),
  });
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const d = parsed.data;

  const cv = formData.get("cv");
  if (!(cv instanceof File)) {
    return fail("Attach the candidate's CV.", { cv: ["A CV is required"] });
  }
  const fileError = validateCvFile(cv);
  if (fileError) return fail(fileError.message, { cv: [fileError.message] });

  const position = await db.query.positions.findFirst({
    where: eq(positions.id, d.positionId),
  });
  if (!position) return fail("That position no longer exists.");
  if (!acceptsApplications(position.status)) {
    return fail(`“${position.title}” is not open, so it cannot take new candidates.`);
  }

  // Only live stages form the pipeline a new candidate walks.
  const stages = await db
    .select({
      id: positionStages.id,
      name: positionStages.name,
      orderIndex: positionStages.orderIndex,
    })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, d.positionId),
        eq(positionStages.isArchived, false),
      ),
    )
    .orderBy(asc(positionStages.orderIndex));

  if (stages.length === 0) {
    return fail("That position has no interview stages configured yet.");
  }

  const existing = await db.query.candidates.findFirst({
    where: eq(candidates.email, d.email),
  });

  if (existing) {
    const already = await db.query.applications.findFirst({
      where: and(
        eq(applications.candidateId, existing.id),
        eq(applications.positionId, d.positionId),
      ),
    });
    if (already) {
      return fail(
        `${existing.fullName} has already been added to “${position.title}”.`,
        { email: ["This candidate is already on this position"] },
      );
    }
  }

  // Upload before the transaction: object storage is not transactional, so a
  // failed upload must not leave a half-created candidate behind. If the
  // database write fails afterwards, the orphaned object is cleaned up.
  const candidateIdForPath = existing?.id ?? crypto.randomUUID();
  const storagePath = buildCvPath(candidateIdForPath, cv);
  const uploaded = await uploadCv(storagePath, cv);
  if (!uploaded.ok) return fail(uploaded.error);

  try {
    const result = await db.transaction(async (tx) => {
      const candidateId =
        existing?.id ??
        (
          await tx
            .insert(candidates)
            .values({
              id: candidateIdForPath,
              fullName: d.fullName,
              email: d.email,
              phone: d.phone || null,
              location: d.location || null,
              linkedinUrl: d.linkedinUrl || null,
              currentTitle: d.currentTitle || null,
              currentCompany: d.currentCompany || null,
              source: d.source,
              referredById: d.referredById || null,
              notes: d.notes || null,
              createdById: actor.id,
            })
            .returning({ id: candidates.id })
        )[0]!.id;

      const [application] = await tx
        .insert(applications)
        .values({
          candidateId,
          positionId: d.positionId,
          createdById: actor.id,
          currentStageId: stages[0]!.id,
        })
        .returning({ id: applications.id });

      const applicationId = application!.id;
      const now = new Date();

      // Materialise the whole pipeline, with the first stage already live.
      await tx.insert(applicationStages).values(
        stages.map((s, index) => ({
          applicationId,
          positionStageId: s.id,
          orderIndex: s.orderIndex,
          status: index === 0 ? ("in_progress" as const) : ("pending" as const),
          enteredAt: index === 0 ? now : null,
        })),
      );

      await tx.insert(attachments).values({
        kind: "cv",
        candidateId,
        applicationId,
        storagePath,
        fileName: cv.name,
        mimeType: cv.type,
        sizeBytes: cv.size,
        uploadedById: actor.id,
      });

      await logActivity(tx, {
        actorId: actor.id,
        action: "application.applied",
        entityType: "application",
        entityId: applicationId,
        applicationId,
        positionId: d.positionId,
        summary: `${d.fullName} applied to “${position.title}” and entered the pipeline at “${stages[0]!.name}”`,
        metadata: {
          source: d.source,
          addedBy: actor.email,
          firstStageId: stages[0]!.id,
          firstStageName: stages[0]!.name,
          cvFileName: cv.name,
        },
      });

      return { candidateId, applicationId };
    });

    revalidatePath("/candidates");
    revalidatePath(`/positions/${d.positionId}`);
    return ok(result);
  } catch (error) {
    // Do not leave the uploaded object stranded if the row never landed.
    await removeCv(storagePath);
    throw error;
  }
}

/**
 * Email lookup for the add-candidate form. Read-only, but a Server Action
 * rather than a route handler so it is authorized the same way every other
 * mutation is — candidate history is not public.
 */
export async function lookupCandidateByEmail(
  email: string,
): Promise<ActionResult<ExistingCandidate | null>> {
  await requirePermission("candidate:manage");
  if (typeof email !== "string") return ok(null);
  return ok(await findCandidateByEmail(email));
}
