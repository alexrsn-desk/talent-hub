import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClickToEditField } from "@/components/ClickToEditField";
import { JobSpecUploader } from "@/components/JobSpecUploader";
import { TagsSection } from "@/components/TagsSection";
import type { Job } from "@/hooks/use-data";

const JOB_STATUSES = ["Active", "On Hold", "Filled", "Closed"] as const;
const JOB_TYPES = ["Perm", "Contract"] as const;
const FEE_TYPES = ["Percentage", "Fixed"] as const;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4 space-y-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Auto-saving text field — saves on blur, same pattern used elsewhere in the app. */
function BlurSaveField({
  label,
  hint,
  value,
  rows,
  placeholder,
  onSave,
}: {
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = async () => {
    if (draft.trim() === value.trim()) return;
    try {
      await onSave(draft.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e: any) {
      toast.error(e?.message || `Failed to save ${label}`);
      setDraft(value);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">{label}</label>
        {saved && <span className="text-[11px] text-green-400 flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
      </div>
      {rows ? (
        <Textarea rows={rows} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} className="text-sm" />
      ) : (
        <Input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} className="text-sm" />
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function JobDetailsTab({ job, onUpdate }: { job: Job; onUpdate: (u: Partial<Job>) => Promise<void> }) {
  const j = job as any;

  const saveField = async (field: string, value: string) => {
    const numeric = ["salary_min", "salary_max", "fee_value", "headcount"];
    await onUpdate({ [field]: numeric.includes(field) ? (value ? Number(value) : null) : value || null } as any);
  };

  const saveList = (field: "key_skills" | "similar_titles") => async (v: string) => {
    const arr = v.split(",").map((s) => s.trim()).filter(Boolean);
    await onUpdate({ [field]: arr } as any);
  };

  const displayStatus = job.status === "Open" ? "Active" : job.status === "Cancelled" ? "Closed" : job.status;

  return (
    <div className="space-y-4">
      <Section title="Role">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <ClickToEditField label="Job title" value={job.title} field="title" layout="stacked" onSave={(v) => saveField("title", v)} entityType="job" entityId={job.id} />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground block">Client</span>
            <span className="text-sm">{(job.clients as any)?.company_name || "—"}</span>
          </div>
          <ClickToEditField label="Location" value={job.location || ""} field="location" layout="stacked" onSave={(v) => saveField("location", v)} entityType="job" entityId={job.id} />
          <ClickToEditField label="Salary min (£)" value={job.salary_min?.toString() || ""} field="salary_min" type="number" layout="stacked" onSave={(v) => saveField("salary_min", v)} entityType="job" entityId={job.id} />
          <ClickToEditField label="Salary max (£)" value={job.salary_max?.toString() || ""} field="salary_max" type="number" layout="stacked" onSave={(v) => saveField("salary_max", v)} entityType="job" entityId={job.id} />
          <ClickToEditField label="Headcount" value={(j.headcount ?? 1).toString()} field="headcount" type="number" layout="stacked" onSave={(v) => saveField("headcount", v)} entityType="job" entityId={job.id} />
          <ClickToEditField label="Status" value={displayStatus} field="status" options={JOB_STATUSES} layout="stacked" onSave={(v) => saveField("status", v)} entityType="job" entityId={job.id} />
          <ClickToEditField label="Type" value={job.job_type} field="job_type" options={JOB_TYPES} layout="stacked" onSave={(v) => saveField("job_type", v)} entityType="job" entityId={job.id} />
        </div>
      </Section>

      <Section title="Fee">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <ClickToEditField label="Fee type" value={job.fee_type || ""} field="fee_type" options={FEE_TYPES} layout="stacked" onSave={(v) => saveField("fee_type", v)} entityType="job" entityId={job.id} />
          <ClickToEditField label="Fee value" value={job.fee_value?.toString() || ""} field="fee_value" type="number" layout="stacked" onSave={(v) => saveField("fee_value", v)} entityType="job" entityId={job.id} />
        </div>
      </Section>

      <Section title="Job spec" hint="Upload a document to extract the text, or paste it directly. Saving re-matches candidates from your database.">
        <JobSpecSaver job={job} onUpdate={onUpdate} />
      </Section>

      <Section title="Briefing context" hint="The single source of truth for search matching — used by Job Launch and candidate matching.">
        <div className="space-y-4">
          <BlurSaveField label="What makes this role interesting" value={j.launch_hook || ""} rows={3} placeholder="The hook you'd use with candidates…" onSave={(v) => saveField("launch_hook", v)} />
          <BlurSaveField label="Ideal candidate" value={j.ideal_candidate_line || ""} rows={2} placeholder="One line describing the person who lands this…" onSave={(v) => saveField("ideal_candidate_line", v)} />
          <BlurSaveField label="Similar job titles" hint="Comma separated" value={(j.similar_titles || []).join(", ")} onSave={saveList("similar_titles")} placeholder="Product Designer, UX Designer" />
          <BlurSaveField label="Key skills" hint="Comma separated" value={(j.key_skills || []).join(", ")} onSave={saveList("key_skills")} placeholder="Figma, service design, research" />
          <BlurSaveField label="Additional context" value={j.additional_context || ""} rows={4} placeholder="Anything else that helps matching and outreach…" onSave={(v) => saveField("additional_context", v)} />
        </div>
      </Section>

      <TagsSection entityType="job" entityId={job.id} />
    </div>
  );
}

function JobSpecSaver({ job, onUpdate }: { job: Job; onUpdate: (u: Partial<Job>) => Promise<void> }) {
  const initial = (job as any).description || "";
  const [value, setValue] = useState<string>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setValue(initial); }, [initial]);

  const dirty = value.trim() !== initial.trim();

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate({ description: value.trim() || null } as any);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      if (value.trim()) toast.success("Job spec saved — finding matching candidates");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save job spec");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <JobSpecUploader value={value} onChange={setValue} label="Job spec document" rows={8} />
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-xs text-green-400 flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : initial ? "Update job spec" : "Save job spec"}
        </Button>
      </div>
    </div>
  );
}
