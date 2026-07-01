import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCandidates } from "@/hooks/use-data";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Target, Search, ArrowRight } from "lucide-react";

export default function PitchCandidateSelector() {
  const nav = useNavigate();
  const { data: candidates = [], isLoading } = useCandidates();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (candidates as any[]).filter((c) =>
      !s ||
      c.name?.toLowerCase().includes(s) ||
      c.job_title?.toLowerCase().includes(s) ||
      c.current_employer?.toLowerCase().includes(s),
    );
    return list.slice(0, 100);
  }, [candidates, q]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Target className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Which candidate are you pitching to the market?</h1>
          <p className="text-sm text-muted-foreground">Pick a candidate to find opportunities for.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates…" className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No candidates found.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c: any) => (
            <button key={c.id} onClick={() => nav(`/candidates/${c.id}/pitch`)} className="w-full text-left">
              <Card className="p-4 hover:border-primary/40 transition-colors flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.job_title, c.current_employer].filter(Boolean).join(" · ") || "—"}
                  </div>
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
