import { useCandidates, useClients, useJobs, useTodayFollowUps, useOverdueFollowUps, useTodayInterviews, useCandidateJobs } from "@/hooks/use-data";
import { Users, Building2, Briefcase, TrendingUp, AlertTriangle, Phone, Mail, Globe, MessageSquare, FileText, Smartphone, MessageCircle, Sun, Clock, CalendarCheck, Star } from "lucide-react";

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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const { data: candidates = [] } = useCandidates();
  const { data: clients = [] } = useClients();
  const { data: jobs = [] } = useJobs();
  const { data: todayActions = [] } = useTodayFollowUps();
  const { data: overdueActions = [] } = useOverdueFollowUps();
  const { data: interviewCandidates = [] } = useTodayInterviews();
  const { data: allCandidateJobs = [] } = useCandidateJobs();

  const openJobsList = jobs.filter(j => j.status === "Open");

  // Today's Brief data
  const callsDue = todayActions.filter(a => a.activity_type === "Call").length;
  const offerStage = allCandidateJobs.filter(cj => cj.stage === "Offer" || cj.stage === "Awaiting Feedback");
  const interviewsToday = interviewCandidates.length;

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
      {/* Today's Brief */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-3 mb-3">
          <Sun className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">{getGreeting()}</h1>
            <p className="text-xs text-muted-foreground">{formatDate()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <div>
              <p className="text-lg font-semibold">{todayActions.length}</p>
              <p className="text-[11px] text-muted-foreground">Due today</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2">
            <Clock className="h-4 w-4 text-destructive" />
            <div>
              <p className="text-lg font-semibold">{overdueActions.length}</p>
              <p className="text-[11px] text-muted-foreground">Overdue</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2">
            <Star className="h-4 w-4 text-yellow-400" />
            <div>
              <p className="text-lg font-semibold">{offerStage.length}</p>
              <p className="text-[11px] text-muted-foreground">At offer / feedback</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2">
            <Users className="h-4 w-4 text-green-400" />
            <div>
              <p className="text-lg font-semibold">{interviewsToday}</p>
              <p className="text-[11px] text-muted-foreground">Interviews</p>
            </div>
          </div>
        </div>

        {/* Offer / feedback candidates */}
        {offerStage.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">At offer / awaiting feedback:</p>
            <div className="flex flex-wrap gap-2">
              {offerStage.map(cj => (
                <span key={cj.id} className="text-xs bg-card border border-border rounded px-2 py-1">
                  {cj.candidates?.name} — {cj.stage} {cj.jobs?.title ? `(${cj.jobs.title})` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          You have <span className="font-medium text-foreground">{callsDue} call{callsDue !== 1 ? "s" : ""}</span> to make,{" "}
          <span className="font-medium text-foreground">{overdueActions.length} follow-up{overdueActions.length !== 1 ? "s" : ""}</span> overdue, and{" "}
          <span className="font-medium text-foreground">{interviewsToday} interview{interviewsToday !== 1 ? "s" : ""}</span> today.
        </p>
      </div>

      {/* Open Jobs Pipeline Overview */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Open Jobs ({jobPipelineStats.length})</h2>
        {jobPipelineStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open jobs</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 text-[11px] text-muted-foreground font-medium px-2">
              <span>Job</span>
              <span className="text-center">Shortlist</span>
              <span className="text-center">CV Sent</span>
              <span className="text-center">Interview</span>
              <span className="text-center">Final</span>
            </div>
            {jobPipelineStats.map(j => (
              <div key={j.id} className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 items-center rounded-md border border-border px-2 py-2 text-sm">
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
    </div>
  );
}
