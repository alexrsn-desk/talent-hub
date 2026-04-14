import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, ExternalLink, Trash2, PhoneCall, Star, Phone } from "lucide-react";
import { useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate, type Candidate } from "@/hooks/use-data";
import { PriorityFlagButton, PriorityStarIcon } from "@/components/PriorityFlag";
import { NotesSection } from "@/components/NotesSection";
import { CandidateJobLinks } from "@/components/CandidateJobLinks";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { CallPrepButton } from "@/components/CallPrep";

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

  const filtered = candidates
    .filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.job_title || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.current_employer || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      // Priority candidates float to top
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No candidates found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => { setSelectedCandidate(c); setDetailOpen(true); }}>
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-1.5">
                      {c.priority_flag && <PriorityStarIcon />}
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.job_title || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.current_employer || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.location || "—"}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className={statusColor[c.status]}>{c.status}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{c.source || "—"}</td>
                  <td className="px-4 py-3">
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail dialog */}
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

function CandidateDetail({ candidate, onUpdate, onDelete }: {
  candidate: Candidate;
  onUpdate: (updates: Partial<Candidate>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [touchpointOpen, setTouchpointOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{candidate.name}</h2>
          <p className="text-muted-foreground">{candidate.job_title || "No title"} {candidate.current_employer ? `at ${candidate.current_employer}` : ""}</p>
        </div>
        <div className="flex gap-2 items-start flex-wrap">
          <PriorityFlagButton candidate={candidate} size="sm" />
          {candidate.phone && (
            <a href={`tel:${candidate.phone}`}>
              <Button size="sm" variant="default" className="gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Call Now
              </Button>
            </a>
          )}
          <CallPrepButton entityType="candidate" entityId={candidate.id} entityName={candidate.name} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTouchpointOpen(true)}>
            <PhoneCall className="h-3.5 w-3.5" /> Log Touchpoint
          </Button>
          <Select defaultValue={candidate.status} onValueChange={(v) => onUpdate({ status: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-muted-foreground">Email:</span> {candidate.email || "—"}</div>
        <div><span className="text-muted-foreground">Phone:</span> {candidate.phone || "—"}</div>
        <div><span className="text-muted-foreground">Location:</span> {candidate.location || "—"}</div>
        <div><span className="text-muted-foreground">Source:</span> {candidate.source || "—"}</div>
        {candidate.linkedin_url && (
          <div className="col-span-2">
            <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> LinkedIn Profile
            </a>
          </div>
        )}
      </div>

      <CandidateJobLinks candidateId={candidate.id} />
      <NotesSection entityType="candidate" entityId={candidate.id} />
      <LogTouchpointModal
        open={touchpointOpen}
        onOpenChange={setTouchpointOpen}
        entityType="candidate"
        entityId={candidate.id}
        entityName={candidate.name}
      />
    </div>
  );
}
