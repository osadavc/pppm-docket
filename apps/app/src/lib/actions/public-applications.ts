"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientAddress } from "@/lib/rate-limit";
import { submitPublicApplication } from "@/lib/services/public-applications";
import type { ActionResult } from "./result";

/**
 * The one unauthenticated mutation in the app. No session, no permission —
 * every safeguard (honeypot, rate limit, deadline, file checks, duplicate
 * refusal) lives in the service, and the action only adds the caller's
 * address and the redirect.
 */
export async function applyToPosition(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  const positionId = formData.get("positionId");
  const result = await submitPublicApplication(formData, {
    clientAddress: clientAddress(await headers()),
  });
  if (!result.ok) return result;

  if (!result.data.decoy) {
    revalidatePath("/candidates");
    if (typeof positionId === "string") {
      revalidatePath(`/positions/${positionId}`);
      revalidatePath(`/positions/${positionId}/pipeline`);
    }
  }
  redirect(`/careers/${typeof positionId === "string" ? positionId : ""}/applied`);
}
