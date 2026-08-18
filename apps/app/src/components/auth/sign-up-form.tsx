"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      jobTitle: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: SignUpInput) {
    setFormError(undefined);
    // `role` is declared with input:false on the server, so it can never be set
    // here — every self-signup lands as an interviewer.
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      jobTitle: values.jobTitle || undefined,
    });

    if (error) {
      setFormError(error.message ?? "Could not create the account.");
      return;
    }

    toast.success("Account created");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          New accounts start as an interviewer. Ask management for wider access.
        </CardDescription>
      </CardHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <Input id="name" autoComplete="name" {...form.register("name")} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.email}>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              {...form.register("email")}
            />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="jobTitle">Job title</FieldLabel>
            <Input id="jobTitle" placeholder="Optional" {...form.register("jobTitle")} />
            <FieldDescription>Shown next to your interview feedback.</FieldDescription>
          </Field>

          <Field data-invalid={!!form.formState.errors.password}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            <FieldError errors={[form.formState.errors.password]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </Field>
        </CardContent>

        <CardFooter className="mt-6 flex-col gap-3">
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-muted-foreground text-sm">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
