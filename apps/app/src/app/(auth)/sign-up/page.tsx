import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { getCurrentUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Create account · Docket" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <SignUpForm />;
}
