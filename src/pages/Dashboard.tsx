import { useCandidates, useClients, useJobs, useCandidateJobs } from "@/hooks/use-data";
import { Users, Building2, Briefcase, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const { data: candidates = [] } = useCandidates();
  const { data: clients = [] } = useClients();
  const { data: jobs = [] } = useJobs();

  const openJobs = jobs.filter(j => j.status === "Open").length;
  const activeClients = clients.filter(c => c.status === "Active").length;
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
