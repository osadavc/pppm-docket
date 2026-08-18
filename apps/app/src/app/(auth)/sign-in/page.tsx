import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getCurrentUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Sign in · Docket" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  // searchParams is a Promise in Next.js 16.
  const { next, error } = await searchParams;
  if (await getCurrentUser()) redirect(typeof next === "string" ? next : "/dashboard");

  return (
    <SignInForm
      next={typeof next === "string" ? next : "/dashboard"}
      initialError={
        error === "deactivated"
          ? "That account has been deactivated. Contact your administrator."
          : undefined
      }
    />
  );
}
