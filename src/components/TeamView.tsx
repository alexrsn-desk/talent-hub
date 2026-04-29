import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/use-team";
import { ChevronDown, ChevronRight, AlertTriangle, Briefcase, Users, CheckSquare, Loader2, Target } from "lucide-react";
import { usePlacementScores } from "@/hooks/use-placement-scores";
import { useJobs } from "@/hooks/use-data";

type MemberStats = {
  member_user_id: string;
  name: string;
  openJobs: number;
  candidates: number;
  offerNoBackup: number;
  overdueTodos: number;
  recentActivity: number;
  urgencyScore: number;
  atRiskJobs: number;
  weakestJob?: { title: string; client: string; score: number; action: string };
};

function useTeamStats(memberIds: string[]) {
  return useQuery({
    queryKey: ["team-stats", memberIds.sort().join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      // Fan out queries in parallel — RLS lets the manager see this
      const [jobsRes, cjRes, todosRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, status, owner_user_id")
          .in("owner_user_id", memberIds),
        supabase
          .from("candidate_jobs")
          .select("id, stage, job_id, owner_user_id")
          .in("owner_user_id", memberIds),
        supabase
          .from("todo_tasks" as any)
          .select("id, completed, due_date, owner_user_id")
          .in("owner_user_id", memberIds),
      ]);

      if (jobsRes.error) throw jobsRes.error;
      if (cjRes.error) throw cjRes.error;
      if (todosRes.error) throw todosRes.error;

      const jobs = jobsRes.data || [];
      const cjs = cjRes.data || [];
      const todos = (todosRes.data as any[]) || [];

      const today = new Date().toISOString().slice(0, 10);

      return memberIds.map((uid) => {
        const memberJobs = jobs.filter((j) => j.owner_user_id === uid && j.status === "Open");
        const memberCjs = cjs.filter((cj) => cj.owner_user_id === uid);
        const memberTodos = todos.filter((t) => t.owner_user_id === uid);

        // Offer-with-no-backup: any job with a candidate at Offer but no backup at Shortlist/Screening/Longlist
        let offerNoBackup = 0;
        const jobIds = Array.from(new Set(memberCjs.map((cj) => cj.job_id)));
        for (const jid of jobIds) {
          const inJob = memberCjs.filter((cj) => cj.job_id === jid);
          const hasOffer = inJob.some((cj) => cj.stage === "Offer");
          if (!hasOffer) continue;
          const backups = inJob.filter((cj) =>
            ["Shortlist", "Screening", "Longlist", "Submitted"].includes(cj.stage),
          ).length;
          if (backups === 0) offerNoBackup += 1;
        }

        const overdueTodos = memberTodos.filter(
          (t) => !t.completed && t.due_date && t.due_date < today,
        ).length;

        return {
          member_user_id: uid,
          name: "",
          openJobs: memberJobs.length,
          candidates: new Set(memberCjs.map((cj) => (cj as any).candidate_id)).size,
          offerNoBackup,
          overdueTodos,
          recentActivity: 0,
          urgencyScore: offerNoBackup * 3 + overdueTodos,
          atRiskJobs: 0,
        } as MemberStats;
      });
    },
  });
}

export function TeamView() {
  const { user } = useAuth();
  const { data: members = [], isLoading } = useTeamMembers();
  const activeMembers = useMemo(
    () => members.filter((m) => m.active && m.member_user_id),
    [members],
  );
  const memberIds = activeMembers.map((m) => m.member_user_id!) as string[];
  const { data: rawStats = [], isLoading: loadingStats } = useTeamStats(memberIds);

  const { data: allJobs = [] } = useJobs();
  const placementScores = usePlacementScores();

  const stats: MemberStats[] = useMemo(() => {
    return rawStats
      .map((s) => {
        const m = activeMembers.find((x) => x.member_user_id === s.member_user_id);
        // Per-member placement-score breakdown
        const memberOpenJobs = allJobs.filter(
          (j) => (j as any).owner_user_id === s.member_user_id && j.status === "Open",
        );
        const scored = memberOpenJobs
          .map((j) => ({ job: j, score: placementScores.get(j.id) }))
          .filter((x) => x.score);
        const atRiskJobs = scored.filter((x) => x.score!.score < 40).length;
        const weakest = scored.sort((a, b) => a.score!.score - b.score!.score)[0];
        return {
          ...s,
          name: m?.name || "Team member",
          atRiskJobs,
          weakestJob: weakest
            ? {
                title: weakest.job.title,
                client: (weakest.job as any).clients?.company_name || "—",
                score: weakest.score!.score,
                action: weakest.score!.topAction,
              }
            : undefined,
        };
      })
      .sort((a, b) => b.urgencyScore + b.atRiskJobs - (a.urgencyScore + a.atRiskJobs));
  }, [rawStats, activeMembers, allJobs, placementScores]);

  const totalUrgent = stats.reduce(
    (sum, s) => sum + s.offerNoBackup + s.overdueTodos + s.atRiskJobs,
    0,
  );
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const managerName =
    (user?.user_metadata as any)?.full_name?.split(" ")?.[0] || user?.email?.split("@")?.[0] || "there";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (activeMembers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center space-y-2">
        <Users className="h-6 w-6 text-muted-foreground mx-auto" />
        <h3 className="text-sm font-medium">No team members yet</h3>
        <p className="text-xs text-muted-foreground">
          Generate an invite code in Settings → Team to bring consultants into your manager view.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <h1 className="text-lg font-semibold">
          {greeting} {managerName}.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your team has{" "}
          <span className={totalUrgent > 0 ? "text-destructive font-medium" : "text-foreground"}>
            {totalUrgent}
          </span>{" "}
          urgent item{totalUrgent === 1 ? "" : "s"} today.
        </p>
      </div>

      {/* Cards */}
      {loadingStats ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {stats.map((s) => (
            <ConsultantCard key={s.member_user_id} stats={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConsultantCard({ stats }: { stats: MemberStats }) {
  const [open, setOpen] = useState(false);
  const isUrgent = stats.offerNoBackup > 0 || stats.overdueTodos > 0;

  return (
    <div
      className={`rounded-lg border bg-card transition-colors ${
        isUrgent ? "border-destructive/30" : "border-border"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 rounded-lg"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <div className="font-medium text-sm">{stats.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> {stats.openJobs}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {stats.candidates}
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckSquare className="h-3 w-3" /> {stats.overdueTodos} overdue
              </span>
            </div>
          </div>
        </div>
        {stats.offerNoBackup > 0 && (
          <div className="flex items-center gap-1 text-destructive text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {stats.offerNoBackup} offer{stats.offerNoBackup === 1 ? "" : "s"} without backup
          </div>
        )}
      </button>

      {open && (
        <div className="border-t border-border p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Open jobs" value={stats.openJobs} />
          <Stat label="Active candidates" value={stats.candidates} />
          <Stat
            label="Offer no backup"
            value={stats.offerNoBackup}
            tone={stats.offerNoBackup > 0 ? "destructive" : "default"}
          />
          <Stat
            label="Overdue todos"
            value={stats.overdueTodos}
            tone={stats.overdueTodos > 0 ? "warn" : "default"}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "destructive";
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warn"
      ? "text-yellow-400"
      : "text-foreground";
  return (
    <div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
