import { useCandidates, useClients, useJobs, useTodayFollowUps } from "@/hooks/use-data";
import { Users, Building2, Briefcase, TrendingUp, AlertTriangle, Phone, Mail, Globe, MessageSquare, FileText, Smartphone, MessageCircle } from "lucide-react";

const activityIcon: Record<string, typeof FileText> = {
  Note: FileText,
  Call: Phone,
  Email: Mail,
  "Text Message": Smartphone,
  WhatsApp: MessageCircle,
  Meeting: Users,
  "LinkedIn Message": Globe,
  "Follow-up": MessageSquare,
};

const activityColor: Record<string, string> = {
  Call: "text-green-400",
  Email: "text-blue-400",
  "Text Message": "text-violet-400",
  WhatsApp: "text-emerald-400",
  Meeting: "text-yellow-400",
  "LinkedIn Message": "text-sky-400",
  "Follow-up": "text-orange-400",
};

export default function DashboardPage() {
  const { data: candidates = [] } = useCandidates();
  const { data: clients = [] } = useClients();
  const { data: jobs = [] } = useJobs();
  const { data: todayActions = [] } = useTodayFollowUps();

  const openJobs = jobs.filter(j => j.status === "Open").length;
  const activeClients = clients.filter(c => c.status === "Active Client").length;
  const placedCandidates = candidates.filter(c => c.status === "Placed").length;

  const stats = [
    { label: "Total Candidates", value: candidates.length, icon: Users, accent: "text-primary" },
    { label: "Active Clients", value: activeClients, icon: Building2, accent: "text-green-400" },
    { label: "Open Jobs", value: openJobs, icon: Briefcase, accent: "text-yellow-400" },
    { label: "Placed", value: placedCandidates, icon: TrendingUp, accent: "text-purple-400" },
  ];

  const recentCandidates = candidates.slice(0, 5);
  const recentJobs = jobs.slice(0, 5);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.accent}`} />
            </div>
            <p className="text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Today's Actions */}
      {todayActions.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-medium">Today's Follow-ups ({todayActions.length})</h2>
          </div>
          <div className="space-y-2">
            {todayActions.map(action => {
              const Icon = activityIcon[action.activity_type] || FileText;
              const color = activityColor[action.activity_type] || "text-muted-foreground";
              const name = action.candidates?.name || action.clients?.company_name || "Unknown";
              const entityLabel = action.candidate_id ? "Candidate" : "Client";
              return (
                <div key={action.id} className="flex items-start gap-3 rounded-md bg-card px-3 py-2 border border-border">
                  <div className={`mt-0.5 ${color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground">· {entityLabel}</span>
                      <span className={`${color} font-medium`}>{action.activity_type}</span>
                      {action.outcome && <span className="bg-muted px-1.5 py-0.5 rounded">{action.outcome}</span>}
                    </div>
                    <p className="text-sm mt-0.5 text-muted-foreground line-clamp-1">{action.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent Candidates</h2>
          <div className="space-y-2">
            {recentCandidates.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1">
                <span>{c.name}</span>
                <span className="text-muted-foreground">{c.status}</span>
              </div>
            ))}
            {recentCandidates.length === 0 && <p className="text-sm text-muted-foreground">No candidates yet</p>}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent Jobs</h2>
          <div className="space-y-2">
            {recentJobs.map(j => (
              <div key={j.id} className="flex items-center justify-between text-sm py-1">
                <span>{j.title}</span>
                <span className="text-muted-foreground">{j.status}</span>
              </div>
            ))}
            {recentJobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
