import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";

export default async function RootPage() {
  redirect((await getCurrentUser()) ? "/dashboard" : "/sign-in");
}
