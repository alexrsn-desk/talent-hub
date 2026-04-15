import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUpdateCandidate, useCreateNote, type Candidate } from "@/hooks/use-data";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";

const STATUSES = ["New", "Contacted", "Screening", "Submitted", "Interviewing", "Placed", "On Hold", "Not Suitable"] as const;

interface QuickEditProps {
  candidate: Candidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CandidateQuickEdit({ candidate, open, onOpenChange }: QuickEditProps) {
  const updateCandidate = useUpdateCandidate();
  const createNote = useCreateNote();
  const [form, setForm] = useState(() => ({
    status: candidate.status,
    current_employer: candidate.current_employer || "",
    job_title: candidate.job_title || "",
    salary_current: candidate.salary_current?.toString() || "",
    availability: candidate.availability || "",
    quickNote: "",
  }));

  const handleSave = async () => {
    const updates: Partial<Candidate> = {};
    const changes: string[] = [];

    if (form.status !== candidate.status) {
      updates.status = form.status;
      changes.push(`Status: ${candidate.status} → ${form.status}`);
    }
    if (form.current_employer !== (candidate.current_employer || "")) {
      updates.current_employer = form.current_employer || null;
      changes.push(`Employer: ${candidate.current_employer || "—"} → ${form.current_employer || "—"}`);
    }
    if (form.job_title !== (candidate.job_title || "")) {
      updates.job_title = form.job_title || null;
      changes.push(`Job title: ${candidate.job_title || "—"} → ${form.job_title || "—"}`);
    }
    const newSalary = form.salary_current ? parseInt(form.salary_current) : null;
    if (newSalary !== candidate.salary_current) {
      updates.salary_current = newSalary;
      changes.push(`Salary: ${candidate.salary_current ? `£${candidate.salary_current.toLocaleString()}` : "—"} → ${newSalary ? `£${newSalary.toLocaleString()}` : "—"}`);
    }
    if (form.availability !== (candidate.availability || "")) {
      updates.availability = form.availability || null;
      changes.push(`Availability: ${candidate.availability || "—"} → ${form.availability || "—"}`);
    }

    if (Object.keys(updates).length > 0) {
      await updateCandidate.mutateAsync({ id: candidate.id, ...updates });
      await logActivity({
        action_type: "candidate_updated",
        candidate_id: candidate.id,
        metadata: { changes, fields_updated: Object.keys(updates) },
      });
    }

    if (form.quickNote.trim()) {
      await createNote.mutateAsync({
        content: form.quickNote.trim(),
        candidate_id: candidate.id,
        activity_type: "Note",
      });
    }

    toast.success(changes.length > 0 ? "Candidate updated" : "Note added");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle className="text-base">{candidate.name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Current Employer</Label>
            <Input value={form.current_employer} onChange={(e) => setForm(f => ({ ...f, current_employer: e.target.value }))} className="h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Job Title</Label>
            <Input value={form.job_title} onChange={(e) => setForm(f => ({ ...f, job_title: e.target.value }))} className="h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Current Salary (£)</Label>
            <Input type="number" value={form.salary_current} onChange={(e) => setForm(f => ({ ...f, salary_current: e.target.value }))} className="h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Availability / Notice</Label>
            <Input value={form.availability} onChange={(e) => setForm(f => ({ ...f, availability: e.target.value }))} placeholder="e.g. 1 month notice" className="h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Quick Note</Label>
            <Textarea
              value={form.quickNote}
              onChange={(e) => setForm(f => ({ ...f, quickNote: e.target.value }))}
              placeholder="Add a quick note..."
              className="min-h-[60px] text-sm"
            />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={updateCandidate.isPending}>
            {updateCandidate.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
