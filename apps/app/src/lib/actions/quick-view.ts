"use server";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { canViewApplication, getApplicationHeader } from "@/lib/queries/activity";
import { isUuid } from "@/lib/validation/params";
import { fail, ok, type ActionResult } from "./result";

export type ApplicationQuickView = {
  applicationId: string;
  candidateName: string;
  email: string;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  source: string;
  appliedAt: Date;
  salaryExpectation: string | null;
  canSeeSalary: boolean;
  addedBy: string | null;
  cv: { attachmentId: string; fileName: string; isPdf: boolean } | null;
};

/** What the pipeline's side sheet shows, behind the same check as the full page. */
export async function getApplicationQuickView(
  applicationId: string,
): Promise<ActionResult<ApplicationQuickView>> {
  const viewer = await requireUser();
  if (!isUuid(applicationId)) return fail("That application could not be found.");
  if (!(await canViewApplication(viewer, applicationId))) {
    return fail("You do not have access to this application.");
  }

  const header = await getApplicationHeader(applicationId);
  if (!header) return fail("That application could not be found.");

  const canSeeSalary = can(viewer.role, "scorecard:read-all");
  return ok({
    applicationId,
    candidateName: header.candidateName,
    email: header.candidateEmail,
    phone: header.candidatePhone,
    location: header.candidateLocation,
    currentTitle: header.currentTitle,
    currentCompany: header.currentCompany,
    source: header.source,
    appliedAt: header.appliedAt,
    salaryExpectation: canSeeSalary ? header.salaryExpectation : null,
    canSeeSalary,
    addedBy: header.createdByName,
    cv: header.cv
      ? {
          attachmentId: header.cv.attachmentId,
          fileName: header.cv.fileName,
          isPdf: header.cv.mimeType === "application/pdf",
        }
      : null,
  });
}
