"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStaffAccount } from "@/lib/actions/users";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { createUserSchema, type CreateUserInput } from "@/lib/validation/user";

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "interviewer",
      jobTitle: "",
      department: "",
    },
  });

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize, which makes it bail out of the whole component.
  const role = useWatch({ control: form.control, name: "role" });

  async function onSubmit(values: CreateUserInput) {
    setFormError(undefined);
    const result = await createStaffAccount(values);

    if (!result.ok) {
      setFormError(result.error);
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) {
          form.setError(field as keyof CreateUserInput, { message: messages[0] });
        }
      }
      return;
    }

    toast.success(`${values.name} can now sign in`);
    form.reset();
    setOpen(false);
    router.refresh();
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      form.reset();
      setFormError(undefined);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> New account
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Create staff account</DialogTitle>
            <DialogDescription>
              The account is active straight away — share the password with them
              directly.
            </DialogDescription>
          </DialogHeader>

          <div className="my-6 space-y-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Field data-invalid={!!form.formState.errors.name}>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input id="name" autoComplete="off" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.email}>
              <FieldLabel htmlFor="email">Work email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                placeholder="name@company.com"
                {...form.register("email")}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.role}>
              <FieldLabel htmlFor="role">Role</FieldLabel>
              <Select
                value={role}
                onValueChange={(v) =>
                  form.setValue("role", v as CreateUserInput["role"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="role" className="w-full">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{ROLE_DESCRIPTIONS[role]}</FieldDescription>
              <FieldError errors={[form.formState.errors.role]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="jobTitle">Job title</FieldLabel>
                <Input
                  id="jobTitle"
                  placeholder="Optional"
                  {...form.register("jobTitle")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="department">Department</FieldLabel>
                <Input
                  id="department"
                  placeholder="Optional"
                  {...form.register("department")}
                />
              </Field>
            </div>

            <Field data-invalid={!!form.formState.errors.password}>
              <FieldLabel htmlFor="password">Temporary password</FieldLabel>
              <Input
                id="password"
                type="text"
                autoComplete="new-password"
                {...form.register("password")}
              />
              <FieldDescription>
                At least 8 characters. Shown in plain text so you can pass it on.
              </FieldDescription>
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
