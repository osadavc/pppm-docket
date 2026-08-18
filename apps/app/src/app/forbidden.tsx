import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldX className="text-muted-foreground size-10" />
      <div>
        <h1 className="text-xl font-semibold">Not allowed</h1>
        <p className="text-muted-foreground text-sm">
          Your role does not have access to this page.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
