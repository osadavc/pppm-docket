import "server-only";

import { and, asc, eq } from "drizzle-orm";
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
import { COMPANY_NAME } from "@/lib/company";
import { acceptsApplications } from "@/lib/domain/position-status";
import type { CandidateEmailDeliveryStatus } from "@/lib/domain/candidate-email";
import { dispatchNotification, recordNotification } from "@/lib/notifications/send";
import { applicationReceived } from "@/lib/notifications/templates";
import type { EmailTransport } from "@/lib/notifications/transport";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  buildCvPath,
  removeCv,
  uploadCv,
  validateCvFile,
} from "@/lib/storage/attachments";
import { BUCKET } from "@/lib/storage/supabase";
import {
  HONEYPOT_FIELD,
  PUBLIC_APPLY_RATE_LIMIT,
  publicApplicationSchema,
} from "@/lib/validation/public-application";
import { fail, ok, type ActionResult } from "@/lib/actions/result";

export type PublicApplicationOutcome = ActionResult<{
  /** True when the honeypot fired: nothing was stored, but the bot is told otherwise. */
  decoy: boolean;
  applicationId: string | null;
  candidateId: string | null;
  acknowledgement: CandidateEmailDeliveryStatus;
}>;

type Storage = {
  upload: typeof uploadCv;
  remove: typeof removeCv;
};

const UNIQUE_VIOLATION = "23505";

/** Drizzle wraps the driver error, so the Postgres code sits on `cause`. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  return isUniqueViolation((error as { cause?: unknown }).cause);
}

/**
 * Unauthenticated intake from the careers site.
 *
 * Every check happens before the upload so a refused request never touches
 * storage, and the whole database write is one transaction so a failure
 * leaves no half-created candidate. The acknowledgement email is recorded in
 * that same transaction and only dispatched after it commits: a duplicate or
 * failed application produces no email.
 */
export async function submitPublicApplication(
  formData: FormData,
  context: { clientAddress: string; now?: Date },
  options: { storage?: Storage; transport?: EmailTransport } = {},
): Promise<PublicApplicationOutcome> {
  const now = context.now ?? new Date();
  const storage = options.storage ?? { upload: uploadCv, remove: removeCv };

  // Honeypot first: a filled decoy field is answered with a plausible success
  // and nothing else, so the script learns nothing from the response.
  const honeypot = formData.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return ok({
      decoy: true,
      applicationId: null,
      candidateId: null,
      acknowledgement: "not_requested",
    });
  }

  const rate = await consumeRateLimit(
    `public-apply:${context.clientAddress}`,
    PUBLIC_APPLY_RATE_LIMIT.limit,
    PUBLIC_APPLY_RATE_LIMIT.windowMs,
  );
  if (!rate.allowed) {
    return fail(
      "Too many applications from your connection. Please try again in an hour.",
    );
  }

  const parsed = publicApplicationSchema.safeParse({
    positionId: formData.get("positionId"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    salaryExpectation: formData.get("salaryExpectation") || undefined,
  });
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const input = parsed.data;

  const cv = formData.get("cv");
  if (!(cv instanceof File)) {
    return fail("Attach your CV.", { cv: ["A CV is required"] });
  }
  const fileError = validateCvFile(cv);
  if (fileError) return fail(fileError.message, { cv: [fileError.message] });

  const [position] = await db
    .select({
      id: positions.id,
      title: positions.title,
      status: positions.status,
      applicationDeadline: positions.applicationDeadline,
    })
    .from(positions)
    .where(eq(positions.id, input.positionId));
  if (!position) return fail("That role no longer exists.");
  if (
    !acceptsApplications(position.status, {
      deadline: position.applicationDeadline,
      now,
    })
  ) {
    return fail("The application window for this role has closed.");
  }

  const stages = await db
    .select({
      id: positionStages.id,
      name: positionStages.name,
      orderIndex: positionStages.orderIndex,
    })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, position.id),
        eq(positionStages.isArchived, false),
      ),
    )
    .orderBy(asc(positionStages.orderIndex));
  if (stages.length === 0) {
    return fail(
      "This role is not accepting applications yet. Please check back soon.",
    );
  }
  const firstStage = stages[0]!;

  const existing = await db.query.candidates.findFirst({
    where: eq(candidates.email, input.email),
    columns: { id: true, fullName: true },
  });
  if (existing) {
    const already = await db.query.applications.findFirst({
      where: and(
        eq(applications.candidateId, existing.id),
        eq(applications.positionId, position.id),
      ),
      columns: { id: true },
    });
    if (already) {
      return fail(
        "You have already applied for this role. We'll be in touch about that application.",
        { email: ["An application from this email already exists for this role"] },
      );
    }
  }

  // Upload before the transaction: storage is not transactional. Anything
  // that fails after this point removes the object again.
  const candidateId = existing?.id ?? crypto.randomUUID();
  const storagePath = buildCvPath(candidateId, cv);
  const uploaded = await storage.upload(storagePath, cv);
  if (!uploaded.ok) return fail(uploaded.error);

  let result: { applicationId: string; notificationId: string };
  try {
    result = await db.transaction(async (tx) => {
      if (!existing) {
        await tx.insert(candidates).values({
          id: candidateId,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone || null,
          source: "careers_site",
          createdById: null,
        });
      }
      // An existing candidate's stored name and phone are HR's record; an
      // unverified public form does not get to rewrite them.

      const [application] = await tx
        .insert(applications)
        .values({
          candidateId,
          positionId: position.id,
          currentStageId: firstStage.id,
          salaryExpectation: input.salaryExpectation || null,
          createdById: null,
        })
        .returning({ id: applications.id });
      const applicationId = application!.id;

      await tx.insert(applicationStages).values(
        stages.map((stage, index) => ({
          applicationId,
          positionStageId: stage.id,
          orderIndex: stage.orderIndex,
          status: index === 0 ? ("in_progress" as const) : ("pending" as const),
          enteredAt: index === 0 ? now : null,
        })),
      );

      await tx.insert(attachments).values({
        kind: "cv",
        candidateId,
        applicationId,
        bucket: BUCKET,
        storagePath,
        fileName: cv.name,
        mimeType: cv.type,
        sizeBytes: cv.size,
        uploadedById: null,
      });

      const displayName = existing?.fullName ?? input.fullName;
      await logActivity(tx, {
        actorId: null,
        action: "application.applied",
        entityType: "application",
        entityId: applicationId,
        applicationId,
        positionId: position.id,
        summary: `${displayName} applied to “${position.title}” from the careers site and entered the pipeline at “${firstStage.name}”`,
        metadata: {
          source: "careers_site",
          origin: "candidate",
          firstStageId: firstStage.id,
          firstStageName: firstStage.name,
          cvFileName: cv.name,
          existingCandidate: Boolean(existing),
        },
      });

      const template = applicationReceived({
        candidateName: displayName,
        positionTitle: position.title,
        companyName: COMPANY_NAME,
      });
      const notification = await recordNotification(tx, {
        type: "application_received",
        applicationId,
        candidateId,
        recipientEmail: input.email,
        subject: template.subject,
        body: template.body,
        actorId: null,
        metadata: { template: "applicationReceived", origin: "careers_site" },
      });

      return { applicationId, notificationId: notification.id };
    });
  } catch (error) {
    await storage.remove(storagePath);
    if (isUniqueViolation(error)) {
      // A concurrent submission with the same email won the race; the unique
      // indexes on candidate email and (candidate, position) hold the line.
      return fail(
        "You have already applied for this role. We'll be in touch about that application.",
        { email: ["An application from this email already exists for this role"] },
      );
    }
    throw error;
  }

  const outcome = await dispatchNotification(result.notificationId, {
    transport: options.transport,
  });

  return ok({
    decoy: false,
    applicationId: result.applicationId,
    candidateId,
    acknowledgement: outcome.status === "skipped" ? "queued" : outcome.status,
  });
}
