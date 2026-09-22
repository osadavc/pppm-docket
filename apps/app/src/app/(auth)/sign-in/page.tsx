import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getCurrentUser } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/validation/params";

export const metadata: Metadata = { title: "Sign in · Docket" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  // searchParams is a Promise in Next.js 16.
  const { next: rawNext, error } = await searchParams;
  // Both the redirect below and the form's post-sign-in push use this.
  const next = safeNextPath(rawNext);
  if (await getCurrentUser()) redirect(next);

  return (
    <SignInForm
      next={next}
      initialError={
        error === "deactivated"
          ? "That account has been deactivated. Contact your administrator."
          : undefined
      }
    />
  );
}
