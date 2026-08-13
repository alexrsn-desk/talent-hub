import { LogOut, Briefcase, Inbox, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/agency-portal", label: "Jobs", icon: Briefcase },
  { to: "/agency-portal/activity", label: "Activity", icon: Inbox },
  { to: "/agency-portal/settings", label: "Settings", icon: Settings },
] as const;

/** The Agency Dashboard's own shell — separate from Desky's main sidebar. */
export function PortalAppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="portal-scope min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link to="/agency-portal" className="font-display text-lg font-semibold tracking-tight">
            Agency Portal<span className="text-accent">.</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary hover:text-foreground ${
                  pathname === item.to
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/");
            }}
            className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
