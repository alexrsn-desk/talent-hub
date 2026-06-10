import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Building2, UserCircle, Briefcase, TrendingUp, Sparkles, Settings, BarChart3, PhoneCall, Link2, Award, MessagesSquare, Target } from "lucide-react";
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

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Biller's Workflow", url: "/billers-workflow", icon: Target },
  { title: "Live Conversations", url: "/live", icon: MessagesSquare, badge: "live" as const },
  { title: "Candidates", url: "/candidates", icon: Users },
  { title: "Clients", url: "/clients", icon: Building2 },
  { title: "Contacts", url: "/contacts", icon: UserCircle },
  { title: "Jobs", url: "/jobs", icon: Briefcase },
  { title: "Placements", url: "/placements", icon: Award, badge: "placements" as const },
  { title: "BD Pipeline", url: "/bd-pipeline", icon: TrendingUp },
  { title: "Calls & Meetings", url: "/calls", icon: PhoneCall },
  { title: "Sequences", url: "/sequences", icon: Link2 },
  { title: "AI Coach", url: "/coach", icon: Sparkles },
  { title: "Weekly Intel", url: "/weekly", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const placementCount = useActivePlacementCount();
  const liveOverdue = useLiveConversationsOverdueCount();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-4 py-5">
          {!collapsed && <h2 className="text-sm font-semibold tracking-wide text-foreground">RecruiterCRM</h2>}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const badgeCount =
                  item.badge === "placements" ? placementCount :
                  item.badge === "live" ? liveOverdue : 0;
                const showBadge = badgeCount > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span className="flex-1">{item.title}</span>}
                        {!collapsed && showBadge && (
                          <span className={`ml-auto text-[10px] rounded-full px-1.5 py-0.5 ${item.badge === "live" ? "bg-red-500/20 text-red-400" : "bg-primary/20 text-primary"}`}>
                            {badgeCount}
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
      </SidebarContent>
    </Sidebar>
  );
}
