import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobs } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Rocket, Plus, Search, ArrowRight, MoreVertical, CheckCircle2, XCircle, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { LaunchStatusSection } from "@/components/LaunchStatusSection";

export default function JobLaunchSelector() {
  const nav = useNavigate();
  const { data: jobs = [], isLoading, refetch } = useJobs();
  const [q, setQ] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const [statusJob, setStatusJob] = useState<any>(null);
  const [ignoreJob, setIgnoreJob] = useState<any>(null);
  const [ignoreReason, setIgnoreReason] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (jobs as any[])
      .filter((j) => j.status === "Active")
      .filter((j) => showIgnored ? true : !j.launch_ignored_at)
      .filter((j) => !s || j.title?.toLowerCase().includes(s) || j.clients?.company_name?.toLowerCase().includes(s))
      .sort((a, b) => Number(!!a.search_launched_at || !!a.launch_ignored_at) - Number(!!b.search_launched_at || !!b.launch_ignored_at));
  }, [jobs, q, showIgnored]);

  async function ignoreLaunch(jobId: string, reason: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("jobs").update({
      launch_ignored_at: new Date().toISOString(),
      launch_ignored_reason: reason || null,
      launch_ignored_by: user?.id ?? null,
    } as any).eq("id", jobId);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked as ignored");
    setIgnoreJob(null);
    setIgnoreReason("");
    refetch();
  }

  async function unignoreLaunch(jobId: string) {
    const { error } = await supabase.from("jobs").update({
      launch_ignored_at: null,
      launch_ignored_reason: null,
      launch_ignored_by: null,
    } as any).eq("id", jobId);
    if (error) { toast.error(error.message); return; }
    toast.success("Re-added to launch queue");
    refetch();
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Rocket className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Which job are you launching?</h1>
          <p className="text-sm text-muted-foreground">Pick a job to start the launch workflow, or create a new one.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search active jobs…" className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setShowIgnored((v) => !v)}>
          {showIgnored ? "Hide ignored" : "Show ignored"}
        </Button>
        <Button variant="outline" onClick={() => nav("/jobs")}>
          <Plus className="h-4 w-4 mr-1" /> Create new job
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No active jobs. Create one to get started.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((j: any) => (
            <Card key={j.id} className="p-4 hover:border-primary/40 transition-colors flex items-center gap-3">
              <button
                onClick={() => nav(`/jobs/${j.id}/launch`)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="font-medium truncate">{j.title}</div>
                <div className="text-xs text-muted-foreground truncate">{j.clients?.company_name || "—"}</div>
              </button>
              {j.launch_ignored_at ? (
                <Badge variant="outline" className="text-muted-foreground border-muted-foreground/40">Ignored</Badge>
              ) : !j.search_launched_at ? (
                <Badge variant="outline" className="text-amber-400 border-amber-500/40">Not launched</Badge>
              ) : (
                <Badge variant="outline" className="text-green-400 border-green-500/40">Launched</Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setStatusJob(j)}>
                    <ListChecks className="h-4 w-4 mr-2" /> Launch status
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => nav(`/jobs/${j.id}/launch`)}>
                    <Rocket className="h-4 w-4 mr-2" /> Open launch wizard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {j.launch_ignored_at ? (
                    <DropdownMenuItem onClick={() => unignoreLaunch(j.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Un-ignore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => { setIgnoreJob(j); setIgnoreReason(""); }}>
                      <XCircle className="h-4 w-4 mr-2" /> Ignore launch
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <button onClick={() => nav(`/jobs/${j.id}/launch`)} aria-label="Open">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!statusJob} onOpenChange={(o) => !o && setStatusJob(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Launch status — {statusJob?.title}</DialogTitle>
            <DialogDescription>
              Tick items as done — through the wizard or off-platform. Manual ticks let you add a quick note.
            </DialogDescription>
          </DialogHeader>
          {statusJob && <LaunchStatusSection jobId={statusJob.id} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!ignoreJob} onOpenChange={(o) => !o && setIgnoreJob(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ignore launch for this job?</DialogTitle>
            <DialogDescription>
              It'll stop appearing as an outstanding launch. Add a quick reason (optional).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={ignoreReason}
            onChange={(e) => setIgnoreReason(e.target.value)}
            placeholder="e.g. sourced entirely off-platform"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIgnoreJob(null)}>Cancel</Button>
            <Button onClick={() => ignoreJob && ignoreLaunch(ignoreJob.id, ignoreReason.trim())}>
              Ignore launch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
