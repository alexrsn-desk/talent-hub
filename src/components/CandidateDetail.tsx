import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, X, Save, ExternalLink, Trash2, PhoneCall, Phone, AlertCircle, Ban, Lock } from "lucide-react";
import { useUpdateCandidate, type Candidate } from "@/hooks/use-data";
import { PriorityFlagButton, PriorityStarIcon } from "@/components/PriorityFlag";
import { ProfileTabs } from "@/components/ProfileTabs";
import { CandidateJobLinks } from "@/components/CandidateJobLinks";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { CallPrepButton } from "@/components/CallPrep";
import { ClickToEditField } from "@/components/ClickToEditField";
import { SummaryField } from "@/components/SummaryField";
import { TagsSection } from "@/components/TagsSection";
import { TalentPoolSelector } from "@/components/TalentPoolSelector";
import { ScreeningCompleteness } from "@/components/ScreeningCompleteness";
import { ActiveSequencesSection } from "@/components/ActiveSequencesSection";
import { AddToSequencePanel } from "@/components/AddToSequencePanel";
import { ReengageInlineEditor, formatReengageDate } from "@/components/ReengageDate";
import { GitBranch, CalendarClock, Send } from "lucide-react";
import { SendCheckinPanel } from "@/components/SendCheckinPanel";
import { Label } from "@/components/ui/label";
import { logActivity } from "@/lib/activity-log";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DoNotContactBanner } from "@/components/DoNotContactBanner";
import { DoNotContactDialog } from "@/components/DoNotContactDialog";
import { RequestDeletionDialog } from "@/components/RequestDeletionDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ShieldAlert, MoreVertical } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

interface Props {
  candidate: Candidate;
  onUpdate: (updates: Partial<Candidate>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function CandidateDetail({ candidate, onUpdate, onDelete }: Props) {
  const [touchpointOpen, setTouchpointOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [dncOpen, setDncOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const updateCandidate = useUpdateCandidate();

  const [form, setForm] = useState(() => ({
    first_name: candidate.first_name || "",
    last_name: candidate.last_name || "",
    job_title: candidate.job_title || "",
    current_employer: candidate.current_employer || "",
    location: candidate.location || "",
    email: candidate.email || "",
    phone: candidate.phone || "",
    linkedin_url: candidate.linkedin_url || "",
    salary_current: candidate.salary_current?.toString() || "",
    availability: candidate.availability || "",
    source: candidate.source || "LinkedIn",
    status: candidate.status,
  }));

  const handleStartEdit = () => {
    setForm({
      first_name: candidate.first_name || "",
      last_name: candidate.last_name || "",
      job_title: candidate.job_title || "",
      current_employer: candidate.current_employer || "",
      location: candidate.location || "",
      email: candidate.email || "",
      phone: candidate.phone || "",
      linkedin_url: candidate.linkedin_url || "",
      salary_current: candidate.salary_current?.toString() || "",
      availability: candidate.availability || "",
      source: candidate.source || "LinkedIn",
      status: candidate.status,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Invalid email format");
      return;
    }
    if (form.linkedin_url && !form.linkedin_url.includes("linkedin.com")) {
      toast.error("LinkedIn URL must contain linkedin.com");
      return;
    }

    const updates: Partial<Candidate> = {};
    const changes: string[] = [];
    const fieldMap: Record<string, { old: any; new: any; label: string }> = {
      first_name: { old: candidate.first_name || "", new: form.first_name, label: "First name" },
      last_name: { old: candidate.last_name || "", new: form.last_name, label: "Last name" },
      job_title: { old: candidate.job_title || "", new: form.job_title, label: "Job title" },
      current_employer: { old: candidate.current_employer || "", new: form.current_employer, label: "Employer" },
      location: { old: candidate.location || "", new: form.location, label: "Location" },
      email: { old: candidate.email || "", new: form.email, label: "Email" },
      phone: { old: candidate.phone || "", new: form.phone, label: "Phone" },
      linkedin_url: { old: candidate.linkedin_url || "", new: form.linkedin_url, label: "LinkedIn" },
      availability: { old: candidate.availability || "", new: form.availability, label: "Availability" },
      source: { old: candidate.source || "", new: form.source, label: "Source" },
      status: { old: candidate.status, new: form.status, label: "Status" },
    };

    for (const [key, { old, new: newVal, label }] of Object.entries(fieldMap)) {
      if (old !== newVal) {
        (updates as any)[key] = newVal || (key === "first_name" || key === "last_name" ? "" : null);
        changes.push(`${label}: ${old || "—"} → ${newVal || "—"}`);
      }
    }

    const newSalary = form.salary_current ? parseInt(form.salary_current) : null;
    if (newSalary !== candidate.salary_current) {
      updates.salary_current = newSalary;
      changes.push(`Salary: ${candidate.salary_current ? `£${candidate.salary_current.toLocaleString()}` : "—"} → ${newSalary ? `£${newSalary.toLocaleString()}` : "—"}`);
    }

    if (changes.length === 0) { setEditing(false); return; }

    if ((updates as any).first_name !== undefined || (updates as any).last_name !== undefined) {
      const first = ((updates as any).first_name ?? candidate.first_name ?? "").trim();
      const last = ((updates as any).last_name ?? candidate.last_name ?? "").trim();
      (updates as any).name = `${first} ${last}`.replace(/\s+/g, " ").trim();
    }

    await onUpdate(updates);
    await logActivity({ action_type: "candidate_updated", candidate_id: candidate.id, metadata: { changes, fields_updated: Object.keys(updates) } });

    // GDPR log when Do Not Contact status is set
    if (updates.status === "Do Not Contact" && candidate.status !== "Do Not Contact") {
      await logActivity({
        action_type: "gdpr_do_not_contact",
        candidate_id: candidate.id,
        metadata: {
          previous_status: candidate.status,
          reason: "Status changed to Do Not Contact",
          permanent: true,
        },
      });
    }

    setEditing(false);
    toast.success(`Updated: ${changes.length} field${changes.length > 1 ? "s" : ""} changed`);
  };

  const handleCancel = () => {
    const hasChanges = Object.entries(form).some(([key, val]) => {
      if (key === "salary_current") return val !== (candidate.salary_current?.toString() || "");
      return val !== ((candidate as any)[key] || "");
    });
    if (hasChanges) setDiscardOpen(true);
    else setEditing(false);
  };

  const handleFieldSave = async (field: string, newValue: string) => {
    const updates: any = {};
    if (field === "salary_current") {
      updates[field] = newValue ? parseInt(newValue) : null;
    } else {
      updates[field] = newValue || null;
    }
    if (field === "name") {
      const parts = newValue.trim().split(/\s+/);
      updates.first_name = parts[0];
      updates.last_name = parts.slice(1).join(" ") || null;
    }
    await onUpdate(updates);
  };

  const hints: string[] = [];
  if (editing) {
    if (!form.email) hints.push("No email on this record — worth adding?");
    if (!form.phone) hints.push("No phone number — worth adding?");
  }
  const isDNC = candidate.status === "Do Not Contact" || !!candidate.do_not_contact;

  return (
    <div className="space-y-6">
      {/* Do Not Contact Banner — permanent, undismissable */}
      {isDNC && (
        <DoNotContactBanner
          reason={candidate.dnc_reason ?? (candidate.status === "Do Not Contact" ? "Status: Do Not Contact" : null)}
          reasonOther={candidate.dnc_reason_other}
          setAt={candidate.dnc_set_at}
        />
      )}

      {/* On Hold Re-engage Banner */}
      {candidate.status === "On Hold" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span className="font-medium">
              On hold — {candidate.reengage_date ? `re-engage ${formatReengageDate(candidate.reengage_date)}` : "no re-engage date set"}
            </span>
          </div>
          {candidate.reengage_reason && (
            <p className="text-xs text-amber-500/80 pl-6">{candidate.reengage_reason}</p>
          )}
          <ReengageInlineEditor
            date={candidate.reengage_date}
            reason={candidate.reengage_reason}
            onSave={async (date, reason) => {
              await onUpdate({ reengage_date: date, reengage_reason: reason } as any);
              toast.success(date ? "Re-engage date saved" : "Re-engage cleared");
            }}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="text-xl font-semibold h-auto py-1" />
          ) : (
            <>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {candidate.priority_flag && <PriorityStarIcon />}
                {candidate.name}
              </h2>
              <p className="text-muted-foreground">{candidate.job_title || "No title"} {candidate.current_employer ? `at ${candidate.current_employer}` : ""}</p>
            </>
          )}
        </div>
        <div className="flex gap-2 items-start flex-wrap flex-shrink-0">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} className="gap-1.5 flex-1 sm:flex-none" disabled={updateCandidate.isPending}>
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5 flex-1 sm:flex-none">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={handleStartEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              {!isDNC && <PriorityFlagButton candidate={candidate} size="sm" />}
              {!isDNC && candidate.phone && (
                <a href={`tel:${candidate.phone}`}>
                  <Button size="sm" variant="default" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Call Now</Button>
                </a>
              )}
              {!isDNC && <CallPrepButton entityType="candidate" entityId={candidate.id} entityName={candidate.name} />}
              {isDNC ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="outline" className="gap-1.5 opacity-50" disabled>
                        <Ban className="h-3.5 w-3.5" /> Log Touchpoint
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Cannot log touchpoint — Do Not Contact status</TooltipContent>
                </Tooltip>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTouchpointOpen(true)}>
                  <PhoneCall className="h-3.5 w-3.5" /> Log Touchpoint
                </Button>
              )}
              {!isDNC && (
                <AddToSequencePanel
                  candidateId={candidate.id}
                  candidateName={candidate.name}
                  trigger={
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" /> Add to Sequence
                    </Button>
                  }
                />
              )}
              {isDNC ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="outline" className="gap-1.5 opacity-50" disabled>
                        <Send className="h-3.5 w-3.5" /> Send Check-in
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Cannot send — Do Not Contact status</TooltipContent>
                </Tooltip>
              ) : !candidate.email ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="outline" className="gap-1.5 opacity-50" disabled>
                        <Send className="h-3.5 w-3.5" /> Send Check-in
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">No email on file</TooltipContent>
                </Tooltip>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCheckinOpen(true)}>
                  <Send className="h-3.5 w-3.5" /> Send Check-in
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5" aria-label="Compliance">
                    <ShieldAlert className="h-3.5 w-3.5" /> Compliance
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setDncOpen(true)}>
                    {isDNC ? "Remove Do Not Contact" : "Mark as Do Not Contact"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                    disabled={!!candidate.gdpr_deleted}
                  >
                    Request data deletion (GDPR)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      </div>

      {/* Fields */}
      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs text-muted-foreground">Job Title</Label><Input value={form.job_title} onChange={(e) => setForm(f => ({ ...f, job_title: e.target.value }))} className="h-8 text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">Employer</Label><Input value={form.current_employer} onChange={(e) => setForm(f => ({ ...f, current_employer: e.target.value }))} className="h-8 text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">Location</Label><Input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} className="h-8 text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">Email</Label><Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} className="h-8 text-sm" type="email" /></div>
          <div><Label className="text-xs text-muted-foreground">Phone</Label><Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="h-8 text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">LinkedIn URL</Label><Input value={form.linkedin_url} onChange={(e) => setForm(f => ({ ...f, linkedin_url: e.target.value }))} className="h-8 text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">Salary (£)</Label><Input value={form.salary_current} onChange={(e) => setForm(f => ({ ...f, salary_current: e.target.value }))} className="h-8 text-sm" type="number" /></div>
          <div><Label className="text-xs text-muted-foreground">Availability</Label><Input value={form.availability} onChange={(e) => setForm(f => ({ ...f, availability: e.target.value }))} className="h-8 text-sm" /></div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm(f => ({ ...f, source: v }))}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <ClickToEditField label="Email" value={candidate.email || ""} field="email" type="email" onSave={(v) => handleFieldSave("email", v)} entityType="candidate" entityId={candidate.id} />
          <ClickToEditField label="Phone" value={candidate.phone || ""} field="phone" onSave={(v) => handleFieldSave("phone", v)} entityType="candidate" entityId={candidate.id} />
          <ClickToEditField label="Location" value={candidate.location || ""} field="location" onSave={(v) => handleFieldSave("location", v)} entityType="candidate" entityId={candidate.id} />
          <ClickToEditField label="Source" value={candidate.source || ""} field="source" options={SOURCES} onSave={(v) => handleFieldSave("source", v)} entityType="candidate" entityId={candidate.id} />
          <ClickToEditField label="Salary" value={candidate.salary_current ? `£${candidate.salary_current.toLocaleString()}` : ""} field="salary_current" type="number" onSave={(v) => handleFieldSave("salary_current", v)} entityType="candidate" entityId={candidate.id} />
          <ClickToEditField label="Availability" value={candidate.availability || ""} field="availability" onSave={(v) => handleFieldSave("availability", v)} entityType="candidate" entityId={candidate.id} />
          <ClickToEditField label="Job Title" value={candidate.job_title || ""} field="job_title" onSave={(v) => handleFieldSave("job_title", v)} entityType="candidate" entityId={candidate.id} />
          <ClickToEditField label="Employer" value={candidate.current_employer || ""} field="current_employer" onSave={(v) => handleFieldSave("current_employer", v)} entityType="candidate" entityId={candidate.id} />
          {candidate.linkedin_url && (
            <div className="col-span-2">
              <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm">
                <ExternalLink className="h-3 w-3" /> LinkedIn Profile
              </a>
            </div>
          )}
        </div>
      )}

      {hints.length > 0 && (
        <div className="space-y-1">
          {hints.map((h, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-yellow-400" /> {h}
            </p>
          ))}
        </div>
      )}

      {editing && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button size="sm" onClick={handleSave} className="gap-1.5" disabled={updateCandidate.isPending}><Save className="h-3.5 w-3.5" /> Save</Button>
          <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5"><X className="h-3.5 w-3.5" /> Cancel</Button>
        </div>
      )}

      {!editing && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={statusColor[candidate.status]}>{candidate.status}</Badge>
        </div>
      )}

      {!editing && (
        <SummaryField
          label="Summary"
          storageKey={`candidate:${candidate.id}`}
          value={candidate.summary || ""}
          placeholder="Add an overview of this candidate — who they are, what they want, why they stand out."
          onSave={async (next) => {
            await onUpdate({ summary: next || null } as any);
            await logActivity({
              action_type: "candidate_updated",
              candidate_id: candidate.id,
              metadata: { fields_updated: ["summary"] },
            });
          }}
          onGenerate={async () => {
            const { data, error } = await supabase.functions.invoke("generate-candidate-summary", {
              body: { candidate, mode: "overview" },
            });
            if (error) throw error;
            return (data?.summary as string) || "";
          }}
        />
      )}

      <ScreeningCompleteness candidateId={candidate.id} />
      <TalentPoolSelector candidateId={candidate.id} />
      <TagsSection entityType="candidate" entityId={candidate.id} />
      <ActiveSequencesSection entityType="candidate" entityId={candidate.id} entityName={candidate.name} />
      <CandidateJobLinks candidateId={candidate.id} />
      <ProfileTabs entityType="candidate" entityId={candidate.id} />
      <LogTouchpointModal open={touchpointOpen} onOpenChange={setTouchpointOpen} entityType="candidate" entityId={candidate.id} entityName={candidate.name} />
      <SendCheckinPanel open={checkinOpen} onOpenChange={setCheckinOpen} candidates={[candidate]} />

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved edits will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setEditing(false); setDiscardOpen(false); }}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DoNotContactDialog
        open={dncOpen}
        onOpenChange={setDncOpen}
        entityType="candidate"
        entityId={candidate.id}
        entityName={candidate.name}
        isCurrentlyDnc={isDNC}
      />
      <RequestDeletionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityType="candidate"
        entityId={candidate.id}
        entityName={candidate.name}
      />
    </div>
  );
}
