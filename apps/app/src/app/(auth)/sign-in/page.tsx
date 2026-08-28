import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { DEACTIVATED_ACCOUNT_ERROR } from "@/lib/auth/errors";
import { getCurrentUser, getSession } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Sign in · Docket" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  // searchParams is a Promise in Next.js 16.
  const { next, error } = await searchParams;
  if (await getCurrentUser())
    redirect(typeof next === "string" ? next : "/dashboard");
  const session = await getSession();

  return (
    <SignInForm
      next={typeof next === "string" ? next : "/dashboard"}
      canSignOut={session?.user.isActive === false}
      initialError={
        error === "deactivated" ? DEACTIVATED_ACCOUNT_ERROR.message : undefined
      }
    />
  );
}
