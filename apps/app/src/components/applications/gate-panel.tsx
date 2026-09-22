import { CircleCheck, Hourglass, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GATE_EXPLANATIONS, type StageGate } from "@/lib/domain/advancement";
import { formatNameList } from "@/lib/format";

/**
 * Why the candidate can or cannot leave their current stage, in words. The
 * same gate evaluation drives the Advance button, so what HR reads here is
 * exactly what the server will enforce when they click it.
 */
export function GatePanel({
  gate,
  stageName,
  outstandingInterviewers,
}: {
  gate: StageGate;
  stageName: string;
  outstandingInterviewers: readonly string[];
}) {
  const explanation = GATE_EXPLANATIONS[gate.reason];

  if (gate.blocked) {
    return (
      <Alert>
        <Hourglass />
        <AlertTitle>Advance blocked at “{stageName}”</AlertTitle>
        <AlertDescription>
          <p>
            {explanation} {gate.outstanding} more scorecard
            {gate.outstanding === 1 ? "" : "s"} needed ({gate.required} required).
          </p>
          {outstandingInterviewers.length > 0 ? (
            <p>
              Waiting on feedback from{" "}
              <span className="text-foreground font-medium">
                {formatNameList(outstandingInterviewers)}
              </span>
              .
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  const satisfied = gate.reason === "satisfied";
  const Icon = satisfied ? CircleCheck : Info;
  return (
    <Alert>
      <Icon />
      <AlertTitle>
        {satisfied ? "Ready to advance" : "No feedback gate at this stage"}
      </AlertTitle>
      <AlertDescription>{explanation}</AlertDescription>
    </Alert>
  );
}
