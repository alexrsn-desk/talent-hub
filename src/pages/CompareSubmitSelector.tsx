import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobs } from "@/hooks/use-data";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Columns, Search, ArrowRight } from "lucide-react";

export default function CompareSubmitSelector() {
  const nav = useNavigate();
  const { data: jobs = [], isLoading } = useJobs();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (jobs as any[])
      .filter((j) => j.status === "Active")
      .filter((j) => !s || j.title?.toLowerCase().includes(s) || j.clients?.company_name?.toLowerCase().includes(s));
  }, [jobs, q]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Columns className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Which role are you submitting for?</h1>
          <p className="text-sm text-muted-foreground">Pick a job to run Compare &amp; Submit.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search active jobs…" className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No active jobs.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((j: any) => (
            <button key={j.id} onClick={() => nav(`/jobs/${j.id}/compare`)} className="w-full text-left">
              <Card className="p-4 hover:border-primary/40 transition-colors flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{j.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{j.clients?.company_name || "—"}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
