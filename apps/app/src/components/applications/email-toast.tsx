import { toast } from "sonner";
import type { DecisionEmail } from "@/lib/services/application-decisions";

/**
 * One toast per decision, phrased as what happened. The decision itself is
 * always reported as done, a failed email never undoes it, and the email
 * outcome is appended as a second sentence.
 */
export function candidateEmailToast(outcome: string, email: DecisionEmail) {
  switch (email.status) {
    case "not_requested":
      toast.success(outcome);
      return;
    case "sent":
      toast.success(`${outcome} Candidate emailed.`);
      return;
    case "simulated":
      toast.success(`${outcome} Candidate email recorded (delivery is off).`);
      return;
    case "queued":
      toast.success(`${outcome} Candidate email queued.`);
      return;
    case "unknown":
      toast.warning(
        `${outcome} The email provider did not answer. Check the Emails panel before retrying.`,
      );
      return;
    case "failed":
      toast.warning(
        `${outcome} The candidate email failed${email.error ? `: ${email.error}` : "."} Retry it from the Emails panel.`,
      );
      return;
  }
}
