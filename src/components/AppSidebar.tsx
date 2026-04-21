import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Building2, UserCircle, Briefcase, TrendingUp, Sparkles, Settings, BarChart3, PhoneCall, Link2 } from "lucide-react";
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

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Candidates", url: "/candidates", icon: Users },
  { title: "Clients", url: "/clients", icon: Building2 },
  { title: "Contacts", url: "/contacts", icon: UserCircle },
  { title: "Jobs", url: "/jobs", icon: Briefcase },
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

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-4 py-5">
          {!collapsed && <h2 className="text-sm font-semibold tracking-wide text-foreground">RecruiterCRM</h2>}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
