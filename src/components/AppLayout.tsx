import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CoachPanelProvider, CoachFloatingButton, CoachPanel } from "@/components/CoachPanel";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CoachPanelProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <header className="h-12 flex items-center border-b border-border px-4">
              <SidebarTrigger />
            </header>
            <main className="flex-1 p-6 overflow-auto">
              {children}
            </main>
          </div>
        </div>
        <CoachFloatingButton />
        <CoachPanel />
      </SidebarProvider>
    </CoachPanelProvider>
  );
}
