import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Trash2, ArrowLeft, XCircle, Check, GitCompare, Rocket, Pencil, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useJobs, useUpdateJob, useDeleteJob, useCandidateJobs, useUpdateCandidateJob, useCreateNote, type Job } from "@/hooks/use-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NotesSection } from "@/components/NotesSection";
import { JobPipelineBoard } from "@/components/JobPipelineBoard";
import { AddJobDialog } from "@/components/AddJobDialog";
import { ClickToEditField } from "@/components/ClickToEditField";
import { TagsSection } from "@/components/TagsSection";
import { PortalLaunchSection } from "@/components/PortalLaunchSection";
import { CandidateMatching } from "@/components/CandidateMatching";
import { usePlacementScores, usePlacementScoreFor } from "@/hooks/use-placement-scores";
import { PlacementScoreBadge } from "@/components/PlacementScoreBadge";
import { PlacementScorePanel } from "@/components/PlacementScorePanel";
import { IntakeCallCompanionButton } from "@/components/IntakeCallCompanion";
import { LaunchStatusSection } from "@/components/LaunchStatusSection";
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

// Pipeline stage helpers — counts are always derived live from candidate_jobs.
const LIVE_STAGES = ["Shortlist", "Sent CV", "First Stage", "Second Stage", "Final Stage", "Offer"];
const SENT_OR_PAST = ["Sent CV", "First Stage", "Second Stage", "Final Stage", "Offer", "Placed"];

type SortKey = "client" | "role" | "cvsSent" | "live" | "first" | "second" | "final" | "fee";

// Inline editable Expected Fee cell.
function FeeCell({ value, onSave }: { value: number | null; onSave: (v: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");

  useEffect(() => { setDraft(value?.toString() ?? ""); }, [value]);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim() === "" ? null : Number(draft);
    if (next === value || (next !== null && Number.isNaN(next))) return;
    await onSave(next);
  };

  if (editing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value?.toString() ?? ""); setEditing(false); }
          }}
          className="h-7 w-28 text-right text-sm tabular-nums"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 tabular-nums hover:bg-muted/50"
    >
      <span className={value == null ? "text-muted-foreground" : "font-medium"}>
        {value == null ? "—" : `£${value.toLocaleString("en-GB")}`}
      </span>
      <Pencil className="h-3 w-3 opacity-0 text-muted-foreground transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export default function JobsPage() {
  const { data: jobs = [], isLoading } = useJobs();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const { data: allCandidateJobs = [] } = useCandidateJobs();
  const [search, setSearch] = useState("");
  // Default view = live desk. Toggle reveals filled/closed.
  const [showClosed, setShowClosed] = useState(false);
  const [onlyZeroLive, setOnlyZeroLive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("live");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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

  // Live counts per job, derived from the pipeline.
  const countsByJob = useMemo(() => {
    const map = new Map<string, { cvsSent: number; live: number; first: number; second: number; final: number }>();
    for (const cj of allCandidateJobs as any[]) {
      if (!cj.job_id) continue;
      if (cj.withdrawn) continue;
      const c = map.get(cj.job_id) ?? { cvsSent: 0, live: 0, first: 0, second: 0, final: 0 };
      if (SENT_OR_PAST.includes(cj.stage)) c.cvsSent++;
      if (LIVE_STAGES.includes(cj.stage)) c.live++;
      if (cj.stage === "First Stage") c.first++;
      if (cj.stage === "Second Stage") c.second++;
      if (cj.stage === "Final Stage") c.final++;
      map.set(cj.job_id, c);
    }
    return map;
  }, [allCandidateJobs]);

  const emptyCounts = { cvsSent: 0, live: 0, first: 0, second: 0, final: 0 };
  const countsFor = (jobId: string) => countsByJob.get(jobId) ?? emptyCounts;

  // Expected fee: explicit fixed fee, or percentage of top-of-range salary.
  const expectedFee = (j: Job) => {
    if (j.fee_value == null) return null;
    if (j.fee_type === "Percentage") {
      const salary = j.salary_max ?? j.salary_min;
      if (!salary) return null;
      return Math.round((salary * j.fee_value) / 100);
    }
    return j.fee_value;
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = jobs.filter((j) => {
      if (!showClosed && CLOSED_STATUSES.has(j.status)) return false;
      if (q) {
        const client = ((j.clients as any)?.company_name || "").toLowerCase();
        if (!j.title.toLowerCase().includes(q) && !client.includes(q)) return false;
      }
      if (onlyZeroLive && countsFor(j.id).live > 0) return false;
      return true;
    });

    const val = (j: Job): string | number => {
      const c = countsFor(j.id);
      switch (sortKey) {
        case "client": return ((j.clients as any)?.company_name || "").toLowerCase();
        case "role": return j.title.toLowerCase();
        case "cvsSent": return c.cvsSent;
        case "live": return c.live;
        case "first": return c.first;
        case "second": return c.second;
        case "final": return c.final;
        case "fee": return expectedFee(j) ?? -1;
      }
    };

    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      let cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      if (cmp === 0) cmp = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [jobs, search, showClosed, onlyZeroLive, sortKey, sortDir, countsByJob]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "client" || key === "role" ? "asc" : "desc"); }
  };

  const totalFee = rows.reduce((sum, j) => sum + (expectedFee(j) ?? 0), 0);

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

  const SortHeader = ({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) => (
    <th className={`px-4 py-3 font-medium text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === k ? "text-foreground" : ""}`}
      >
        <span>{label}</span>
        {sortKey === k
          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );

  const numCell = (n: number, emphasise = false) => (
    <td className="px-4 py-3 text-right tabular-nums">
      <span className={n === 0 ? "text-muted-foreground/50" : emphasise ? "font-semibold" : ""}>{n}</span>
    </td>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <AddJobDialog />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search jobs or clients..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          type="button"
          onClick={() => setOnlyZeroLive((v) => !v)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            onlyZeroLive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Zero live CVs
        </button>
        <button
          type="button"
          onClick={() => setShowClosed((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {showClosed ? "Hide filled/closed" : "Show all including filled/closed"}
        </button>
        <div className="ml-auto text-xs text-muted-foreground">
          <span className="tabular-nums">{rows.length}</span> job{rows.length === 1 ? "" : "s"}
          {totalFee > 0 && <> · expected fee <span className="tabular-nums font-medium text-foreground">£{totalFee.toLocaleString("en-GB")}</span></>}
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortHeader label="Client" k="client" />
                <SortHeader label="Role" k="role" />
                <SortHeader label="CVs Sent" k="cvsSent" align="right" />
                <SortHeader label="Live CVs" k="live" align="right" />
                <SortHeader label="First Interview" k="first" align="right" />
                <SortHeader label="Second Interview" k="second" align="right" />
                <SortHeader label="Final" k="final" align="right" />
                <SortHeader label="Expected Fee" k="fee" align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No jobs found</td></tr>
              ) : (
                rows.map((j) => {
                  const c = countsFor(j.id);
                  return (
                    <tr
                      key={j.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setSelectedJob(j)}
                    >
                      <td className="px-4 py-3 font-medium">{(j.clients as any)?.company_name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-foreground">{j.title}</span>
                        {j.location && <span className="ml-2 text-xs text-muted-foreground">{j.location}</span>}
                      </td>
                      {numCell(c.cvsSent)}
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={c.live === 0 ? "text-destructive font-medium" : "font-semibold"}>{c.live}</span>
                      </td>
                      {numCell(c.first)}
                      {numCell(c.second)}
                      {numCell(c.final)}
                      <td className="px-4 py-3 text-right">
                        <FeeCell
                          value={expectedFee(j)}
                          onSave={async (v) => {
                            await updateJob.mutateAsync({ id: j.id, fee_value: v, fee_type: "Fixed" } as any);
                            toast.success("Expected fee updated");
                          }}
                        />
                      </td>
                    </tr>
                  );
                })
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

  const ACTIVE_STAGES = ["Shortlist", "Sent CV", "First Stage", "Second Stage", "Final Stage", "Offer"];

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

      <LaunchStatusSection jobId={job.id} />

      <PortalLaunchSection
        jobId={job.id}
        portalJobId={(job as any).portal_job_id ?? null}
        title={job.title}
        clientName={(job as any).clients?.name ?? null}
        onLinked={(portalJobId) => onUpdate({ portal_job_id: portalJobId } as any)}
      />







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
