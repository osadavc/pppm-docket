import Link from "next/link";
import { Briefcase } from "lucide-react";
import { COMPANY_NAME } from "@/lib/company";

const FOOTER_COPY =
  process.env.NEXT_PUBLIC_CAREERS_FOOTER?.trim() ||
  "Open roles are published once approved internally.";

/**
 * Public, unauthenticated shell. Deliberately outside the (app) group so it
 * never inherits the staff sidebar or the session guard.
 */
export default function CareersLayout({ children }: LayoutProps<"/careers">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-2 px-6">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <Briefcase className="size-4" />
          </span>
          <Link href="/careers" className="font-semibold tracking-tight">
            {COMPANY_NAME} Careers
          </Link>
          <Link
            href="/sign-in"
            className="text-muted-foreground ml-auto text-sm hover:underline"
          >
            Staff sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>
      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        {FOOTER_COPY}
      </footer>
    </div>
  );
}
