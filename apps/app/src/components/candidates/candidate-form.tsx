"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addCandidate, lookupCandidateByEmail } from "@/lib/actions/candidates";
import { ExistingCandidateNotice } from "@/components/candidates/existing-candidate-notice";
import type { ExistingCandidate } from "@/lib/queries/candidates";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/validation/candidate";

type OpenPosition = { id: string; title: string; department: string };

export function CandidateForm({ positions }: { positions: OpenPosition[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [source, setSource] = useState("referral");
  const [positionId, setPositionId] = useState(positions[0]?.id ?? "");
  const [existing, setExisting] = useState<ExistingCandidate | null>(null);

  // Checked when the email field loses focus rather than on every keystroke —
  // this reads candidate history, so it should not fire mid-typing.
  async function checkEmail(email: string) {
    if (!email.includes("@")) {
      setExisting(null);
      return;
    }
    const result = await lookupCandidateByEmail(email);
    setExisting(result.ok ? result.data : null);
  }

  const err = (name: string) =>
    fieldErrors[name]?.[0] ? [{ message: fieldErrors[name]![0]! }] : [];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(undefined);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    data.set("source", source);
    data.set("positionId", positionId);

    const result = await addCandidate(data);
    setPending(false);

    if (!result.ok) {
      setFormError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    toast.success("Candidate added to the pipeline");
    router.push(`/candidates/${result.data.candidateId}`);
    router.refresh();
  }

  if (positions.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          There are no open positions to add a candidate to. A position must be
          approved and open before it can take applicants.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>The candidate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!fieldErrors.fullName}>
              <FieldLabel htmlFor="fullName">Full name</FieldLabel>
              <Input id="fullName" name="fullName" autoComplete="off" />
              <FieldError errors={err("fullName")} />
            </Field>
            <Field data-invalid={!!fieldErrors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="off"
                onBlur={(e) => checkEmail(e.target.value)}
              />
              <FieldError errors={err("email")} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input id="phone" name="phone" />
            </Field>
            <Field>
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <Input id="location" name="location" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="currentTitle">Current title</FieldLabel>
              <Input id="currentTitle" name="currentTitle" />
            </Field>
            <Field>
              <FieldLabel htmlFor="currentCompany">Current company</FieldLabel>
              <Input id="currentCompany" name="currentCompany" />
            </Field>
          </div>

          <Field data-invalid={!!fieldErrors.linkedinUrl}>
            <FieldLabel htmlFor="linkedinUrl">LinkedIn</FieldLabel>
            <Input id="linkedinUrl" name="linkedinUrl" placeholder="https://…" />
            <FieldError errors={err("linkedinUrl")} />
          </Field>
        </CardContent>
      </Card>

      {existing ? (
        <ExistingCandidateNotice
          candidate={existing}
          selectedPositionId={positionId}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>
            They enter at the first stage of the position you choose.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field data-invalid={!!fieldErrors.positionId}>
            <FieldLabel htmlFor="positionId">Position</FieldLabel>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger id="positionId" className="w-full">
                <SelectValue placeholder="Choose a position" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} — {p.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={err("positionId")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="source">How they reached us</FieldLabel>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CANDIDATE_SOURCE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={!!fieldErrors.cv}>
            <FieldLabel htmlFor="cv">CV</FieldLabel>
            <Input
              id="cv"
              name="cv"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
            <FieldDescription>PDF or Word, up to 5 MB.</FieldDescription>
            <FieldError errors={err("cv")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Upload /> {pending ? "Adding…" : "Add candidate"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
