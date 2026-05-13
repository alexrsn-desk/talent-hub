import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEnrichmentUsage } from "@/hooks/use-company-intel";

type Client = { id: string; company_name: string; status?: string };

const DAILY_LIMIT = 100;

export function BulkEnrichDialog({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const qc = useQueryClient();
  const { data: usage } = useEnrichmentUsage();

  // Prioritise: BD pipeline / Active first, then Warm, Target, Cold
  const order = ["Active", "Warm", "Target", "Cold"];
  const prioritised = [...clients].sort(
    (a, b) => (order.indexOf(a.status || "") + 99) - (order.indexOf(b.status || "") + 99)
  );

  const run = async () => {
    setRunning(true); setErrors([]); setDone(0);
    const queue = prioritised.slice(0, DAILY_LIMIT);
    setTotal(queue.length);
    for (const c of queue) {
      try {
        const { data, error } = await supabase.functions.invoke("enrich-company", {
          body: { client_id: c.id },
        });
        if (error || (data as any)?.error) {
          const msg = (data as any)?.message || error?.message || "Failed";
          setErrors((e) => [...e, `${c.company_name}: ${msg}`]);
          if ((data as any)?.error === "budget_exceeded") {
            toast.error("Budget exceeded — stopping bulk enrichment");
            break;
          }
        }
      } catch (e: any) {
        setErrors((er) => [...er, `${c.company_name}: ${e?.message || "error"}`]);
      }
      setDone((d) => d + 1);
      // gentle pacing
      await new Promise((r) => setTimeout(r, 600));
    }
    qc.invalidateQueries({ queryKey: ["company_intel"] });
    qc.invalidateQueries({ queryKey: ["enrichment_usage"] });
    setRunning(false);
    toast.success("Bulk enrichment complete");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Sparkles className="h-3.5 w-3.5 mr-1" /> Enrich all
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk company enrichment</DialogTitle>
          <DialogDescription>
            Enriches up to {DAILY_LIMIT} companies per run, prioritising Active → Warm → Target → Cold.
            Stops automatically if your monthly budget is reached.
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground">
          This month so far: £{((usage?.spent_pence ?? 0) / 100).toFixed(2)} ({usage?.count ?? 0} enrichments)
        </div>

        {running || total > 0 ? (
          <div className="space-y-2">
            <Progress value={total ? (done / total) * 100 : 0} />
            <div className="text-xs text-muted-foreground">
              Tidying… {done} of {total} complete
            </div>
            {errors.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-destructive">{errors.length} errors</summary>
                <ul className="mt-1 space-y-0.5 max-h-40 overflow-auto">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={run} disabled={running}>
            {running ? "Running…" : `Enrich ${Math.min(prioritised.length, DAILY_LIMIT)} companies`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
