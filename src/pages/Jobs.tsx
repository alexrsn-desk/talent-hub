import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Trash2, ArrowLeft, XCircle, Check } from "lucide-react";
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

export default function JobsPage() {
  const { data: jobs = [], isLoading } = useJobs();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const { data: allCandidateJobs = [] } = useCandidateJobs();
  const placementScores = usePlacementScores();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open job from ?jobId= query param (e.g. from dashboard offer-backup alerts)
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

  const filtered = jobs.filter((j) => {
    const matchesSearch = j.title.toLowerCase().includes(search.toLowerCase()) ||
      ((j.clients as any)?.company_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return "—";
    const fmt = (n: number) => `£${(n / 1000).toFixed(0)}k`;
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    return min ? fmt(min) : fmt(max!);
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <AddJobDialog />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search jobs..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {JOB_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
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
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No jobs found</td></tr>
              ) : filtered.map(j => {
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
              })}
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

      <CandidateMatching job={job} autoRun={job.status === "Active" || job.status === "Open"} />

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
