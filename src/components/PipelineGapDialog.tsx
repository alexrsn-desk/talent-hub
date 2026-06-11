import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, ExternalLink, Search, Users, Snowflake, Target, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { PipelineGapData } from "@/hooks/use-billers-workflow";

export function PipelineGapDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: PipelineGapData | null;
}) {
  const nav = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!data) return null;

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "LinkedIn search string copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Select the text and copy manually." });
    }
  };

  const hasReady = data.readyNow.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {data.jobTitle} at {data.company}
          </DialogTitle>
          <div className="text-xs text-muted-foreground">
            {data.currentCount} candidate{data.currentCount === 1 ? "" : "s"} in pipeline ·
            {" "}role open {data.weeksOpen}w · last added {data.daysSinceLastAdd >= 9000 ? "—" : `${data.daysSinceLastAdd}d ago`}
          </div>
        </DialogHeader>

        {data.escalated && (
          <div className="border border-red-500/40 bg-red-500/5 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-red-300">
                Sourcing prompt has been live {data.promptShownDays}d — no new candidates added in {data.daysSinceLastAdd}d.
              </div>
              <div className="text-muted-foreground mt-0.5">Today — source for this role before anything else.</div>
            </div>
          </div>
        )}

        {/* STEP 1 — SEND NOW */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Step 1 — Send now</div>
          {hasReady ? (
            <>
              <div className="text-sm text-muted-foreground">
                {data.jobTitle} at {data.company} needs more CVs. Ready to send now:
              </div>
              <div className="border border-border rounded-lg divide-y divide-border">
                {data.readyNow.map((m) => (
                  <label key={m.candidateId} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer">
                    <Checkbox
                      checked={selected.has(m.candidateId)}
                      onCheckedChange={() => toggle(m.candidateId)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.reason}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="text-xs text-muted-foreground">
                  Passive review starts immediately. {selected.size} selected.
                </div>
                <Button
                  size="sm"
                  disabled={selected.size === 0}
                  onClick={() => {
                    onOpenChange(false);
                    nav(`/jobs`);
                    toast({ title: "Open the job pipeline", description: "Add these candidates to Shortlist and send." });
                  }}
                >
                  Send CVs ({selected.size})
                </Button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              No ready matches in your database for this role. Step 2 below.
            </div>
          )}
        </div>

        {/* STEP 2 — PROACTIVE SOURCING */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Step 2 — Proactive sourcing needed
          </div>
          <div className="text-sm">
            <span className="font-medium">{data.jobTitle} at {data.company}</span> needs fresh candidates.
            Your database has been exhausted for this role. Proactive sourcing required.
          </div>

          {/* WHAT TO LOOK FOR */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">What to look for</div>
            {data.keyCriteria.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {data.keyCriteria.map((c) => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-foreground">
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No tags on this job yet — add tags for better targeting.</div>
            )}
          </div>

          {/* WHERE TO SOURCE */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Where to source</div>

            {/* 1. LinkedIn network */}
            <div className="border border-border rounded-lg p-3 flex items-start gap-3">
              <Users className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">LinkedIn connections matching profile</div>
                <div className="text-xs text-muted-foreground">Search your network for the criteria above</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                const q = encodeURIComponent(data.keyCriteria.slice(0, 3).join(" "));
                window.open(`https://www.linkedin.com/search/results/people/?network=%5B%22F%22%5D&keywords=${q}`, "_blank");
              }}>
                <ExternalLink className="h-3 w-3 mr-1" /> Open
              </Button>
            </div>

            {/* 2. Cold candidates */}
            <div className="border border-border rounded-lg p-3 flex items-start gap-3">
              <Snowflake className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Cold candidates in talent pool</div>
                <div className="text-xs text-muted-foreground">
                  {data.coldPoolCount} candidate{data.coldPoolCount === 1 ? "" : "s"} matching this role, not contacted 8+ weeks
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); nav("/candidates"); }}>
                Re-engage
              </Button>
            </div>

            {/* 3. Silver medallists */}
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-start gap-3">
                <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Silver medallists</div>
                  {data.silverMedallists.length > 0 ? (
                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {data.silverMedallists.map((m) => (
                        <li key={m.candidateId}>• {m.name} — {m.reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-muted-foreground">No recent silver medallists matching this role.</div>
                  )}
                </div>
                {data.silverMedallists.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); nav("/jobs"); }}>
                    Add to pipeline
                  </Button>
                )}
              </div>
            </div>

            {/* 4. LinkedIn search string */}
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-start gap-3">
                <Search className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Suggested LinkedIn search</div>
                  <div className="text-xs font-mono break-all bg-muted/40 rounded px-2 py-1 mt-1">
                    {data.linkedinSearch}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(data.linkedinSearch)}>
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
            </div>
          </div>

          {/* TARGET */}
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3">
            <div className="text-xs uppercase tracking-wide text-amber-300 font-semibold">Your target this week</div>
            <div className="text-sm mt-1 font-medium">
              {data.sourcingTarget} new candidate{data.sourcingTarget === 1 ? "" : "s"} into screening
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Not a nice to have. A thin pipeline is a missed placement. Top billers are always sourcing — proactively, not when desperate.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
