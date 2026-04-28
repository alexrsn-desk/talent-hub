import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Trash2, ArrowLeft } from "lucide-react";
import { useJobs, useUpdateJob, useDeleteJob, useCandidateJobs, type Job } from "@/hooks/use-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NotesSection } from "@/components/NotesSection";
import { JobPipelineBoard } from "@/components/JobPipelineBoard";
import { AddJobDialog } from "@/components/AddJobDialog";
import { ClickToEditField } from "@/components/ClickToEditField";
import { TagsSection } from "@/components/TagsSection";
import { CandidateMatching } from "@/components/CandidateMatching";

const JOB_STATUSES = ["Open", "On Hold", "Filled", "Cancelled"] as const;
const JOB_TYPES = ["Perm", "Contract"] as const;
const FEE_TYPES = ["Percentage", "Fixed"] as const;

const statusColor: Record<string, string> = {
  Open: "bg-success/20 text-green-400",
  "On Hold": "bg-yellow-500/20 text-yellow-400",
  Filled: "bg-primary/20 text-primary",
  Cancelled: "bg-destructive/20 text-red-400",
};

export default function JobsPage() {
  const { data: jobs = [], isLoading } = useJobs();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const { data: allCandidateJobs = [] } = useCandidateJobs();
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">In Play</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date Opened</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Salary</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No jobs found</td></tr>
              ) : filtered.map(j => {
                const inPlay = getInPlayBreakdown(j.id);
                return (
                <tr key={j.id} className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedJob(j)}>
                  <td className="px-4 py-3 font-medium">{j.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{(j.clients as any)?.company_name || "—"}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className={statusColor[j.status]}>{j.status}</Badge></td>
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
  const handleFieldSave = async (field: string, value: string) => {
    const updates: any = {};
    if (field === "salary_min" || field === "salary_max" || field === "fee_value") {
      updates[field] = value ? Number(value) : null;
    } else {
      updates[field] = value || null;
    }
    await onUpdate(updates);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          {backLabel ? <span className="text-sm">Back to {backLabel}</span> : null}
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {(job.clients as any)?.company_name || "No client"} · {job.location || "Remote"} · {job.job_type}
          </p>
        </div>
        <Badge variant="secondary" className={statusColor[job.status]}>{job.status}</Badge>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm rounded-lg border border-border p-4">
        <ClickToEditField label="Title" value={job.title} field="title" layout="stacked" onSave={(v) => handleFieldSave("title", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Location" value={job.location || ""} field="location" layout="stacked" onSave={(v) => handleFieldSave("location", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Status" value={job.status} field="status" options={JOB_STATUSES} layout="stacked" onSave={(v) => handleFieldSave("status", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Type" value={job.job_type} field="job_type" options={JOB_TYPES} layout="stacked" onSave={(v) => handleFieldSave("job_type", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Salary Min (£)" value={job.salary_min?.toString() || ""} field="salary_min" type="number" layout="stacked" onSave={(v) => handleFieldSave("salary_min", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Salary Max (£)" value={job.salary_max?.toString() || ""} field="salary_max" type="number" layout="stacked" onSave={(v) => handleFieldSave("salary_max", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Fee Type" value={job.fee_type || ""} field="fee_type" options={FEE_TYPES} layout="stacked" onSave={(v) => handleFieldSave("fee_type", v)} entityType="job" entityId={job.id} />
        <ClickToEditField label="Fee Value" value={job.fee_value?.toString() || ""} field="fee_value" type="number" layout="stacked" onSave={(v) => handleFieldSave("fee_value", v)} entityType="job" entityId={job.id} />
      </div>

      <TagsSection entityType="job" entityId={job.id} />

      <CandidateMatching job={job} autoRun={job.status === "Open"} />

      <div>
        <h2 className="text-sm font-medium mb-3">Candidate Pipeline</h2>
        <JobPipelineBoard job={job} />
      </div>

      <NotesSection entityType="job" entityId={job.id} />
    </div>
  );
}
