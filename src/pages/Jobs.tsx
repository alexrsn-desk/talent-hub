import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Trash2, ArrowLeft } from "lucide-react";
import { useJobs, useCreateJob, useUpdateJob, useDeleteJob, useClients, useCandidateJobs, useUpdateCandidateJob, type Job } from "@/hooks/use-data";
import { NotesSection } from "@/components/NotesSection";
import { JobPipelineBoard } from "@/components/JobPipelineBoard";

const JOB_STATUSES = ["Open", "On Hold", "Filled", "Cancelled"] as const;
const JOB_TYPES = ["Perm", "Contract"] as const;

const statusColor: Record<string, string> = {
  Open: "bg-success/20 text-green-400",
  "On Hold": "bg-yellow-500/20 text-yellow-400",
  Filled: "bg-primary/20 text-primary",
  Cancelled: "bg-destructive/20 text-red-400",
};

export default function JobsPage() {
  const { data: jobs = [], isLoading } = useJobs();
  const { data: clients = [] } = useClients();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const filtered = jobs.filter((j) => {
    const matchesSearch = j.title.toLowerCase().includes(search.toLowerCase()) ||
      ((j.clients as any)?.company_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createJob.mutateAsync({
      title: fd.get("title") as string,
      client_id: (fd.get("client_id") as string) || null,
      location: (fd.get("location") as string) || null,
      salary_min: fd.get("salary_min") ? Number(fd.get("salary_min")) : null,
      salary_max: fd.get("salary_max") ? Number(fd.get("salary_max")) : null,
      job_type: (fd.get("job_type") as string) || "Perm",
      status: "Open",
      fee_type: (fd.get("fee_type") as string) || "Percentage",
      fee_value: fd.get("fee_value") ? Number(fd.get("fee_value")) : null,
      date_opened: new Date().toISOString().split("T")[0],
    });
    setDialogOpen(false);
  };

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return "—";
    const fmt = (n: number) => `£${(n / 1000).toFixed(0)}k`;
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    return min ? fmt(min) : fmt(max!);
  };

  // Full-page job detail view with pipeline
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Job</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Job</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Job Title *</Label><Input name="title" required /></div>
              <div>
                <Label>Client</Label>
                <select name="client_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">No client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div><Label>Location</Label><Input name="location" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Salary Min</Label><Input name="salary_min" type="number" /></div>
                <div><Label>Salary Max</Label><Input name="salary_max" type="number" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Job Type</Label>
                  <select name="job_type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Fee Type</Label>
                  <select name="fee_type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="Percentage">Percentage</option>
                    <option value="Flat">Flat Fee</option>
                  </select>
                </div>
              </div>
              <div><Label>Fee Value</Label><Input name="fee_value" type="number" step="0.1" /></div>
              <Button type="submit" className="w-full" disabled={createJob.isPending}>
                {createJob.isPending ? "Creating..." : "Create Job"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Salary</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fee</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No jobs found</td></tr>
              ) : filtered.map(j => (
                <tr key={j.id} className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedJob(j)}>
                  <td className="px-4 py-3 font-medium">{j.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{(j.clients as any)?.company_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.location || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSalary(j.salary_min, j.salary_max)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.job_type}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className={statusColor[j.status]}>{j.status}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {j.fee_value ? (j.fee_type === "Percentage" ? `${j.fee_value}%` : `£${j.fee_value.toLocaleString()}`) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JobFullView({ job, onBack, onUpdate, onDelete }: {
  job: Job;
  onBack: () => void;
  onUpdate: (u: Partial<Job>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {(job.clients as any)?.company_name || "No client"} · {job.location || "Remote"} · {job.job_type}
          </p>
        </div>
        <Select defaultValue={job.status} onValueChange={(v) => onUpdate({ status: v })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {JOB_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4 text-sm rounded-lg border border-border p-4">
        <div><span className="text-muted-foreground block text-xs">Salary</span>{job.salary_min || job.salary_max ? `£${job.salary_min?.toLocaleString() || "?"} – £${job.salary_max?.toLocaleString() || "?"}` : "—"}</div>
        <div><span className="text-muted-foreground block text-xs">Fee</span>{job.fee_value ? (job.fee_type === "Percentage" ? `${job.fee_value}%` : `£${job.fee_value.toLocaleString()}`) : "—"}</div>
        <div><span className="text-muted-foreground block text-xs">Opened</span>{new Date(job.date_opened).toLocaleDateString()}</div>
        <div><span className="text-muted-foreground block text-xs">Type</span>{job.job_type}</div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Candidate Pipeline</h2>
        <JobPipelineBoard job={job} />
      </div>

      <NotesSection entityType="job" entityId={job.id} />
    </div>
  );
}
