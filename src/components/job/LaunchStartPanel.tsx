import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Rocket, Wand2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JobSpecUploader } from "@/components/JobSpecUploader";
import { AddJobDialog } from "@/components/AddJobDialog";
import { matchInstruction } from "@/components/job/LaunchQuickStart";

type Field = "description" | "intake_summary" | "launch_hook" | "ideal_candidate_line";
export const REQUIRED_INFO: { key: Field; label: string; hint: string }[] = [
  { key: "description", label: "Job spec", hint: "Upload or paste the spec" },
  { key: "intake_summary", label: "Intake call notes", hint: "What the client told you on the intake call" },
  { key: "launch_hook", label: "Why it's interesting", hint: "The real sell beyond the title" },
  { key: "ideal_candidate_line", label: "Ideal candidate", hint: "One line describing who you want" },
];

/** Which launch info a job is still missing. */
export function missingInfo(job: Partial<Record<Field, string | null>>): Field[] {
  return REQUIRED_INFO.filter((f) => !(job[f.key] ?? "").toString().trim()).map((f) => f.key);
}

export function LaunchStartPanel({ jobs, onSaved }: { jobs: any[]; onSaved: () => void }) {
  const nav = useNavigate();
  const [jobId, setJobId] = useState("");
  const [preset, setPreset] = useState("none");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<Record<Field, string>>({ description: "", intake_summary: "", launch_hook: "", ideal_candidate_line: "" });
  const [saving, setSaving] = useState(false);

  const live = useMemo(() => jobs.filter((j) => j.status === "Active"), [jobs]);
  const job = live.find((j) => j.id === jobId);
  const missing = job ? missingInfo(job) : [];

  useEffect(() => {
    if (job) setDraft({ description: job.description || "", intake_summary: job.intake_summary || "", launch_hook: job.launch_hook || "", ideal_candidate_line: job.ideal_candidate_line || "" });
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const presets = useQuery({
    queryKey: ["job-launch-presets"],
    queryFn: async () => (await supabase.from("job_launch_presets").select("id, name").order("use_count", { ascending: false })).data ?? [],
  });
  const presetOpts = (presets.data ?? []).map((p: any) => ({ key: `p:${p.id}`, label: p.name }));
  const pastOpts = live.filter((j) => j.search_launched_at && j.id !== jobId)
    .map((j) => ({ key: `j:${j.id}`, label: `${j.title}${j.clients?.company_name ? ` · ${j.clients.company_name}` : ""}` }));

  async function saveMissing() {
    if (!job) return false;
    const updates: Record<string, string> = {};
    for (const f of missing) if (draft[f].trim()) updates[f] = draft[f].trim();
    if (!Object.keys(updates).length) return true;
    setSaving(true);
    const { error } = await supabase.from("jobs").update(updates as any).eq("id", job.id);
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    onSaved();
    return true;
  }

  async function go(targetJob = jobId, presetKey = preset) {
    if (!targetJob) { toast.error("Pick a job first"); return; }
    if (targetJob === jobId && !(await saveMissing())) return;
    const qs = presetKey && presetKey !== "none" ? `?preset=${encodeURIComponent(presetKey)}&run=1` : "";
    nav(`/jobs/${targetJob}/launch${qs}`);
  }

  function runInstruction() {
    const jobKey = matchInstruction(instruction, live.map((j) => ({ key: j.id, label: `${j.title} ${j.clients?.company_name ?? ""}` })));
    const presetKey = matchInstruction(instruction, presetOpts);
    const target = jobKey ?? jobId;
    if (!target) { toast.error("Which job? Try including the job title."); return; }
    setJobId(target);
    const t = live.find((j) => j.id === target);
    if (t && missingInfo(t).length) {
      if (presetKey) setPreset(presetKey);
      toast.info("This job needs a bit more info before it can launch — fill in the highlighted fields.");
      return;
    }
    go(target, presetKey ?? "none");
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center gap-2 font-semibold"><Rocket className="h-4 w-4 text-primary" /> Quick launch</div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); runInstruction(); }}>
        <Input value={instruction} onChange={(e) => setInstruction(e.target.value)}
          placeholder={`Just say it: "launch the standard tech search for the React Engineer job"`} />
        <Button type="submit" variant="secondary" className="gap-1"><Wand2 className="h-4 w-4" /> Go</Button>
      </form>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select value={jobId} onValueChange={setJobId}>
          <SelectTrigger><SelectValue placeholder="1. Pick a live job…" /></SelectTrigger>
          <SelectContent>
            {live.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.title}{j.clients?.company_name ? ` · ${j.clients.company_name}` : ""}</SelectItem>
            ))}
            {live.length === 0 && <div className="p-2 text-xs text-muted-foreground">No live jobs yet</div>}
          </SelectContent>
        </Select>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger><SelectValue placeholder="2. Launch style" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Start fresh</SelectItem>
            {presetOpts.length > 0 && <SelectGroup><SelectLabel>Saved presets</SelectLabel>
              {presetOpts.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectGroup>}
            {pastOpts.length > 0 && <SelectGroup><SelectLabel>Copy a previous launch</SelectLabel>
              {pastOpts.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectGroup>}
          </SelectContent>
        </Select>
        <AddJobDialog />
      </div>

      {job && (
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
          {missing.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" /> Everything's in place for this job.</p>
          ) : (
            <p className="flex items-center gap-2 text-sm"><AlertCircle className="h-4 w-4 text-destructive" /> Add {missing.length === 1 ? "this" : "these"} before launching:</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {REQUIRED_INFO.map((f) => (
              <span key={f.key} className={`rounded-full px-2 py-0.5 ${missing.includes(f.key) ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
                {missing.includes(f.key) ? "○" : "✓"} {f.label}
              </span>
            ))}
          </div>
          {missing.map((f) => {
            const info = REQUIRED_INFO.find((r) => r.key === f)!;
            if (f === "description") return (
              <JobSpecUploader key={f} value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))}
                label="Job spec" rows={5} placeholder="Upload a PDF/Word/TXT, or paste the spec…" />
            );
            return (
              <div key={f}>
                <Label className="text-xs">{info.label}</Label>
                {f === "ideal_candidate_line"
                  ? <Input value={draft[f]} placeholder={info.hint} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />
                  : <Textarea rows={3} value={draft[f]} placeholder={info.hint} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />}
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button onClick={() => go()} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {missing.length ? "Save & launch" : "Launch"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
