import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Users, Building2, UserCircle, Briefcase, TrendingUp, Sparkles, Settings, BarChart3, PhoneCall, Link2, Award, MessagesSquare, Target, Waves, Rocket, Columns, RefreshCw, MessageCircle, PlayCircle, Inbox } from "lucide-react";
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
import { usePinnedSections, SECTION_META, type CandidateSection } from "@/hooks/use-pinned-sections";

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

const aiItems: Item[] = [
  { title: "Ask Desky", url: "/ask", icon: MessageCircle },
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
  { label: "AI", items: aiItems },
  { label: "Tools", items: toolItems },
];


const PIN_ICON: Record<CandidateSection, any> = {
  all: Users,
  pools: Waves,
  "in-play": PlayCircle,
  buckets: Inbox,
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const placementCount = useActivePlacementCount();
  const liveOverdue = useLiveConversationsOverdueCount();
  const wf = useWorkflowCounts();
  const { data: pinned = [] } = usePinnedSections();

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
      <SidebarContent className="bg-sidebar border-r border-sidebar-border">
        <div className="px-5 pt-6 pb-5">
          {!collapsed && (
            <h2 className="font-display text-[18px] font-semibold tracking-tight text-foreground">
              Desky<span className="text-primary">.</span>
            </h2>
          )}
        </div>
        {SECTIONS.map((section) => (
          <SidebarGroup key={section.label} className="px-2.5">
            {!collapsed && (
              <div className="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                {section.label}
              </div>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const b = getBadge(item.badge);
                  const showBadge = b.count > 0;
                  const isCandidates = item.url === "/candidates";
                  return (
                    <div key={item.title}>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild className="rounded-md h-8">
                          <NavLink
                            to={item.url}
                            end={item.url === "/"}
                            className="group flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                            activeClassName="!bg-sidebar-accent !text-foreground font-medium"
                          >
                            <item.icon className="h-[15px] w-[15px] text-muted-foreground/80 group-hover:text-foreground" />
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
                      {isCandidates && !collapsed && pinned.length > 0 && (
                        <div className="ml-3 border-l border-sidebar-border/60 pl-1 mt-0.5 mb-1">
                          {pinned.map((sec) => {
                            const Icon = PIN_ICON[sec];
                            const meta = SECTION_META[sec];
                            return (
                              <SidebarMenuItem key={sec}>
                                <SidebarMenuButton asChild className="rounded-md h-7">
                                  <NavLink
                                    to={meta.path}
                                    className="group flex items-center gap-2 px-2 py-1 text-[12px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                                    activeClassName="!text-foreground font-medium"
                                  >
                                    <Icon className="h-[13px] w-[13px] opacity-70" />
                                    <span className="truncate">{meta.label}</span>
                                  </NavLink>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
