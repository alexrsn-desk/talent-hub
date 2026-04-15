import { useState, useRef, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, ExternalLink, Star, PhoneCall } from "lucide-react";
import { useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate, type Candidate } from "@/hooks/use-data";
import { PriorityStarIcon } from "@/components/PriorityFlag";
import { CandidateDetail } from "@/components/CandidateDetail";
import { CandidateContextMenu } from "@/components/CandidateContextMenu";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { logActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUSES = ["New", "Contacted", "Screening", "Submitted", "Interviewing", "Placed", "On Hold", "Not Suitable"] as const;
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
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="p-2 rounded-md hover:bg-muted/40 transition-colors"
            onClick={(e) => { e.stopPropagation(); onToggle(candidate); }}
          >
            <Star
              className={cn(
                "h-4 w-4 transition-colors",
                candidate.priority_flag
                  ? "fill-[#F5A623] text-[#F5A623]"
                  : "text-muted-foreground hover:text-[#F5A623]/70"
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

// --- Row touchpoint button ---
function RowTouchpointButton({ candidate, onOpen }: { candidate: Candidate; onOpen: (c: Candidate) => void }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="p-2 rounded-md hover:bg-muted/40 transition-colors text-muted-foreground hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onOpen(candidate); }}
          >
            <PhoneCall className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Log touchpoint</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
                <th className="px-4 py-3 w-16"></th>
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
                    <div className="flex items-center gap-0.5">
                      <RowPriorityToggle candidate={c} onToggle={handleTogglePriority} />
                      <RowTouchpointButton candidate={c} onOpen={handleOpenTouchpoint} />
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-2">
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </a>
                      )}
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
    </div>
  );
}
