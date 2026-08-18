import { requireRole } from "@/lib/auth/guards";

/**
 * Server-side gate for the whole /admin subtree. Every page beneath this is
 * management-only; the actions beneath it re-check independently.
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  await requireRole("management");
  return <>{children}</>;
}
