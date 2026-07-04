import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Trash2, ArrowLeft, XCircle, Check, GitCompare, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { useJobs, useUpdateJob, useDeleteJob, useCandidateJobs, useUpdateCandidateJob, useCreateNote, type Job } from "@/hooks/use-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NotesSection } from "@/components/NotesSection";
import { JobPipelineBoard } from "@/components/JobPipelineBoard";
import { AddJobDialog } from "@/components/AddJobDialog";
import { ClickToEditField } from "@/components/ClickToEditField";
import { TagsSection } from "@/components/TagsSection";
import { CandidateMatching } from "@/components/CandidateMatching";
import { usePlacementScores, usePlacementScoreFor } from "@/hooks/use-placement-scores";
import { PlacementScoreBadge } from "@/components/PlacementScoreBadge";
import { PlacementScorePanel } from "@/components/PlacementScorePanel";
import { IntakeCallCompanionButton } from "@/components/IntakeCallCompanion";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";

export const JOB_STATUSES = ["Active", "On Hold", "Filled", "Closed"] as const;
const CLOSE_STATUSES = ["Filled", "Closed"] as const;
const JOB_TYPES = ["Perm", "Contract"] as const;
const FEE_TYPES = ["Percentage", "Fixed"] as const;

// Legacy values "Open" and "Cancelled" still display correctly via the color map.
export const statusColor: Record<string, string> = {
  Active: "bg-success/20 text-green-400",
  Open: "bg-success/20 text-green-400",
  "On Hold": "bg-yellow-500/20 text-yellow-400",
  Filled: "bg-primary/20 text-primary",
  Closed: "bg-destructive/20 text-red-400",
  Cancelled: "bg-destructive/20 text-red-400",
};

// Inline status dropdown — used in list rows. Stops propagation so the row doesn't navigate.
function StatusSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const display = value === "Open" ? "Active" : value === "Cancelled" ? "Closed" : value;
  return (
    <div onClick={(e) => e.stopPropagation()} className={className}>
      <Select value={JOB_STATUSES.includes(display as any) ? display : ""} onValueChange={onChange}>
        <SelectTrigger
          className={`h-7 w-auto min-w-[110px] gap-1.5 border-0 px-2 text-xs font-medium ${statusColor[value] || "bg-muted/30"}`}
        >
          <SelectValue placeholder={display || "Set status"} />
        </SelectTrigger>
        <SelectContent>
          {JOB_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const ACTIVE_STATUSES = new Set(["Active", "Open"]);
const HOLD_STATUSES = new Set(["On Hold"]);
const CLOSED_STATUSES = new Set(["Filled", "Closed", "Cancelled"]);

export default function JobsPage() {
  const { data: jobs = [], isLoading } = useJobs();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const { data: allCandidateJobs = [] } = useCandidateJobs();
  const placementScores = usePlacementScores();
  const [search, setSearch] = useState("");
  // Default view = live desk (Active + On Hold). Toggle reveals filled/closed.
  const [showHistory, setShowHistory] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open job from ?jobId= query param
  useEffect(() => {
    const jobId = searchParams.get("jobId");
    if (jobId && !selectedJob) {
      const j = jobs.find((x) => x.id === jobId);
      if (j) {
        setSelectedJob(j);
        searchParams.delete("jobId");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [jobs, searchParams, selectedJob, setSearchParams]);

  const ACTIVE_STAGES = ["Longlist", "Contact", "Screening", "Shortlist", "Submitted", "Client Review", "First Interview", "Second Interview", "Offer"];

  const getInPlayBreakdown = (jobId: string) => {
    const cjs = allCandidateJobs.filter((cj: any) => cj.job_id === jobId && ACTIVE_STAGES.includes(cj.stage));
    const breakdown: Record<string, number> = {};
    ACTIVE_STAGES.forEach(s => {
      const c = cjs.filter((cj: any) => cj.stage === s).length;
      if (c > 0) breakdown[s] = c;
    });
    return { total: cjs.length, breakdown };
  };

  const inPlayColor = (n: number) => n === 0 ? "text-red-400" : n <= 2 ? "text-yellow-400" : "text-green-400";

  // Urgency tier within Active group (lower = more urgent, surfaces first)
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const urgencyTier = (job: Job) => {
    const inPlay = getInPlayBreakdown(job.id).total;
    if (inPlay === 0) return 0; // no candidates — most urgent
    const score = placementScores.get(job.id)?.score;
    if (typeof score === "number" && score < 40) return 1; // at-risk
    const updated = new Date(job.updated_at).getTime();
    if (Date.now() - updated > SEVEN_DAYS) return 2; // stale
    return 3; // healthy
  };

  const bySearch = (j: Job) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return j.title.toLowerCase().includes(q) ||
      ((j.clients as any)?.company_name || "").toLowerCase().includes(q);
  };

  const activeJobs = jobs
    .filter((j) => ACTIVE_STATUSES.has(j.status) && bySearch(j))
    .sort((a, b) => {
      const ta = urgencyTier(a), tb = urgencyTier(b);
      if (ta !== tb) return ta - tb;
      const sa = placementScores.get(a.id)?.score ?? -1;
      const sb = placementScores.get(b.id)?.score ?? -1;
      // Within same tier: lowest score first (highest risk), then most recent
      if (sa !== sb) return sa - sb;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  const holdJobs = jobs
    .filter((j) => HOLD_STATUSES.has(j.status) && bySearch(j))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const closedJobs = jobs
    .filter((j) => CLOSED_STATUSES.has(j.status) && bySearch(j))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return "—";
    const fmt = (n: number) => `£${(n / 1000).toFixed(0)}k`;
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    return min ? fmt(min) : fmt(max!);
  };

  if (selectedJob) {
    return (
      <JobFullView
        job={selectedJob}
        onBack={() => setSelectedJob(null)}
        onUpdate={async (updates) => { await updateJob.mutateAsync({ id: selectedJob.id, ...updates }); setSelectedJob({ ...selectedJob, ...updates }); }}
        onDelete={async () => { await deleteJob.mutateAsync(selectedJob.id); setSelectedJob(null); }}
      />
    );
  }

  const renderRow = (j: Job) => {
    const inPlay = getInPlayBreakdown(j.id);
    const score = placementScores.get(j.id);
    return (
      <tr key={j.id} className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedJob(j)}>
        <td className="px-4 py-3 font-medium">{j.title}</td>
        <td className="px-4 py-3 text-muted-foreground">{(j.clients as any)?.company_name || "—"}</td>
        <td className="px-4 py-3">
          <StatusSelect
            value={j.status}
            onChange={async (v) => {
              await updateJob.mutateAsync({ id: j.id, status: v });
              toast.success(`Status: ${v}`);
            }}
          />
        </td>
        <td className="px-4 py-3">
          {score ? <PlacementScoreBadge score={score} /> : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); setSelectedJob(j); }}>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`font-semibold tabular-nums ${inPlayColor(inPlay.total)} hover:underline cursor-pointer`}>
                  {inPlay.total}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">
                {inPlay.total === 0 ? (
                  <div className="text-xs">No active candidates</div>
                ) : (
                  <div className="text-xs space-y-0.5">
                    {Object.entries(inPlay.breakdown).map(([s, n]) => (
                      <div key={s} className="flex justify-between gap-3"><span>{s}:</span><span className="tabular-nums">{n}</span></div>
                    ))}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{j.date_opened ? new Date(j.date_opened).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
        <td className="px-4 py-3 text-muted-foreground">{formatSalary(j.salary_min, j.salary_max)}</td>
        <td className="px-4 py-3 text-muted-foreground">{j.location || "—"}</td>
      </tr>
    );
  };

  const groupHeader = (label: string, count: number, extra?: React.ReactNode) => (
    <tr className="bg-muted/40">
      <td colSpan={8} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          <span className="text-muted-foreground/70">({count})</span>
          {extra}
        </div>
      </td>
    </tr>
  );

  const totalVisible = activeJobs.length + holdJobs.length + (showHistory ? closedJobs.length : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <AddJobDialog />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search jobs..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground">
          Showing active jobs <span className="tabular-nums">({activeJobs.length})</span>
          {holdJobs.length > 0 && <> · on hold <span className="tabular-nums">({holdJobs.length})</span></>}
        </div>
        <button
          type="button"
          onClick={() => { setShowHistory((v) => !v); if (!showHistory) setHistoryExpanded(false); }}
          className="text-xs text-primary hover:underline"
        >
          {showHistory ? "Hide filled/closed" : "Show all including filled/closed"}
        </button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-[260px]">Placement Score</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">In Play</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date Opened</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Salary</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
              </tr>
            </thead>
            <tbody>
              {totalVisible === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No jobs found</td></tr>
              ) : (
                <>
                  {activeJobs.length > 0 && groupHeader("Active", activeJobs.length)}
                  {activeJobs.map(renderRow)}

                  {holdJobs.length > 0 && groupHeader("On Hold", holdJobs.length)}
                  {holdJobs.map(renderRow)}

                  {showHistory && closedJobs.length > 0 && (
                    <>
                      {groupHeader(
                        "Filled / Closed",
                        closedJobs.length,
                        <button
                          type="button"
                          onClick={() => setHistoryExpanded((v) => !v)}
                          className="ml-2 text-[11px] font-medium text-primary hover:underline normal-case tracking-normal"
                        >
                          {historyExpanded ? "Hide" : `Show ${closedJobs.length} filled/closed role${closedJobs.length === 1 ? "" : "s"}`} {historyExpanded ? "▴" : "▾"}
                        </button>,
                      )}
                      {historyExpanded && closedJobs.map(renderRow)}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


export function JobFullView({ job, onBack, onUpdate, onDelete, backLabel }: {
  job: Job;
  onBack: () => void;
  onUpdate: (u: Partial<Job>) => Promise<void>;
  onDelete: () => Promise<void>;
  backLabel?: string;
}) {
  const placementScore = usePlacementScoreFor(job.id);
  const updateCandidateJob = useUpdateCandidateJob();
  const createNote = useCreateNote();
  const { data: allCandidateJobs = [] } = useCandidateJobs(undefined, job.id);
  const [statusSaved, setStatusSaved] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeStatus, setCloseStatus] = useState<(typeof CLOSE_STATUSES)[number]>("Filled");
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);

  const handleFieldSave = async (field: string, value: string) => {
    const updates: any = {};
    if (field === "salary_min" || field === "salary_max" || field === "fee_value") {
      updates[field] = value ? Number(value) : null;
    } else {
      updates[field] = value || null;
    }
    await onUpdate(updates);
  };

  const handleStatusChange = async (v: string) => {
    await onUpdate({ status: v } as any);
    setStatusSaved(true);
    setTimeout(() => setStatusSaved(false), 1800);
  };

  const ACTIVE_STAGES = ["Longlist", "Contact", "Screening", "Shortlist", "Submitted", "Client Review", "First Interview", "Second Interview", "Offer"];

  const handleConfirmClose = async () => {
    setClosing(true);
    try {
      await onUpdate({ status: closeStatus } as any);
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const activeCjs = allCandidateJobs.filter((cj: any) => ACTIVE_STAGES.includes(cj.stage));
      const noteBody = `Job closed — ${today}${closeReason ? ` · ${closeReason}` : ""} · Last stage: `;
      await Promise.all(
        activeCjs.map((cj: any) =>
          createNote.mutateAsync({
            content: `${noteBody}${cj.stage}`,
            activity_type: "Note",
            candidate_id: cj.candidate_id,
            job_id: job.id,
          }),
        ),
      );
      await logActivity({
        action_type: "job_updated",
        job_id: job.id,
        metadata: { closed: true, status: closeStatus, reason: closeReason || null, candidates_noted: activeCjs.length },
      });
      toast.success(`Job marked ${closeStatus}${activeCjs.length ? ` · ${activeCjs.length} candidate note(s) added` : ""}`);
      setCloseOpen(false);
      setCloseReason("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to close job");
    } finally {
      setClosing(false);
    }
  };

  const displayStatus = job.status === "Open" ? "Active" : job.status === "Cancelled" ? "Closed" : job.status;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          {backLabel ? <span className="text-sm">Back to {backLabel}</span> : null}
        </Button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-semibold">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {(job.clients as any)?.company_name || "No client"} · {job.location || "Remote"} · {job.job_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect value={job.status} onChange={handleStatusChange} />
          {statusSaved && (
            <span className="text-xs text-green-400 flex items-center gap-1 animate-in fade-in">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
        <IntakeCallCompanionButton jobId={job.id} jobTitle={job.title} />
        <Button asChild variant="default" size="sm" className="gap-1">
          <Link to={`/jobs/${job.id}/launch`}>
            <Rocket className="h-4 w-4" /> {(job as any).search_launched_at ? "Re-launch search" : "Launch search"}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link to={`/jobs/${job.id}/compare`}><GitCompare className="h-4 w-4" /> Compare & Submit Candidates</Link>
        </Button>
        {!["Filled", "Closed", "Cancelled"].includes(job.status) && (
          <Button variant="outline" size="sm" onClick={() => setCloseOpen(true)} className="gap-1">
            <XCircle className="h-4 w-4" /> Close Job
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {placementScore && <PlacementScorePanel score={placementScore} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm rounded-lg border border-border p-4">
        <ClickToEditField label="Title" value={job.title} field="title" layout="stacked" onSave={(v) => handleFieldSave("title", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Location" value={job.location || ""} field="location" layout="stacked" onSave={(v) => handleFieldSave("location", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Status" value={displayStatus} field="status" options={JOB_STATUSES} layout="stacked" onSave={(v) => handleFieldSave("status", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Type" value={job.job_type} field="job_type" options={JOB_TYPES} layout="stacked" onSave={(v) => handleFieldSave("job_type", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Salary Min (£)" value={job.salary_min?.toString() || ""} field="salary_min" type="number" layout="stacked" onSave={(v) => handleFieldSave("salary_min", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Salary Max (£)" value={job.salary_max?.toString() || ""} field="salary_max" type="number" layout="stacked" onSave={(v) => handleFieldSave("salary_max", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Fee Type" value={job.fee_type || ""} field="fee_type" options={FEE_TYPES} layout="stacked" onSave={(v) => handleFieldSave("fee_type", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Fee Value" value={job.fee_value?.toString() || ""} field="fee_value" type="number" layout="stacked" onSave={(v) => handleFieldSave("fee_value", v)} entityType="job" entityId={job.id} />
      </div>

      <TagsSection entityType="job" entityId={job.id} />

      <JobDescriptionEditor job={job} onUpdate={onUpdate} />

      <CandidateMatching job={job} autoRun />


      <div>
        <h2 className="text-sm font-medium mb-3">Candidate Pipeline</h2>
        <JobPipelineBoard job={job} onJobUpdate={onUpdate} />
      </div>

      <NotesSection entityType="job" entityId={job.id} />

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close this job?</DialogTitle>
            <DialogDescription>
              Active candidates stay in your database; a note will be added to each recording their last stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={closeStatus} onValueChange={(v) => setCloseStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLOSE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Reason (optional)</label>
              <Textarea
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="e.g. Role placed internally"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)} disabled={closing}>Cancel</Button>
            <Button onClick={handleConfirmClose} disabled={closing}>{closing ? "Closing…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function JobDescriptionEditor({ job, onUpdate }: { job: Job; onUpdate: (u: Partial<Job>) => Promise<void> }) {
  const initial = (job as any).description || "";
  const [value, setValue] = useState<string>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setValue(initial); }, [initial]);

  const dirty = value.trim() !== initial.trim();

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate({ description: value.trim() || null } as any);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      if (value.trim()) toast.success("JD saved — finding matching candidates");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save JD");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Job Description</h2>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400 flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : initial ? "Update JD" : "Save JD"}
          </Button>
        </div>
      </div>
      <Textarea
        rows={6}
        placeholder="Paste the full job description here. Saving will auto-match candidates from your database."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-sm"
      />
    </div>
  );
}
