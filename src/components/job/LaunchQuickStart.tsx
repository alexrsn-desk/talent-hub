import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, Wand2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export type LaunchBlueprint = {
  label: string;
  launch_hook?: string | null;
  ideal_candidate_line?: string | null;
  similar_titles?: string[] | null;
  key_skills?: string[] | null;
  campaign_subject?: string | null;
  campaign_body?: string | null;
  linkedin_post?: string | null;
  send_client_email?: boolean | null;
  presetId?: string;
};

type Option = LaunchBlueprint & { key: string; kind: "preset" | "job" };

/** Pick the option a plain-language instruction refers to ("launch the standard launch", "same as the React job"). */
export function matchInstruction(text: string, options: { key: string; label: string }[]): string | null {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !["launch", "the", "for", "job", "search", "same", "use", "run", "like", "from", "please", "with"].includes(w));
  if (!words.length) return null;
  let best: { key: string; score: number } | null = null;
  for (const o of options) {
    const l = o.label.toLowerCase();
    const score = words.filter((w) => l.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { key: o.key, score };
  }
  return best?.key ?? null;
}

export function LaunchQuickStart({
  jobId, onApply, current, initialKey, autoRunInitial,
}: {
  jobId: string;
  initialKey?: string | null;
  autoRunInitial?: boolean;
  onApply: (b: LaunchBlueprint, autoRun: boolean) => void;
  current: LaunchBlueprint;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);

  const presets = useQuery({
    queryKey: ["job-launch-presets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_launch_presets").select("*").order("use_count", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pastJobs = useQuery({
    queryKey: ["launched-jobs", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs")
        .select("id, title, launch_hook, ideal_candidate_line, similar_titles, key_skills, clients(company_name)")
        .not("search_launched_at", "is", null).neq("id", jobId)
        .order("search_launched_at", { ascending: false }).limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });

  const options: Option[] = useMemo(() => [
    ...(presets.data ?? []).map((p: any) => ({
      key: `p:${p.id}`, kind: "preset" as const, presetId: p.id, label: p.name,
      launch_hook: p.launch_hook, ideal_candidate_line: p.ideal_candidate_line, similar_titles: p.similar_titles,
      key_skills: p.key_skills, campaign_subject: p.campaign_subject, campaign_body: p.campaign_body,
      linkedin_post: p.linkedin_post, send_client_email: p.send_client_email,
    })),
    ...(pastJobs.data ?? []).map((j: any) => ({
      key: `j:${j.id}`, kind: "job" as const,
      label: `${j.title}${j.clients?.company_name ? ` · ${j.clients.company_name}` : ""}`,
      launch_hook: j.launch_hook, ideal_candidate_line: j.ideal_candidate_line,
      similar_titles: j.similar_titles, key_skills: j.key_skills,
    })),
  ], [presets.data, pastJobs.data]);

  const appliedInitial = useRef(false);
  useEffect(() => {
    if (appliedInitial.current || !initialKey || !options.some((o) => o.key === initialKey)) return;
    appliedInitial.current = true;
    setSelected(initialKey);
    apply(initialKey, !!autoRunInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, options]);

  async function apply(key: string, autoRun: boolean) {
    const o = options.find((x) => x.key === key);
    if (!o) return;
    onApply(o, autoRun);
    if (o.presetId) {
      const p: any = presets.data?.find((x: any) => x.id === o.presetId);
      await supabase.from("job_launch_presets").update({ use_count: (p?.use_count ?? 0) + 1 }).eq("id", o.presetId);
    }
    toast.success(`Using "${o.label}"`);
  }

  function runInstruction() {
    const key = matchInstruction(instruction, options);
    if (!key) { toast.error("Couldn't find a saved launch matching that. Try the preset or job name."); return; }
    setSelected(key);
    apply(key, true);
  }

  async function savePreset() {
    const name = window.prompt("Name this launch preset (e.g. Standard tech search)");
    if (!name?.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("job_launch_presets").insert({
      name: name.trim(), source_job_id: jobId,
      launch_hook: current.launch_hook, ideal_candidate_line: current.ideal_candidate_line,
      similar_titles: current.similar_titles ?? [], key_skills: current.key_skills ?? [],
      campaign_subject: current.campaign_subject || null, campaign_body: current.campaign_body || null,
      linkedin_post: current.linkedin_post || null, send_client_email: current.send_client_email ?? true,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["job-launch-presets"] });
    toast.success("Preset saved — pick it from the dropdown next time");
  }

  const presetOpts = options.filter((o) => o.kind === "preset");
  const jobOpts = options.filter((o) => o.kind === "job");

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Rocket className="h-4 w-4 text-primary" /> Quick launch</div>
      <div className="flex flex-wrap gap-2">
        <Select value={selected} onValueChange={(v) => { setSelected(v); apply(v, false); }}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Use a saved launch or copy a past job…" /></SelectTrigger>
          <SelectContent>
            {presetOpts.length > 0 && (
              <SelectGroup><SelectLabel>Saved presets</SelectLabel>
                {presetOpts.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
              </SelectGroup>
            )}
            {jobOpts.length > 0 && (
              <SelectGroup><SelectLabel>Copy a previous launch</SelectLabel>
                {jobOpts.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
              </SelectGroup>
            )}
            {options.length === 0 && <div className="p-2 text-xs text-muted-foreground">No saved launches yet — save this one when you're done.</div>}
          </SelectContent>
        </Select>
        <Button disabled={!selected} onClick={() => apply(selected, true)} className="gap-1">
          <Rocket className="h-4 w-4" /> Use & find candidates
        </Button>
        <Button variant="outline" onClick={savePreset} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save as preset
        </Button>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); runInstruction(); }}>
        <Input value={instruction} onChange={(e) => setInstruction(e.target.value)}
          placeholder={`Or just say it: "launch the standard tech search"`} />
        <Button type="submit" variant="secondary" className="gap-1"><Wand2 className="h-4 w-4" /> Go</Button>
      </form>
    </div>
  );
}
