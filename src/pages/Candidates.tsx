import { useState, useRef, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Star, ClipboardList, Phone, BriefcaseBusiness, Check } from "lucide-react";
import { useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate, useJobs, useCreateCandidateJob, useCandidateJobs, type Candidate } from "@/hooks/use-data";
import { PriorityStarIcon } from "@/components/PriorityFlag";
import { CandidateDetail } from "@/components/CandidateDetail";
import { CandidateContextMenu } from "@/components/CandidateContextMenu";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { CandidateBulkActionBar } from "@/components/CandidateBulkActionBar";
import { logActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUSES = ["New", "Contacted", "Screening", "Submitted", "Interviewing", "Placed", "On Hold", "Not Suitable", "Cold", "Archive", "Do Not Contact"] as const;
const SOURCES = ["LinkedIn", "Referral", "Job Board", "Inbound"] as const;

const statusColor: Record<string, string> = {
  New: "bg-primary/20 text-primary",
  Contacted: "bg-blue-500/20 text-blue-400",
  Screening: "bg-yellow-500/20 text-yellow-400",
  Submitted: "bg-purple-500/20 text-purple-400",
  Interviewing: "bg-orange-500/20 text-orange-400",
  Placed: "bg-success/20 text-green-400",
  "On Hold": "bg-muted text-muted-foreground",
  "Not Suitable": "bg-destructive/20 text-red-400",
  Cold: "bg-slate-500/20 text-slate-400",
  Archive: "bg-slate-600/20 text-slate-500",
  "Do Not Contact": "bg-red-600/30 text-red-500 ring-1 ring-red-500/30",
};

// --- Inline editable cell ---
function InlineEditCell({
  value,
  field,
  candidateId,
  candidateName,
  onSave,
  type = "text",
  formatDisplay,
  isEditing,
  onStartEdit,
  onStopEdit,
}: {
  value: string;
  field: string;
  candidateId: string;
  candidateName: string;
  onSave: (field: string, newValue: string, oldValue: string) => Promise<void>;
  type?: string;
  formatDisplay?: (v: string) => string;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}) {
  const [editValue, setEditValue] = useState(value);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditValue(value);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isEditing, value]);

  const save = useCallback(async () => {
    if (editValue === value) {
      onStopEdit();
      return;
    }
    await onSave(field, editValue, value);
    setFlash(true);
    setTimeout(() => setFlash(false), 500);
    onStopEdit();
  }, [editValue, value, field, onSave, onStopEdit]);

  const cancel = useCallback(() => {
    setEditValue(value);
    onStopEdit();
  }, [value, onStopEdit]);

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        onBlur={save}
        type={type}
        className="h-7 text-sm w-full border-primary ring-1 ring-primary/30"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const display = formatDisplay ? formatDisplay(value) : value || "—";

  return (
    <span
      className={cn(
        "cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-muted/40 transition-all inline-block",
        flash && "bg-green-500/20"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      {display}
    </span>
  );
}

// --- Inline status cell ---
function InlineStatusCell({
  value,
  candidateId,
  onSave,
  isEditing,
  onStartEdit,
  onStopEdit,
}: {
  value: string;
  candidateId: string;
  onSave: (field: string, newValue: string, oldValue: string) => Promise<void>;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}) {
  const [flash, setFlash] = useState(false);

  if (isEditing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select
          value={value}
          onValueChange={async (v) => {
            await onSave("status", v, value);
            setFlash(true);
            setTimeout(() => setFlash(false), 500);
            onStopEdit();
          }}
          open={true}
          onOpenChange={(open) => { if (!open) onStopEdit(); }}
        >
          <SelectTrigger className="h-7 text-xs w-auto min-w-[100px] border-primary ring-1 ring-primary/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        statusColor[value],
        "cursor-pointer transition-all",
        flash && "bg-green-500/20"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      {value}
    </Badge>
  );
}

// --- Row priority toggle ---
function RowPriorityToggle({ candidate, onToggle }: { candidate: Candidate; onToggle: (c: Candidate) => void }) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="p-2 rounded-md hover:bg-muted/40 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); onToggle(candidate); }}
          >
            <Star
              className={cn(
                "h-[18px] w-[18px] transition-colors",
                candidate.priority_flag
                  ? "fill-[#F5A623] text-[#F5A623]"
                  : "text-[#9CA3AF] hover:text-[#F5A623]/70"
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {candidate.priority_flag ? "Remove priority flag" : "Flag as priority"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// --- Row touchpoint button (clipboard icon) ---
function RowTouchpointButton({ candidate, onOpen }: { candidate: Candidate; onOpen: (c: Candidate) => void }) {
  const isDNC = candidate.status === "Do Not Contact";
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "p-2 rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
              isDNC ? "opacity-40 cursor-not-allowed" : "text-[#9CA3AF] hover:text-[#4A90D9] hover:bg-muted/40"
            )}
            onClick={(e) => { e.stopPropagation(); if (!isDNC) onOpen(candidate); }}
          >
            <ClipboardList className="h-[18px] w-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isDNC ? "Cannot log touchpoint — Do Not Contact" : "Log touchpoint"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// --- Row call now button ---
function RowCallButton({ candidate, onOpenTouchpoint }: { candidate: Candidate; onOpenTouchpoint: (c: Candidate) => void }) {
  const hasPhone = !!candidate.phone;
  const isDNC = candidate.status === "Do Not Contact";
  const disabled = !hasPhone || isDNC;

  const tooltipText = isDNC
    ? "Cannot call — Do Not Contact"
    : hasPhone
      ? "Call now"
      : "No phone number — add one to their profile";

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? (
            <span className="p-2 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center text-[#D1D5DB] cursor-not-allowed">
              <Phone className="h-[18px] w-[18px]" />
            </span>
          ) : (
            <a
              href={`tel:${candidate.phone}`}
              className="p-2 rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9CA3AF] hover:text-[#27AE60] hover:bg-muted/40"
              onClick={(e) => {
                e.stopPropagation();
                // Open touchpoint modal to log the call
                onOpenTouchpoint(candidate);
              }}
            >
              <Phone className="h-[18px] w-[18px]" />
            </a>
          )}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// --- Row add to job button ---
function RowAddToJobButton({ candidate }: { candidate: Candidate }) {
  const { data: jobs = [] } = useJobs();
  const { data: candidateJobs = [] } = useCandidateJobs(candidate.id);
  const createCandidateJob = useCreateCandidateJob();
  const [open, setOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [addedJobId, setAddedJobId] = useState<string | null>(null);

  const openJobs = jobs.filter(j => j.status === "Open");
  const filtered = openJobs.filter(j =>
    j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
    (j.clients?.company_name || "").toLowerCase().includes(jobSearch.toLowerCase())
  ).slice(0, 8);

  const existingJobIds = new Set(candidateJobs.map(cj => cj.job_id));

  const handleAddToJob = async (job: typeof jobs[0]) => {
    if (existingJobIds.has(job.id)) return;
    await createCandidateJob.mutateAsync({
      candidate_id: candidate.id,
      job_id: job.id,
      stage: "Longlist",
    });
    setAddedJobId(job.id);
    toast.success(`Added to ${job.title} ✓`);
    setTimeout(() => { setOpen(false); setAddedJobId(null); setJobSearch(""); }, 1200);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setJobSearch(""); setAddedJobId(null); } }}>
      <TooltipProvider delayDuration={500}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className="p-2 rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9CA3AF] hover:text-[#4A90D9] hover:bg-muted/40"
                onClick={(e) => e.stopPropagation()}
              >
                <BriefcaseBusiness className="h-[18px] w-[18px]" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Add to job</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-72 p-0" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-b border-border">
          <p className="text-sm font-medium mb-2">Add {candidate.name} to a job</p>
          <Input
            placeholder="Search jobs..."
            value={jobSearch}
            onChange={(e) => setJobSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {openJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">No open jobs — add one first</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">No matching jobs</p>
          ) : filtered.map(job => {
            const alreadyLinked = existingJobIds.has(job.id);
            const justAdded = addedJobId === job.id;
            return (
              <button
                key={job.id}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0",
                  alreadyLinked && "opacity-60",
                  justAdded && "bg-green-500/10"
                )}
                onClick={() => handleAddToJob(job)}
                disabled={alreadyLinked || createCandidateJob.isPending}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.clients?.company_name || "No client"}</p>
                  </div>
                  {alreadyLinked && !justAdded && (
                    <span className="text-xs text-muted-foreground">Already linked</span>
                  )}
                  {justAdded && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function CandidatesPage() {
  const { data: candidates = [], isLoading } = useCandidates();
  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const deleteCandidate = useDeleteCandidate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Track which cell is being edited: "candidateId:field"
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [touchpointCandidate, setTouchpointCandidate] = useState<Candidate | null>(null);

  const handleTogglePriority = useCallback((c: Candidate) => {
    if (c.priority_flag) {
      updateCandidate.mutate({ id: c.id, priority_flag: false, priority_reason: null, priority_flagged_at: null, priority_followup_date: null } as any);
      toast("Removed", { duration: 1000 });
    } else {
      updateCandidate.mutate({ id: c.id, priority_flag: true, priority_flagged_at: new Date().toISOString() } as any);
      toast("Flagged", { duration: 1000 });
    }
  }, [updateCandidate]);

  const handleOpenTouchpoint = useCallback((c: Candidate) => {
    setTouchpointCandidate(c);
  }, []);

  const filtered = candidates
    .filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.job_title || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.current_employer || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (a.priority_flag && !b.priority_flag) return -1;
      if (!a.priority_flag && b.priority_flag) return 1;
      return 0;
    });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createCandidate.mutateAsync({
      name: fd.get("name") as string,
      first_name: null,
      last_name: null,
      job_title: (fd.get("job_title") as string) || null,
      current_employer: (fd.get("current_employer") as string) || null,
      location: (fd.get("location") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      linkedin_url: (fd.get("linkedin_url") as string) || null,
      status: (fd.get("status") as string) || "New",
      source: (fd.get("source") as string) || "LinkedIn",
      salary_current: null,
      availability: null,
      priority_flag: false,
      priority_reason: null,
      priority_flagged_at: null,
      priority_followup_date: null,
    });
    setDialogOpen(false);
  };

  const handleInlineSave = useCallback(async (candidateId: string, field: string, newValue: string, oldValue: string) => {
    const updates: Partial<Candidate> = {};
    const labelMap: Record<string, string> = {
      job_title: "Job title",
      current_employer: "Employer",
      salary_current: "Salary",
      location: "Location",
      status: "Status",
    };
    if (field === "salary_current") {
      updates.salary_current = newValue ? parseInt(newValue.replace(/[^0-9]/g, "")) : null;
    } else {
      (updates as any)[field] = newValue || null;
    }
    await updateCandidate.mutateAsync({ id: candidateId, ...updates });
    const label = labelMap[field] || field;
    const oldDisplay = field === "salary_current" && oldValue ? `£${parseInt(oldValue).toLocaleString()}` : oldValue || "—";
    const newDisplay = field === "salary_current" && newValue ? `£${parseInt(newValue.replace(/[^0-9]/g, "")).toLocaleString()}` : newValue || "—";
    await logActivity({
      action_type: "candidate_updated",
      candidate_id: candidateId,
      metadata: {
        changes: [`${label}: ${oldDisplay} → ${newDisplay}`],
        fields_updated: [field],
      },
    });

    // GDPR log when Do Not Contact status is set inline
    if (field === "status" && newValue === "Do Not Contact" && oldValue !== "Do Not Contact") {
      await logActivity({
        action_type: "gdpr_do_not_contact",
        candidate_id: candidateId,
        metadata: {
          previous_status: oldValue,
          reason: "Status changed to Do Not Contact",
          permanent: true,
        },
      });
    }
  }, [updateCandidate]);

  const cellKey = (id: string, field: string) => `${id}:${field}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Candidate</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Candidate</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Name *</Label><Input name="name" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Job Title</Label><Input name="job_title" /></div>
                <div><Label>Employer</Label><Input name="current_employer" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Location</Label><Input name="location" /></div>
                <div><Label>Email</Label><Input name="email" type="email" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input name="phone" /></div>
                <div><Label>LinkedIn URL</Label><Input name="linkedin_url" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <select name="status" defaultValue="New" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Source</Label>
                  <select name="source" defaultValue="LinkedIn" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createCandidate.isPending}>
                {createCandidate.isPending ? "Creating..." : "Create Candidate"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search candidates..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Salary</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 w-64"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No candidates found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="group border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <span
                      className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => { setSelectedCandidate(c); setDetailOpen(true); }}
                    >
                      {c.priority_flag && <PriorityStarIcon />}
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <InlineEditCell
                      value={c.job_title || ""}
                      field="job_title"
                      candidateId={c.id}
                      candidateName={c.name}
                      onSave={(f, nv, ov) => handleInlineSave(c.id, f, nv, ov)}
                      isEditing={editingCell === cellKey(c.id, "job_title")}
                      onStartEdit={() => setEditingCell(cellKey(c.id, "job_title"))}
                      onStopEdit={() => setEditingCell(null)}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <InlineEditCell
                      value={c.current_employer || ""}
                      field="current_employer"
                      candidateId={c.id}
                      candidateName={c.name}
                      onSave={(f, nv, ov) => handleInlineSave(c.id, f, nv, ov)}
                      isEditing={editingCell === cellKey(c.id, "current_employer")}
                      onStartEdit={() => setEditingCell(cellKey(c.id, "current_employer"))}
                      onStopEdit={() => setEditingCell(null)}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <InlineEditCell
                      value={c.salary_current?.toString() || ""}
                      field="salary_current"
                      candidateId={c.id}
                      candidateName={c.name}
                      onSave={(f, nv, ov) => handleInlineSave(c.id, f, nv, ov)}
                      type="number"
                      formatDisplay={(v) => v ? `£${parseInt(v).toLocaleString()}` : "—"}
                      isEditing={editingCell === cellKey(c.id, "salary_current")}
                      onStartEdit={() => setEditingCell(cellKey(c.id, "salary_current"))}
                      onStopEdit={() => setEditingCell(null)}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <InlineEditCell
                      value={c.location || ""}
                      field="location"
                      candidateId={c.id}
                      candidateName={c.name}
                      onSave={(f, nv, ov) => handleInlineSave(c.id, f, nv, ov)}
                      isEditing={editingCell === cellKey(c.id, "location")}
                      onStartEdit={() => setEditingCell(cellKey(c.id, "location"))}
                      onStopEdit={() => setEditingCell(null)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineStatusCell
                      value={c.status}
                      candidateId={c.id}
                      onSave={(f, nv, ov) => handleInlineSave(c.id, f, nv, ov)}
                      isEditing={editingCell === cellKey(c.id, "status")}
                      onStartEdit={() => setEditingCell(cellKey(c.id, "status"))}
                      onStopEdit={() => setEditingCell(null)}
                    />
                  </td>
                   <td className="px-4 py-3">
                     <div className="flex items-center gap-2">
                       <RowPriorityToggle candidate={c} onToggle={handleTogglePriority} />
                       <RowTouchpointButton candidate={c} onOpen={handleOpenTouchpoint} />
                       <RowCallButton candidate={c} onOpenTouchpoint={handleOpenTouchpoint} />
                       <RowAddToJobButton candidate={c} />
                       <CandidateContextMenu
                         candidate={c}
                         onViewProfile={() => { setSelectedCandidate(c); setDetailOpen(true); }}
                       />
                     </div>
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCandidate && (
            <CandidateDetail
              candidate={selectedCandidate}
              onUpdate={async (updates) => {
                await updateCandidate.mutateAsync({ id: selectedCandidate.id, ...updates });
                setSelectedCandidate({ ...selectedCandidate, ...updates });
              }}
              onDelete={async () => {
                await deleteCandidate.mutateAsync(selectedCandidate.id);
                setDetailOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {touchpointCandidate && (
        <LogTouchpointModal
          open={!!touchpointCandidate}
          onOpenChange={(open) => { if (!open) setTouchpointCandidate(null); }}
          entityType="candidate"
          entityId={touchpointCandidate.id}
          entityName={touchpointCandidate.name}
        />
      )}
    </div>
  );
}
