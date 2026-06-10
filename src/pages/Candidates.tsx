import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Star, ClipboardList, Phone, BriefcaseBusiness, Check, CalendarClock, Sparkles } from "lucide-react";
import { useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate, useJobs, useCreateCandidateJob, useCandidateJobs, useCreateNote, type Candidate } from "@/hooks/use-data";
import { AdvancedSearchBar, applyCandidateFilters, EMPTY_CANDIDATE_FILTERS, type CandidateFilters, type SearchableRecord } from "@/components/AdvancedSearchBar";
import { useSearchAggregates } from "@/hooks/use-search-aggregates";
import { Textarea } from "@/components/ui/textarea";
import { PriorityStarIcon } from "@/components/PriorityFlag";
import { CandidateDetail } from "@/components/CandidateDetail";
import { CandidateContextMenu } from "@/components/CandidateContextMenu";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { CandidateBulkActionBar } from "@/components/CandidateBulkActionBar";
import { AddToSequencePanel } from "@/components/AddToSequencePanel";
import { ReengageBadge, ReengageInlineEditor } from "@/components/ReengageDate";
import { logActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePools, usePoolMemberships, computePoolHealth, HEALTH_DOT } from "@/hooks/use-talent-pools";

const STATUSES = ["New", "Contacted", "Screening", "Submitted", "Interviewing", "Placed", "On Hold", "Not Suitable", "Cold", "Archive", "Do Not Contact", "LI Connection"] as const;
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
  "LI Connection": "bg-sky-500/20 text-sky-300",
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
  reengageDate,
  candidateId,
  onSave,
  isEditing,
  onStartEdit,
  onStopEdit,
}: {
  value: string;
  reengageDate?: string | null;
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
    <div className="flex items-center gap-1.5 flex-wrap">
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
      {value === "On Hold" && reengageDate && <ReengageBadge date={reengageDate} />}
    </div>
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
      source: "manual",
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
  const createNote = useCreateNote();
  const updateCandidate = useUpdateCandidate();
  const deleteCandidate = useDeleteCandidate();
  const [search, setSearch] = useState("");
  const [advFilters, setAdvFilters] = useState<CandidateFilters>(EMPTY_CANDIDATE_FILTERS);
  const [aiResults, setAiResults] = useState<{ id: string; reason: string }[] | null>(null);
  const { data: aggregates } = useSearchAggregates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Track which cell is being edited: "candidateId:field"
  const [editingCell, setEditingCell] = useState<string | null>(null);
  // Track which candidate's re-engage editor is open (just-set Hold or already Hold)
  const [reengageOpenForId, setReengageOpenForId] = useState<string | null>(null);
  const [touchpointCandidate, setTouchpointCandidate] = useState<Candidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndex = useRef<number | null>(null);
  const [poolFilter, setPoolFilter] = useState<string>("all");
  const { data: pools = [] } = usePools();
  const { data: memberships = [] } = usePoolMemberships();

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

  // Build searchable records (enrich with notes / pipeline aggregates)
  const searchableRecords: SearchableRecord[] = useMemo(() => candidates.map(c => {
    const meta = aggregates?.candidateNoteMeta.get(c.id);
    return {
      id: c.id,
      type: "candidate" as const,
      name: c.name,
      job_title: c.job_title,
      company: c.current_employer,
      sector: null,
      location: c.location,
      status: c.status,
      salary: c.salary_current ?? c.salary_expectation ?? null,
      last_contacted: meta?.last ?? null,
      in_pipeline: aggregates?.candidatesInPipeline.has(c.id) ?? false,
      notes_excerpt: meta?.excerpt ?? null,
    };
  }), [candidates, aggregates]);

  const reasonById = useMemo(() => {
    if (!aiResults) return null;
    const m = new Map<string, string>();
    aiResults.forEach(r => m.set(r.id, r.reason));
    return m;
  }, [aiResults]);

  const filteredBase = useMemo(() => {
    if (aiResults) {
      const order = new Map(aiResults.map((r, i) => [r.id, i]));
      const byId = new Map(candidates.map(c => [c.id, c]));
      return aiResults
        .map(r => byId.get(r.id))
        .filter((c): c is Candidate => !!c)
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    const matched = applyCandidateFilters(searchableRecords, search, advFilters);
    const ids = new Set(matched.map(r => r.id));
    return candidates.filter(c => ids.has(c.id));
  }, [aiResults, searchableRecords, search, advFilters, candidates]);

  const filtered = filteredBase
    .slice()
    .filter((c) => {
      if (poolFilter === "all") return true;
      return memberships.some((m) => m.candidate_id === c.id && m.pool_id === poolFilter);
    })
    .sort((a, b) => {
      if (aiResults) return 0; // preserve AI ranking
      if (a.priority_flag && !b.priority_flag) return -1;
      if (!a.priority_flag && b.priority_flag) return 1;
      return 0;
    });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        lastClickedIndex.current = null;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && !editingCell) {
        e.preventDefault();
        setSelectedIds(new Set(filtered.map(c => c.id)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, editingCell]);

  const toggleSelect = useCallback((candidateId: string, index: number, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIndex.current !== null) {
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        for (let i = start; i <= end; i++) {
          next.add(filtered[i].id);
        }
      } else {
        if (next.has(candidateId)) next.delete(candidateId);
        else next.add(candidateId);
      }
      return next;
    });
    lastClickedIndex.current = index;
  }, [filtered]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  }, [filtered, selectedIds.size]);

  const selectedCandidates = filtered.filter(c => selectedIds.has(c.id));

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await createCandidate.mutateAsync({
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
      salary_current: fd.get("salary_current") ? parseInt((fd.get("salary_current") as string).replace(/[^0-9]/g, "")) : null,
      salary_expectation: fd.get("salary_expectation") ? parseInt((fd.get("salary_expectation") as string).replace(/[^0-9]/g, "")) : null,
      availability: null,
      priority_flag: false,
      priority_reason: null,
      priority_flagged_at: null,
      priority_followup_date: null,
    });
    const notes = (fd.get("notes") as string || "").trim();
    if (notes && result?.id) {
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      await createNote.mutateAsync({
        candidate_id: result.id,
        content: `Added on creation — ${dateStr}\n\n${notes}`,
        activity_type: "Note",
      });
    }
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

    // Auto-open re-engage editor when Hold status is selected
    if (field === "status" && newValue === "On Hold") {
      setReengageOpenForId(candidateId);
    }
    // Clear re-engage data when leaving Hold
    if (field === "status" && oldValue === "On Hold" && newValue !== "On Hold") {
      await updateCandidate.mutateAsync({ id: candidateId, reengage_date: null, reengage_reason: null } as any);
      setReengageOpenForId(null);
    }
  }, [updateCandidate]);

  const cellKey = (id: string, field: string) => `${id}:${field}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Candidates</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto"><Plus className="mr-1 h-4 w-4" />Add Candidate</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
            <DialogHeader><DialogTitle>New Candidate</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Name *</Label><Input name="name" required /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Job Title</Label><Input name="job_title" /></div>
                <div><Label>Employer</Label><Input name="current_employer" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Location</Label><Input name="location" /></div>
                <div><Label>Email</Label><Input name="email" type="email" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input name="phone" /></div>
                <div><Label>LinkedIn URL</Label><Input name="linkedin_url" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Current Salary</Label><Input name="salary_current" type="number" placeholder="e.g. 85000" /></div>
                <div>
                  <Label>Salary Expectation</Label>
                  <Input name="salary_expectation" type="number" placeholder="e.g. 95000" />
                  <p className="text-xs text-muted-foreground mt-1">Enter numbers only — no £ signs or commas</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" placeholder="Add any notes about this candidate — source, how you know them, first impressions..." className="min-h-[80px]" />
              </div>
              <Button type="submit" className="w-full" disabled={createCandidate.isPending}>
                {createCandidate.isPending ? "Creating..." : "Create Candidate"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <AdvancedSearchBar
        scope="candidate"
        records={searchableRecords}
        query={search}
        onQueryChange={setSearch}
        filters={advFilters}
        onFiltersChange={setAdvFilters}
        statusOptions={STATUSES as unknown as string[]}
        aiResults={aiResults}
        onAiResultsChange={setAiResults}
      />

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <>
         <div className="sm:hidden space-y-2">
           {filtered.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">No candidates found</p>
           ) : filtered.map((c, idx) => {
             const isSelected = selectedIds.has(c.id);
             return (
               <div
                 key={c.id}
                 className={cn(
                   "rounded-lg border border-border p-3 space-y-2 transition-colors",
                   isSelected && "bg-primary/5 border-primary/30"
                 )}
               >
                 <div className="flex items-start gap-2">
                   <Checkbox
                     checked={isSelected}
                     onCheckedChange={() => {}}
                     onClick={(e) => { e.stopPropagation(); toggleSelect(c.id, idx, e.shiftKey); }}
                     className="mt-1"
                   />
                   <div
                     className="flex-1 min-w-0 cursor-pointer"
                     onClick={() => { setSelectedCandidate(c); setDetailOpen(true); }}
                   >
                     <div className="flex items-center gap-1.5">
                       {c.priority_flag && <PriorityStarIcon />}
                       <span className="font-medium truncate">{c.name}</span>
                     </div>
                      {c.job_title && <p className="text-xs text-muted-foreground truncate">{c.job_title}{c.current_employer ? ` at ${c.current_employer}` : ""}</p>}
                      {reasonById?.get(c.id) && (
                        <p className="text-[10px] text-primary/90 mt-1 flex items-start gap-1"><Sparkles className="h-2.5 w-2.5 mt-0.5 shrink-0" /><span className="line-clamp-2">{reasonById.get(c.id)}</span></p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className={cn("text-[10px]", statusColor[c.status])}>{c.status}</Badge>
                        {c.status === "On Hold" && c.reengage_date && <ReengageBadge date={c.reengage_date} />}
                        {c.location && <span className="text-[10px] text-muted-foreground">{c.location}</span>}
                        {c.salary_current ? <span className="text-[10px] text-muted-foreground">£{c.salary_current.toLocaleString()}</span> : c.salary_expectation ? <span className="text-[10px] text-muted-foreground">£{Math.round(c.salary_expectation / 1000)}k exp</span> : null}
                      </div>
                    </div>
                  </div>
                  {c.status === "On Hold" && (reengageOpenForId === c.id || !c.reengage_date) && (
                    <ReengageInlineEditor
                      date={c.reengage_date}
                      reason={c.reengage_reason}
                      autoOpen={!c.reengage_date}
                      onSave={async (date, reason) => {
                        await updateCandidate.mutateAsync({ id: c.id, reengage_date: date, reengage_reason: reason } as any);
                        if (date) setReengageOpenForId(null);
                        toast.success(date ? "Re-engage date saved" : "Re-engage cleared");
                      }}
                    />
                  )}
                 <div className="flex items-center justify-end gap-1 border-t border-border/50 pt-2 -mb-1">
                   <RowPriorityToggle candidate={c} onToggle={handleTogglePriority} />
                   <RowTouchpointButton candidate={c} onOpen={handleOpenTouchpoint} />
                   <RowCallButton candidate={c} onOpenTouchpoint={handleOpenTouchpoint} />
                   <RowAddToJobButton candidate={c} />
                   <AddToSequencePanel candidateId={c.id} candidateName={c.name} />
                   <CandidateContextMenu
                     candidate={c}
                     onViewProfile={() => { setSelectedCandidate(c); setDetailOpen(true); }}
                   />
                 </div>
               </div>
             );
           })}
         </div>

         {/* Desktop table view */}
         <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-3 w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
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
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No candidates found</td></tr>
              ) : filtered.map((c, idx) => {
                const isSelected = selectedIds.has(c.id);
                return (
                <Fragment key={c.id}>
                <tr
                  className={cn(
                    "group border-b border-border hover:bg-muted/20 transition-colors",
                    isSelected && "bg-primary/5"
                  )}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => {}}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(c.id, idx, e.shiftKey);
                      }}
                      aria-label={`Select ${c.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span
                      className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => { setSelectedCandidate(c); setDetailOpen(true); }}
                    >
                      {c.priority_flag && <PriorityStarIcon />}
                      {c.name}
                    </span>
                    {reasonById?.get(c.id) && (
                      <p className="text-[10px] text-primary/90 mt-0.5 flex items-start gap-1"><Sparkles className="h-2.5 w-2.5 mt-0.5 shrink-0" /><span className="line-clamp-2">{reasonById.get(c.id)}</span></p>
                    )}
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
                      formatDisplay={(v) => {
                        if (v) return `£${parseInt(v).toLocaleString()}`;
                        const exp = c.salary_expectation;
                        if (exp) return `£${Math.round(exp / 1000)}k exp`;
                        return "—";
                      }}
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
                      reengageDate={c.reengage_date}
                      candidateId={c.id}
                      onSave={(f, nv, ov) => handleInlineSave(c.id, f, nv, ov)}
                      isEditing={editingCell === cellKey(c.id, "status")}
                      onStartEdit={() => setEditingCell(cellKey(c.id, "status"))}
                      onStopEdit={() => setEditingCell(null)}
                    />
                    {c.status === "On Hold" && !c.reengage_date && reengageOpenForId !== c.id && (
                      <button
                        className="mt-1 text-[10px] text-primary hover:underline flex items-center gap-1"
                        onClick={(e) => { e.stopPropagation(); setReengageOpenForId(c.id); }}
                      >
                        <CalendarClock className="h-3 w-3" /> Set re-engage date
                      </button>
                    )}
                  </td>
                   <td className="px-4 py-3">
                     <div className="flex items-center gap-2">
                       <RowPriorityToggle candidate={c} onToggle={handleTogglePriority} />
                       <RowTouchpointButton candidate={c} onOpen={handleOpenTouchpoint} />
                       <RowCallButton candidate={c} onOpenTouchpoint={handleOpenTouchpoint} />
                       <RowAddToJobButton candidate={c} />
                       <AddToSequencePanel candidateId={c.id} candidateName={c.name} />
                       <CandidateContextMenu
                         candidate={c}
                         onViewProfile={() => { setSelectedCandidate(c); setDetailOpen(true); }}
                       />
                     </div>
                   </td>
                </tr>
                {(reengageOpenForId === c.id || (c.status === "On Hold" && c.reengage_date && false)) && (
                  <tr key={`${c.id}-reengage`} className="bg-muted/10 border-b border-border">
                    <td colSpan={8} className="px-4 py-3">
                      <ReengageInlineEditor
                        date={c.reengage_date}
                        reason={c.reengage_reason}
                        autoOpen={!c.reengage_date}
                        onSave={async (date, reason) => {
                          await updateCandidate.mutateAsync({ id: c.id, reengage_date: date, reengage_reason: reason } as any);
                          if (date) setReengageOpenForId(null);
                          toast.success(date ? "Re-engage date saved" : "Re-engage cleared");
                        }}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Spacer when action bar is visible */}
      {selectedCandidates.length > 0 && <div className="h-16" />}

      <CandidateBulkActionBar
        selected={selectedCandidates}
        onClear={() => { setSelectedIds(new Set()); lastClickedIndex.current = null; }}
      />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-auto max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
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
