import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BriefcaseBusiness, Mail, ClipboardList, Tag, Download, X, ChevronUp, Check, MoreHorizontal, RefreshCw, Send, Users } from "lucide-react";
import { SendCheckinPanel } from "@/components/SendCheckinPanel";
import { useJobs, useCreateCandidateJob, useCreateNote, useUpdateCandidate, type Candidate } from "@/hooks/use-data";
import { useAddCandidateTag, useTagDefinitions, TAG_CATEGORIES } from "@/hooks/use-tags";
import { usePools, useAddCandidatesToPool } from "@/hooks/use-talent-pools";
import { logActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

const STATUSES = ["New", "Contacted", "Screening", "Submitted", "Interviewing", "Placed", "On Hold", "Not Suitable", "Cold", "Archive", "Do Not Contact", "LI Connection"] as const;

interface BulkActionBarProps {
  selected: Candidate[];
  onClear: () => void;
}

export function CandidateBulkActionBar({ selected, onClear }: BulkActionBarProps) {
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);

  if (selected.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 bg-[#1A1A2E] text-white shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
      <span className="text-sm font-medium whitespace-nowrap">
        {selected.length} candidate{selected.length !== 1 ? "s" : ""} selected
      </span>

      <div className="flex items-center gap-2">
        <AddToJobAction selected={selected} />
        <AddToPoolAction selected={selected} />
        {!isMobile && <SendCheckinAction selected={selected} />}
        {!isMobile && <AddToSequenceAction selected={selected} />}
        {!isMobile && <SendEmailAction selected={selected} />}
        {!isMobile && <LogTouchpointAction selected={selected} />}
        {!isMobile && <UpdateStatusAction selected={selected} />}
        {!isMobile && <AddTagAction selected={selected} />}
        {!isMobile && <ExportAction selected={selected} />}

        {isMobile && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="border-white/30 text-white hover:bg-white/10">
                <MoreHorizontal className="h-4 w-4 mr-1" /> More
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end" side="top">
              <MobileMoreActions selected={selected} onClose={() => setMoreOpen(false)} />
            </PopoverContent>
          </Popover>
        )}
      </div>

      <button onClick={onClear} className="p-2 rounded-md hover:bg-white/10 transition-colors">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function ActionButton({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("border-white/30 text-white hover:bg-white/10 hover:text-white", className)}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// --- Add to Job ---
function AddToJobAction({ selected }: { selected: Candidate[] }) {
  const { data: jobs = [] } = useJobs();
  const createCandidateJob = useCreateCandidateJob();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const openJobs = jobs.filter(j => j.status === "Open");
  const filtered = openJobs.filter(j =>
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    (j.clients?.company_name || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const handleAdd = async (job: typeof jobs[0]) => {
    let added = 0;
    for (const c of selected) {
      try {
        await createCandidateJob.mutateAsync({ candidate_id: c.id, job_id: job.id, stage: "Longlist", source: "manual" });
        added++;
      } catch { /* already linked */ }
    }
    toast.success(`${added} candidate${added !== 1 ? "s" : ""} added to ${job.title}`);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <ActionButton><BriefcaseBusiness className="h-4 w-4 mr-1" /> Add to Job</ActionButton>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="center" side="top">
        <div className="p-3 border-b border-border">
          <p className="text-sm font-medium mb-2">Add {selected.length} candidates to a job</p>
          <Input placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm" autoFocus />
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {openJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">No open jobs</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">No matching jobs</p>
          ) : filtered.map(job => (
            <button
              key={job.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
              onClick={() => handleAdd(job)}
              disabled={createCandidateJob.isPending}
            >
              <p className="font-medium text-foreground">{job.title}</p>
              <p className="text-xs text-muted-foreground">{job.clients?.company_name || "No client"}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Add to Sequence (placeholder) ---
function AddToSequenceAction({ selected }: { selected: Candidate[] }) {
  return (
    <ActionButton onClick={() => toast.info("Sequences coming soon")}>
      <RefreshCw className="h-4 w-4 mr-1" /> Add to Sequence
    </ActionButton>
  );
}

// --- Send Check-in (AI-drafted, multi-select) ---
function SendCheckinAction({ selected }: { selected: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const eligible = selected.filter((c) => c.email && c.status !== "Do Not Contact" && !(c as any).do_not_contact);
  const dncCount = selected.length - selected.filter((c) => c.status !== "Do Not Contact" && !(c as any).do_not_contact).length;
  return (
    <>
      <ActionButton onClick={() => {
        if (eligible.length === 0) {
          toast.error("No eligible candidates — Do Not Contact records and those without an email are excluded.");
          return;
        }
        if (dncCount > 0) {
          toast.message(`${dncCount} Do Not Contact record${dncCount === 1 ? "" : "s"} excluded.`);
        }
        setOpen(true);
      }}>
        <Send className="h-4 w-4 mr-1" /> Send Check-in
      </ActionButton>
      {open && <SendCheckinPanel open={open} onOpenChange={setOpen} candidates={eligible} />}
    </>
  );
}

// --- Send Email ---
function SendEmailAction({ selected }: { selected: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const createNote = useCreateNote();

  const withEmail = selected.filter(c => c.email);

  const personalise = (text: string, c: Candidate) =>
    text
      .replace(/\{\{first_name\}\}/g, c.first_name || c.name.split(" ")[0] || "")
      .replace(/\{\{job_title\}\}/g, c.job_title || "")
      .replace(/\{\{company\}\}/g, c.current_employer || "");

  const previewCandidate = withEmail[0];

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    for (const c of withEmail) {
      await createNote.mutateAsync({
        content: `Email sent — Subject: ${personalise(subject, c)}\n\n${personalise(body, c)}`,
        activity_type: "Email",
        outcome: "Sent",
        candidate_id: c.id,
      });
    }
    toast.success(`Email logged for ${withEmail.length} candidate${withEmail.length !== 1 ? "s" : ""}`);
    setOpen(false);
    setSubject("");
    setBody("");
  };

  return (
    <>
      <ActionButton onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-1" /> Send Email
      </ActionButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Send Email to {withEmail.length} candidates</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {selected.length !== withEmail.length && (
              <p className="text-xs text-yellow-500">{selected.length - withEmail.length} candidate(s) have no email and will be skipped.</p>
            )}
            <Input placeholder="Subject — use {{first_name}}, {{job_title}}, {{company}}" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea placeholder="Body — use {{first_name}}, {{job_title}}, {{company}}" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
            {previewCandidate && subject && (
              <div className="bg-muted/30 rounded p-3 text-sm">
                <p className="text-xs text-muted-foreground mb-1">Preview for {previewCandidate.name}:</p>
                <p className="font-medium">{personalise(subject, previewCandidate)}</p>
                <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{personalise(body, previewCandidate)}</p>
              </div>
            )}
            <Button className="w-full" onClick={handleSend} disabled={!subject.trim() || !body.trim() || createNote.isPending}>
              {createNote.isPending ? "Sending..." : `Send to ${withEmail.length} candidates`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- Log Touchpoint ---
function LogTouchpointAction({ selected }: { selected: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const createNote = useCreateNote();
  const [type, setType] = useState("Call");
  const [outcome, setOutcome] = useState("Spoke");
  const [content, setContent] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const TYPES = ["Call", "Email", "LinkedIn Message", "Meeting", "Text Message", "WhatsApp"];
  const OUTCOMES = ["Left Voicemail", "Spoke", "No Answer", "Replied", "No Reply", "Meeting Booked"];

  const handleSubmit = async () => {
    if (!content.trim()) return;
    for (const c of selected) {
      await createNote.mutateAsync({
        content: content.trim(),
        activity_type: type,
        outcome,
        follow_up_date: followUpDate || null,
        candidate_id: c.id,
      });
    }
    toast.success(`Touchpoint logged for ${selected.length} candidate${selected.length !== 1 ? "s" : ""}`);
    setOpen(false);
    setContent("");
    setFollowUpDate("");
  };

  return (
    <>
      <ActionButton onClick={() => setOpen(true)}>
        <ClipboardList className="h-4 w-4 mr-1" /> Log Touchpoint
      </ActionButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Touchpoint for {selected.length} candidates</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Textarea placeholder="Quick summary..." value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
            <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            <Button className="w-full" onClick={handleSubmit} disabled={!content.trim() || createNote.isPending}>
              {createNote.isPending ? "Saving..." : `Log for ${selected.length} candidates`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- Update Status ---
function UpdateStatusAction({ selected }: { selected: Candidate[] }) {
  const updateCandidate = useUpdateCandidate();
  const [open, setOpen] = useState(false);

  const handleUpdate = async (status: string) => {
    const willChange = selected.filter(c => c.status !== status);
    if (willChange.length === 0) {
      toast.info("All selected candidates already have this status");
      setOpen(false);
      return;
    }
    for (const c of willChange) {
      await updateCandidate.mutateAsync({ id: c.id, status } as any);
      if (status === "Do Not Contact") {
        await logActivity({
          action_type: "gdpr_do_not_contact",
          candidate_id: c.id,
          metadata: { previous_status: c.status, reason: "Bulk status change", permanent: true },
        });
      }
    }
    toast.success(`${willChange.length} candidate${willChange.length !== 1 ? "s" : ""} updated to ${status}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ActionButton><RefreshCw className="h-4 w-4 mr-1" /> Update Status</ActionButton>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="center" side="top">
        {STATUSES.map(s => (
          <button
            key={s}
            className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted/40 transition-colors"
            onClick={() => handleUpdate(s)}
          >
            {s}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// --- Add Tag ---
function AddTagAction({ selected }: { selected: Candidate[] }) {
  const { data: tagDefs = [] } = useTagDefinitions();
  const addTag = useAddCandidateTag();
  const [open, setOpen] = useState(false);

  const grouped = tagDefs.reduce((acc, td) => {
    if (td.archived) return acc;
    (acc[td.category] = acc[td.category] || []).push(td);
    return acc;
  }, {} as Record<string, typeof tagDefs>);

  const handleAdd = async (defId: string) => {
    for (const c of selected) {
      try {
        await addTag.mutateAsync({ candidate_id: c.id, tag_definition_id: defId, source: "manual" });
      } catch { /* already tagged */ }
    }
    toast.success(`Tag added to ${selected.length} candidate${selected.length !== 1 ? "s" : ""}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ActionButton><Tag className="h-4 w-4 mr-1" /> Add Tag</ActionButton>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0 max-h-[320px] overflow-y-auto" align="center" side="top">
        {Object.entries(grouped).map(([cat, defs]) => (
          <div key={cat}>
            <p className="text-xs font-medium text-muted-foreground px-3 pt-2 pb-1">{TAG_CATEGORIES[cat] || cat}</p>
            {defs.map(d => (
              <button key={d.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/40" onClick={() => handleAdd(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        ))}
        {Object.keys(grouped).length === 0 && <p className="text-sm text-muted-foreground p-3">No tags defined</p>}
      </PopoverContent>
    </Popover>
  );
}

// --- Export Selected ---
function ExportAction({ selected }: { selected: Candidate[] }) {
  const handleExport = () => {
    const headers = ["Name", "First Name", "Last Name", "Job Title", "Employer", "Email", "Phone", "Location", "Status", "Source", "Salary"];
    const rows = selected.map(c => [
      c.name, c.first_name || "", c.last_name || "", c.job_title || "", c.current_employer || "",
      c.email || "", c.phone || "", c.location || "", c.status, c.source || "", c.salary_current?.toString() || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Desky_candidates_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.length} candidates`);
  };

  return (
    <ActionButton onClick={handleExport}>
      <Download className="h-4 w-4 mr-1" /> Export
    </ActionButton>
  );
}

// --- Mobile More Actions ---
function MobileMoreActions({ selected, onClose }: { selected: Candidate[]; onClose: () => void }) {
  return (
    <div className="space-y-0.5">
      <SendCheckinAction selected={selected} />
      <SendEmailAction selected={selected} />
      <LogTouchpointAction selected={selected} />
      <UpdateStatusAction selected={selected} />
      <AddTagAction selected={selected} />
      <ExportAction selected={selected} />
    </div>
  );
}

// --- Add to Talent Pool ---
function AddToPoolAction({ selected }: { selected: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [poolId, setPoolId] = useState<string>("");
  const { data: pools = [] } = usePools();
  const addToPool = useAddCandidatesToPool();

  const handleAdd = async () => {
    if (!poolId) return;
    await addToPool.mutateAsync({ poolId, candidateIds: selected.map((c) => c.id) });
    const pool = pools.find((p) => p.id === poolId);
    toast.success(`${selected.length} candidate${selected.length !== 1 ? "s" : ""} added to ${pool?.name || "pool"}`);
    setOpen(false);
    setPoolId("");
  };

  return (
    <>
      <ActionButton onClick={() => setOpen(true)}>
        <Users className="h-4 w-4 mr-1" /> Add to Pool
      </ActionButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add {selected.length} candidate{selected.length !== 1 ? "s" : ""} to talent pool</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {pools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No talent pools yet. Create one in Settings → Talent Pools.</p>
            ) : (
              <Select value={poolId} onValueChange={setPoolId}>
                <SelectTrigger><SelectValue placeholder="Select a pool..." /></SelectTrigger>
                <SelectContent>
                  {pools.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button className="w-full" onClick={handleAdd} disabled={!poolId || addToPool.isPending}>
              {addToPool.isPending ? "Adding..." : "Add to pool"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
