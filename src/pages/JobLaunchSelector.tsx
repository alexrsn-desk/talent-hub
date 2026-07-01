import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobs } from "@/hooks/use-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, Plus, Search, ArrowRight } from "lucide-react";
import { AddJobDialog } from "@/components/AddJobDialog";

export default function JobLaunchSelector() {
  const nav = useNavigate();
  const { data: jobs = [], isLoading } = useJobs();
  const [q, setQ] = useState("");
  const [openAdd, setOpenAdd] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (jobs as any[])
      .filter((j) => j.status === "Active")
      .filter((j) => !s || j.title?.toLowerCase().includes(s) || j.clients?.company_name?.toLowerCase().includes(s))
      .sort((a, b) => Number(!!a.search_launched_at) - Number(!!b.search_launched_at));
  }, [jobs, q]);

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
        <Button variant="outline" onClick={() => setOpenAdd(true)}>
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
            <button
              key={j.id}
              onClick={() => nav(`/jobs/${j.id}/launch`)}
              className="w-full text-left"
            >
              <Card className="p-4 hover:border-primary/40 transition-colors flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{j.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{j.clients?.company_name || "—"}</div>
                </div>
                {!j.search_launched_at ? (
                  <Badge variant="outline" className="text-amber-400 border-amber-500/40">Not launched</Badge>
                ) : (
                  <Badge variant="outline" className="text-green-400 border-green-500/40">Launched</Badge>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </button>
          ))}
        </div>
      )}

      <AddJobDialog open={openAdd} onOpenChange={setOpenAdd} onCreated={(id) => nav(`/jobs/${id}/launch`)} />
    </div>
  );
}
