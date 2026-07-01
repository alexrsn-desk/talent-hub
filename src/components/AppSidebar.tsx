import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Users, Building2, UserCircle, Briefcase, TrendingUp, Sparkles, Settings, BarChart3, PhoneCall, Link2, Award, MessagesSquare, Target, Waves, Rocket, Columns, RefreshCw } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useActivePlacementCount } from "@/hooks/use-placements";
import { useLiveConversationsOverdueCount } from "@/hooks/use-live-conversations";
import { useWorkflowCounts } from "@/hooks/use-workflow-counts";

type BadgeKey = "live" | "placements" | "wf-launch" | "wf-compare" | "wf-reactivation";
type Item = { title: string; url: string; icon: any; badge?: BadgeKey };

const workspaceItems: Item[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Biller's Workflow", url: "/billers-workflow", icon: Target },
  { title: "Live Conversations", url: "/live", icon: MessagesSquare, badge: "live" },
  { title: "AI Coach", url: "/coach", icon: Sparkles },
  { title: "Weekly Intel", url: "/weekly", icon: BarChart3 },
];

const workflowItems: Item[] = [
  { title: "Job Launch", url: "/jobs/launch", icon: Rocket, badge: "wf-launch" },
  { title: "Compare & Submit", url: "/compare", icon: Columns, badge: "wf-compare" },
  { title: "Reactivation Campaign", url: "/reactivation", icon: RefreshCw, badge: "wf-reactivation" },
  { title: "Who Do I Pitch", url: "/pitch", icon: Target },
];

const dataItems: Item[] = [
  { title: "Candidates", url: "/candidates", icon: Users },
  { title: "Clients", url: "/clients", icon: Building2 },
  { title: "Contacts", url: "/contacts", icon: UserCircle },
  { title: "Jobs", url: "/jobs", icon: Briefcase },
  { title: "Placements", url: "/placements", icon: Award, badge: "placements" },
];

const toolItems: Item[] = [
  { title: "BD Pipeline", url: "/bd-pipeline", icon: TrendingUp },
  { title: "Calls & Meetings", url: "/calls", icon: PhoneCall },
  { title: "Sequences", url: "/sequences", icon: Link2 },
  { title: "SourceWhale", url: "/sourcewhale", icon: Waves },
  { title: "Settings", url: "/settings", icon: Settings },
];

const SECTIONS: { label: string; items: Item[] }[] = [
  { label: "My Desk", items: workspaceItems },
  { label: "Workflows", items: workflowItems },
  { label: "Data", items: dataItems },
  { label: "Tools", items: toolItems },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const placementCount = useActivePlacementCount();
  const liveOverdue = useLiveConversationsOverdueCount();
  const wf = useWorkflowCounts();

  const getBadge = (key?: BadgeKey) => {
    switch (key) {
      case "live": return { count: liveOverdue, color: "bg-[#EF4444]" };
      case "placements": return { count: placementCount, color: "bg-primary" };
      case "wf-launch": return { count: wf.jobLaunch, color: "bg-amber-500" };
      case "wf-compare": return { count: wf.compare, color: "bg-primary" };
      case "wf-reactivation": return { count: wf.reactivation, color: "bg-amber-500" };
      default: return { count: 0, color: "" };
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-sidebar">
        <div className="px-4 pt-6 pb-4">
          {!collapsed && (
            <h2 className="text-[16px] font-bold tracking-tight text-primary">Desky</h2>
          )}
        </div>
        {SECTIONS.map((section) => (
          <SidebarGroup key={section.label} className="px-2">
            {!collapsed && (
              <div className="px-2 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#4B5563]">
                {section.label}
              </div>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const b = getBadge(item.badge);
                  const showBadge = b.count > 0;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild className="rounded-md">
                        <NavLink
                          to={item.url}
                          end={item.url === "/"}
                          className="group flex items-center gap-2 px-3 py-2 text-[13px] text-[#9CA3AF] hover:bg-white/5 hover:text-[#F9FAFB]"
                          activeClassName="!bg-primary/10 !text-[#F9FAFB] font-medium [&_svg]:!text-primary"
                        >
                          <item.icon className="h-4 w-4 text-[#6B7280] group-hover:text-[#F9FAFB]" />
                          {!collapsed && <span className="flex-1">{item.title}</span>}
                          {!collapsed && showBadge && (
                            <span
                              className={`ml-auto inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white ${b.color}`}
                            >
                              {b.count}
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
