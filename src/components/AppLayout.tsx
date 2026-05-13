import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CoachPanelProvider, CoachFloatingButton, CoachPanel } from "@/components/CoachPanel";
import { NotificationBell } from "@/components/NotificationBell";
import { QuickAddButton } from "@/components/QuickAddButton";
import { GlobalSearch } from "@/components/GlobalSearch";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CoachPanelProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <header className="h-12 flex items-center justify-between border-b border-border px-4 gap-3">
              <SidebarTrigger />
              <div className="flex-1 flex justify-center">
                <GlobalSearch />
              </div>
              <NotificationBell />
            </header>
            <main className="flex-1 p-3 sm:p-6 overflow-auto">
              {children}
            </main>
          </div>
        </div>
        <QuickAddButton />
        <CoachFloatingButton />
        <CoachPanel />
      </SidebarProvider>
    </CoachPanelProvider>
  );
}
