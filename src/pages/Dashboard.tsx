import { useState } from "react";
import { useJobs, useTodayFollowUps, useCandidateJobs, useCandidates } from "@/hooks/use-data";
import { AlertTriangle, Phone, Mail, Globe, FileText, Smartphone, MessageCircle, MessageSquare, Users } from "lucide-react";
import { DailyFocus } from "@/components/DailyFocus";
import { useAllUnactionedSignals } from "@/hooks/use-signals";
import { SignalSummary } from "@/components/SignalSummary";
import { PriorityCandidatesSection } from "@/components/PriorityFlag";
import { TodoList } from "@/components/TodoList";
import { OfferBackupActions } from "@/components/OfferBackupActions";
import { DashboardHeadline } from "@/components/DashboardHeadline";
import { TeamView } from "@/components/TeamView";
import { useIsManager } from "@/hooks/use-team";
import { NeedsAttentionSection } from "@/components/NeedsAttentionSection";
import { DecayAlertsSection } from "@/components/DecayAlertsSection";
import { QuickNotesSection } from "@/components/QuickNotesSection";
import { GdprAuditPrompt } from "@/components/GdprAuditPrompt";
import { NewRecordsSection } from "@/components/NewRecordsSection";
import { PlacementsDashboardSection } from "@/components/PlacementsDashboardSection";
import { OffersDashboardSection } from "@/components/OffersDashboardSection";
import { ReactivationNudge } from "@/components/ReactivationNudge";
import { WeekStatsBar } from "@/components/WeekStatsBar";

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
  const isManager = useIsManager();
  const [view, setView] = useState<"my" | "team">("my");
  const { data: jobs = [] } = useJobs();
  const { data: todayActions = [] } = useTodayFollowUps();
  const { data: allCandidateJobs = [] } = useCandidateJobs();
  const { data: unactionedSignals = [] } = useAllUnactionedSignals();
  const { data: allCandidates = [] } = useCandidates();

  const openJobsList = jobs.filter(j => j.status === "Open");

  // Per-job pipeline stats
  const jobPipelineStats = openJobsList.map(job => {
    const cjs = allCandidateJobs.filter(cj => cj.job_id === job.id);
    return {
      ...job,
      shortlist: cjs.filter(cj => cj.stage === "Shortlist").length,
      submitted: cjs.filter(cj => cj.stage === "Submitted").length,
      interview: cjs.filter(cj => ["First Interview", "Second Interview", "Client Review"].includes(cj.stage)).length,
      finalStage: cjs.filter(cj => ["Offer", "Placed"].includes(cj.stage)).length,
      total: cjs.length,
    };
  });

  return (
    <div className="space-y-6">
      {/* View toggle (managers only) */}
      {isManager && (
        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
          <button
            onClick={() => setView("my")}
            className={`px-3 py-1 rounded-md transition-colors ${
              view === "my" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Desk
          </button>
          <button
            onClick={() => setView("team")}
            className={`px-3 py-1 rounded-md transition-colors ${
              view === "team" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Team View
          </button>
        </div>
      )}

      {isManager && view === "team" ? (
        <TeamView />
      ) : (
        <>
          {/* 1. HEADLINE BRIEF — first thing every time */}
          <DashboardHeadline />

          {/* This-week stats — a glance at the desk's pulse */}
          <WeekStatsBar />

          {/* Quick capture inboxes — review notes and complete records added on the fly */}
          <QuickNotesSection />
          <NewRecordsSection />

          {/* Active offers — risk, acceptance, resignation, start-date readiness */}
          <OffersDashboardSection />

          {/* Active placements — starts, check-ins, guarantee, invoices */}
          <PlacementsDashboardSection />

          {/* Jobs needing attention based on placement probability */}
          <NeedsAttentionSection />

          {/* Relationship decay alerts — only surfaces when AI finds a genuine reason */}
          <DecayAlertsSection />

          {/* GDPR data audit reminder (every 6 months) */}
          <GdprAuditPrompt />

      {/* 2. AI ACTIONS */}
      <ReactivationNudge />
      <DailyFocus />
      <OfferBackupActions />

      {/* 3. MY LIST — manual tasks */}
      <TodoList />

      {/* 4. EVERYTHING ELSE */}
      <PriorityCandidatesSection candidates={allCandidates} />

      {unactionedSignals.length > 0 && (
        <SignalSummary signals={unactionedSignals} />
      )}


      {/* Open Jobs Pipeline Overview */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Open Jobs ({jobPipelineStats.length})</h2>
        {jobPipelineStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open jobs</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_50px_50px_50px_50px] sm:grid-cols-[1fr_60px_60px_60px_60px] gap-1 sm:gap-2 text-[10px] sm:text-[11px] text-muted-foreground font-medium px-2">
              <span>Job</span>
              <span className="text-center">Short</span>
              <span className="text-center">CV</span>
              <span className="text-center">Int.</span>
              <span className="text-center">Final</span>
            </div>
            {jobPipelineStats.map(j => (
              <div key={j.id} className="grid grid-cols-[1fr_50px_50px_50px_50px] sm:grid-cols-[1fr_60px_60px_60px_60px] gap-1 sm:gap-2 items-center rounded-md border border-border px-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{j.title}</p>
                  {j.clients?.company_name && (
                    <p className="text-xs text-muted-foreground truncate">{j.clients.company_name}</p>
                  )}
                </div>
                <span className="text-center font-medium text-primary">{j.shortlist}</span>
                <span className="text-center font-medium">{j.submitted}</span>
                <span className="text-center font-medium">{j.interview}</span>
                <span className="text-center font-medium">{j.finalStage}</span>
              </div>
            ))}
          </div>
        )}
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
        </>
      )}
    </div>
  );
}
