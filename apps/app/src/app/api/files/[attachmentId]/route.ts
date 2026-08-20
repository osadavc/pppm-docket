import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { attachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { interviewerCanViewApplication } from "@/lib/queries/stage-interviewers";
import { createCvSignedUrl } from "@/lib/storage/attachments";

/**
 * The only route to a stored file.
 *
 * The bucket is private, so there is no anonymous link to a CV anywhere: the
 * signed URL is minted here, lasts 60 seconds, and is only ever handed to a
 * caller who has already been authorized. A route handler rather than a Server
 * Action because this has to answer a browser navigation with a redirect.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to download this file." }, { status: 401 });
  }

  const { attachmentId } = await params;

  const attachment = await db.query.attachments.findFirst({
    where: eq(attachments.id, attachmentId),
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // HR and management see every candidate's file; an interviewer only sees
  // files for applications they are actually responsible for assessing.
  let allowed = can(user.role, "candidate:view");
  if (!allowed && attachment.applicationId) {
    allowed = await interviewerCanViewApplication(user.id, attachment.applicationId);
  }
  if (!allowed) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const signed = await createCvSignedUrl(attachment.storagePath, attachment.fileName);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.error }, { status: 500 });
  }

  return NextResponse.redirect(signed.url);
}
