import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CoachPanelProvider, CoachFloatingButton, CoachPanel } from "@/components/CoachPanel";
import { NotificationBell } from "@/components/NotificationBell";
import { QuickAddButton } from "@/components/QuickAddButton";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DeskyAssistantProvider, DeskyAssistantOverlay, DeskyAssistantTrigger } from "@/components/DeskyAssistant";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DeskyAssistantProvider>
      <CoachPanelProvider>
        <SidebarProvider>
          <div className="min-h-screen flex w-full">
            <AppSidebar />
            <div className="flex-1 flex flex-col">
              <header className="h-14 flex items-center justify-between border-b border-border/70 px-5 gap-3 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
                <SidebarTrigger />
                <div className="flex-1 flex justify-center">
                  <GlobalSearch />
                </div>
                <NotificationBell />
              </header>
              <main className="flex-1 px-4 sm:px-8 lg:px-10 py-6 sm:py-8 overflow-auto">
                <div className="mx-auto w-full max-w-[1240px]">
                  {children}
                </div>
              </main>
            </div>
          </div>
          <QuickAddButton />
          <CoachFloatingButton />
          <CoachPanel />
          <DeskyAssistantTrigger />
          <DeskyAssistantOverlay />
        </SidebarProvider>
      </CoachPanelProvider>
    </DeskyAssistantProvider>
  );
}
