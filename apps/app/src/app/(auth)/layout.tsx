import Link from "next/link";
import { Briefcase } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background p-6">
      <Link href="/" className="flex items-center gap-2 font-medium">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-sm text-primary-foreground">
          <Briefcase className="size-4" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Docket</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="text-muted-foreground text-center text-xs text-balance">
        Recruitment &amp; hiring tracker
      </p>
    </div>
  );
}
