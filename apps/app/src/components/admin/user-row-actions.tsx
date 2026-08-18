"use client";

import { KeyRound, MoreHorizontal, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeUserRole, setUserPassword } from "@/lib/actions/users";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type UserRole } from "@/lib/auth/roles";
import type { StaffAccount } from "@/lib/queries/users";

type DialogKind = "role" | "password" | null;

export function UserRowActions({
  user,
  isSelf,
}: {
  user: StaffAccount;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [role, setRole] = useState<UserRole>(user.role);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  function close() {
    setDialog(null);
    setError(undefined);
    setPassword("");
    setRole(user.role);
  }

  async function submitRole() {
    setPending(true);
    setError(undefined);
    const result = await changeUserRole({ userId: user.id, role });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`${user.name} is now ${ROLE_LABELS[role]}`);
    close();
    router.refresh();
  }

  async function submitPassword() {
    setPending(true);
    setError(undefined);
    const result = await setUserPassword({ userId: user.id, password });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Password reset for ${user.name}`);
    close();
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${user.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isSelf}
            onSelect={() => {
              setRole(user.role);
              setDialog("role");
            }}
          >
            <ShieldCheck /> Change role
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("password")}>
            <KeyRound /> Reset password
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "role"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {user.name} ({user.email}). The change applies on their next
              request — they stay signed in.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor={`role-${user.id}`}>Role</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger id={`role-${user.id}`} className="w-full">
                  <SelectValue />
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
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitRole}
              disabled={pending || role === user.role}
            >
              {pending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "password"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {user.name}. This signs them out of every
              device.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor={`pw-${user.id}`}>New password</FieldLabel>
              <Input
                id={`pw-${user.id}`}
                type="text"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldDescription>
                At least 8 characters. Shown in plain text so you can pass it on.
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitPassword}
              disabled={pending || password.length < 8}
            >
              {pending ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
