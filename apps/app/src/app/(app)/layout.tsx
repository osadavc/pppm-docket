import { RoleBadge } from "@/components/layout/role-badge";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { QuickAddMenu } from "@/components/layout/quick-add-menu";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth/guards";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Real enforcement: proxy.ts only checks for a cookie, this checks the session.
  const user = await requireUser();

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-md md:px-6">
          <SidebarTrigger className="-ml-1.5 text-muted-foreground" />
          <Separator orientation="vertical" className="mr-1 !h-4" />
          <span className="text-muted-foreground text-sm">Docket</span>
          <div className="ml-auto flex items-center gap-2">
            <QuickAddMenu role={user.role} />
            <RoleBadge role={user.role} />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
