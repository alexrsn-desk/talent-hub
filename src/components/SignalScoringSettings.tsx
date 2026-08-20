import { useEffect, useState } from "react";
import { Radar, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useSignalScoreSettings,
  useUpdateSignalScoreSettings,
  useRunSignalsScan,
  DEFAULT_WEIGHTS,
  WEIGHT_LABELS,
} from "@/hooks/use-desky-signals";

/** Settings → Signals: relationship score weights and monitoring thresholds. */
export function SignalScoringSettings() {
  const { data: settings, isLoading } = useSignalScoreSettings();
  const update = useUpdateSignalScoreSettings();
  const scan = useRunSignalsScan();

  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);
  const [topPct, setTopPct] = useState(20);
  const [minScore, setMinScore] = useState(40);
  const [coldDays, setColdDays] = useState(180);
  const [annLookahead, setAnnLookahead] = useState(30);
  const [annMonths, setAnnMonths] = useState(12);

  useEffect(() => {
    if (!settings) return;
    setWeights(settings.weights);
    setTopPct(settings.monitor_top_percent);
    setMinScore(settings.monitor_min_score);
    setColdDays(settings.going_cold_days);
    setAnnLookahead(settings.anniversary_lookahead_days);
    setAnnMonths(settings.anniversary_months);
  }, [settings]);

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        weights,
        monitor_top_percent: Math.max(1, Math.min(100, topPct)),
        monitor_min_score: Math.max(0, minScore),
        going_cold_days: Math.max(7, coldDays),
        anniversary_lookahead_days: Math.max(1, annLookahead),
        anniversary_months: Math.max(1, annMonths),
      });
      await scan.mutateAsync();
      toast.success("Signal settings saved and scores recalculated");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  if (isLoading) {
    return (
      <div id="signals" className="pt-6 border-t border-border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div id="signals" className="pt-6 border-t border-border space-y-4">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Signals — relationship scoring</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Desky scores every candidate and contact from your own data, then monitors only your strongest
        relationships for opportunities.
      </p>

      <div className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-xs font-medium">Score weights</p>
        {Object.keys(DEFAULT_WEIGHTS).map((k) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <Label className="text-sm font-normal">{WEIGHT_LABELS[k] || k}</Label>
            <Input
              type="number"
              value={weights[k] ?? DEFAULT_WEIGHTS[k]}
              onChange={(e) => setWeights({ ...weights, [k]: parseInt(e.target.value) || 0 })}
              className="w-20 text-center"
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <p className="text-xs font-medium">Monitoring criteria</p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-normal">Monitor top %</Label>
            <p className="text-xs text-muted-foreground">Highest-scoring share of your records.</p>
          </div>
          <Input type="number" value={topPct} onChange={(e) => setTopPct(parseInt(e.target.value) || 0)} className="w-20 text-center" />
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div>
            <Label className="text-sm font-normal">Minimum score</Label>
            <p className="text-xs text-muted-foreground">
              Whichever is more restrictive — the top % or this minimum — wins.
            </p>
          </div>
          <Input type="number" value={minScore} onChange={(e) => setMinScore(parseInt(e.target.value) || 0)} className="w-20 text-center" />
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div>
            <Label className="text-sm font-normal">Going cold after (days)</Label>
            <p className="text-xs text-muted-foreground">No touchpoint logged for this long.</p>
          </div>
          <Input type="number" value={coldDays} onChange={(e) => setColdDays(parseInt(e.target.value) || 0)} className="w-20 text-center" />
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div>
            <Label className="text-sm font-normal">Placement anniversary (months)</Label>
            <p className="text-xs text-muted-foreground">Milestone to celebrate after a start date.</p>
          </div>
          <Input type="number" value={annMonths} onChange={(e) => setAnnMonths(parseInt(e.target.value) || 0)} className="w-20 text-center" />
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div>
            <Label className="text-sm font-normal">Anniversary lookahead (days)</Label>
            <p className="text-xs text-muted-foreground">How early to surface the anniversary.</p>
          </div>
          <Input type="number" value={annLookahead} onChange={(e) => setAnnLookahead(parseInt(e.target.value) || 0)} className="w-20 text-center" />
        </div>
      </div>

      <Button onClick={handleSave} disabled={update.isPending || scan.isPending} size="sm">
        {update.isPending || scan.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
        Save & recalculate
      </Button>
    </div>
  );
}
