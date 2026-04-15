import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, X, Save, ExternalLink, Trash2, PhoneCall, Phone, AlertCircle } from "lucide-react";
import { useUpdateCandidate, type Candidate } from "@/hooks/use-data";
import { PriorityFlagButton, PriorityStarIcon } from "@/components/PriorityFlag";
import { NotesSection } from "@/components/NotesSection";
import { CandidateJobLinks } from "@/components/CandidateJobLinks";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { CallPrepButton } from "@/components/CallPrep";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
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

type EditableFields = {
  name: string;
  job_title: string;
  current_employer: string;
  location: string;
  email: string;
  phone: string;
  linkedin_url: string;
  salary_current: string;
  availability: string;
  source: string;
  status: string;
};

function validate(form: EditableFields) {
  const errors: string[] = [];
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push("Invalid email format");
  if (form.linkedin_url && !form.linkedin_url.includes("linkedin.com")) errors.push("LinkedIn URL must contain linkedin.com");
  if (form.salary_current && isNaN(Number(form.salary_current))) errors.push("Salary must be numeric");
  return errors;
}

function getHints(form: EditableFields) {
  const hints: string[] = [];
  if (!form.email) hints.push("No email on this record — worth adding?");
  if (!form.phone) hints.push("No phone number — worth adding?");
  return hints;
}

interface Props {
  candidate: Candidate;
  onUpdate: (updates: Partial<Candidate>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function CandidateDetail({ candidate, onUpdate, onDelete }: Props) {
  const [touchpointOpen, setTouchpointOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [inlineField, setInlineField] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState("");
  const updateCandidate = useUpdateCandidate();

  const [form, setForm] = useState<EditableFields>(() => ({
    name: candidate.name || "",
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
      name: candidate.name || "",
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
    const errors = validate(form);
    if (errors.length > 0) {
      toast.error(errors.join(". "));
      return;
    }

    const updates: Partial<Candidate> = {};
    const changes: string[] = [];
    const fieldMap: Record<string, { old: any; new: any; label: string }> = {
      name: { old: candidate.name, new: form.name, label: "Name" },
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
        (updates as any)[key] = newVal || null;
        changes.push(`${label}: ${old || "—"} → ${newVal || "—"}`);
      }
    }

    const newSalary = form.salary_current ? parseInt(form.salary_current) : null;
    if (newSalary !== candidate.salary_current) {
      updates.salary_current = newSalary;
      changes.push(`Salary: ${candidate.salary_current ? `£${candidate.salary_current.toLocaleString()}` : "—"} → ${newSalary ? `£${newSalary.toLocaleString()}` : "—"}`);
    }

    if (changes.length === 0) {
      setEditing(false);
      return;
    }

    // Ensure name field is set properly
    if (updates.name) {
      const parts = (updates.name as string).trim().split(/\s+/);
      (updates as any).first_name = parts[0];
      (updates as any).last_name = parts.slice(1).join(" ") || null;
    }

    await onUpdate(updates);
    await logActivity({
      action_type: "candidate_updated",
      candidate_id: candidate.id,
      metadata: { changes, fields_updated: Object.keys(updates) },
    });
    setEditing(false);
    toast.success(`Updated: ${changes.length} field${changes.length > 1 ? "s" : ""} changed`);
  };

  const handleCancel = () => {
    const hasChanges = Object.entries(form).some(([key, val]) => {
      if (key === "salary_current") return val !== (candidate.salary_current?.toString() || "");
      return val !== ((candidate as any)[key] || "");
    });
    if (hasChanges) {
      setDiscardOpen(true);
    } else {
      setEditing(false);
    }
  };

  // Click-to-edit single field
  const handleInlineClick = (field: string, value: string) => {
    if (editing) return;
    setInlineField(field);
    setInlineValue(value);
  };

  const handleInlineSave = async (field: string) => {
    const oldVal = (candidate as any)[field] || "";
    if (inlineValue === oldVal) {
      setInlineField(null);
      return;
    }
    const label = field.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const updates: any = { [field]: inlineValue || null };
    if (field === "salary_current") updates[field] = inlineValue ? parseInt(inlineValue) : null;
    if (field === "name") {
      const parts = inlineValue.trim().split(/\s+/);
      updates.first_name = parts[0];
      updates.last_name = parts.slice(1).join(" ") || null;
    }
    await onUpdate(updates);
    await logActivity({
      action_type: "candidate_updated",
      candidate_id: candidate.id,
      metadata: { changes: [`${label}: ${oldVal || "—"} → ${inlineValue || "—"}`], fields_updated: [field] },
    });
    setInlineField(null);
    toast.success(`${label} updated`);
  };

  const renderField = (field: string, label: string, value: string, type?: string) => {
    if (editing) {
      return (
        <div>
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Input
            value={(form as any)[field]}
            onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))}
            type={type || "text"}
            className="h-8 text-sm"
          />
        </div>
      );
    }
    if (inlineField === field) {
      return (
        <div>
          <span className="text-xs text-muted-foreground">{label}:</span>
          <Input
            autoFocus
            value={inlineValue}
            onChange={(e) => setInlineValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInlineSave(field);
              if (e.key === "Escape") setInlineField(null);
            }}
            onBlur={() => handleInlineSave(field)}
            className="h-7 text-sm mt-0.5"
            type={type || "text"}
          />
        </div>
      );
    }
    return (
      <div
        className="cursor-pointer group/field hover:bg-muted/30 rounded px-1 -mx-1 py-0.5"
        onClick={() => handleInlineClick(field, value)}
        title="Click to edit"
      >
        <span className="text-muted-foreground text-xs">{label}:</span>{" "}
        <span className="text-sm">{value || "—"}</span>
      </div>
    );
  };

  const hints = !editing ? [] : getHints(form);

  return (
    <div className="space-y-6">
      {/* Header with edit/save/cancel */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="text-xl font-semibold h-auto py-1" />
            </div>
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
              <Button size="sm" onClick={handleSave} className="gap-1.5" disabled={updateCandidate.isPending}>
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={handleStartEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
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
              <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      </div>

      {/* Fields */}
      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          {renderField("job_title", "Job Title", form.job_title)}
          {renderField("current_employer", "Employer", form.current_employer)}
          {renderField("location", "Location", form.location)}
          {renderField("email", "Email", form.email, "email")}
          {renderField("phone", "Phone", form.phone)}
          {renderField("linkedin_url", "LinkedIn URL", form.linkedin_url)}
          {renderField("salary_current", "Current Salary (£)", form.salary_current, "number")}
          {renderField("availability", "Availability / Notice", form.availability)}
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm(f => ({ ...f, source: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {renderField("email", "Email", candidate.email || "")}
          {renderField("phone", "Phone", candidate.phone || "")}
          {renderField("location", "Location", candidate.location || "")}
          {renderField("source", "Source", candidate.source || "")}
          {renderField("salary_current", "Salary", candidate.salary_current ? `£${candidate.salary_current.toLocaleString()}` : "")}
          {renderField("availability", "Availability", candidate.availability || "")}
          {candidate.linkedin_url && (
            <div className="col-span-2">
              <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-sm">
                <ExternalLink className="h-3 w-3" /> LinkedIn Profile
              </a>
            </div>
          )}
        </div>
      )}

      {/* Hints */}
      {hints.length > 0 && (
        <div className="space-y-1">
          {hints.map((h, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-yellow-400" /> {h}
            </p>
          ))}
        </div>
      )}

      {/* Bottom save/cancel when editing */}
      {editing && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button size="sm" onClick={handleSave} className="gap-1.5" disabled={updateCandidate.isPending}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
          <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      )}

      {/* Status badge when not editing */}
      {!editing && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={statusColor[candidate.status]}>{candidate.status}</Badge>
        </div>
      )}

      <CandidateJobLinks candidateId={candidate.id} />
      <NotesSection entityType="candidate" entityId={candidate.id} />
      <LogTouchpointModal
        open={touchpointOpen}
        onOpenChange={setTouchpointOpen}
        entityType="candidate"
        entityId={candidate.id}
        entityName={candidate.name}
      />

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
    </div>
  );
}
