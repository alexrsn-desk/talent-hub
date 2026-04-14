import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, AlertTriangle, CheckCircle, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

type Flag = { issue: string; why: string; action: string };
type FocusData = {
  greeting: string;
  red_flags: Flag[];
  amber_flags: Flag[];
  green_flags: Flag[];
  bottom_line: string;
};

export function DailyFocus() {
  const [data, setData] = useState<FocusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchFocus = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("daily-focus");
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (e: any) {
      const msg = e?.message || "Failed to load AI focus";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFocus(); }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          <span className="text-sm">Analysing your desk…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{error || "Could not load focus"}</p>
          <Button variant="ghost" size="sm" onClick={fetchFocus}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const hasRed = data.red_flags.length > 0;
  const hasAmber = data.amber_flags.length > 0;
  const hasGreen = data.green_flags.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Daily Focus</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          </CollapsibleTrigger>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchFocus} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="p-4 space-y-4">
            {/* Greeting */}
            <p className="text-sm text-muted-foreground">{data.greeting}</p>

            {/* Red flags */}
            {hasRed && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wide">Urgent</span>
                </div>
                {data.red_flags.map((f, i) => (
                  <FlagCard key={i} flag={f} variant="red" />
                ))}
              </div>
            )}

            {/* Amber flags */}
            {hasAmber && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">High Priority</span>
                </div>
                {data.amber_flags.map((f, i) => (
                  <FlagCard key={i} flag={f} variant="amber" />
                ))}
              </div>
            )}

            {/* Green flags */}
            {hasGreen && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Worth Doing</span>
                </div>
                {data.green_flags.map((f, i) => (
                  <FlagCard key={i} flag={f} variant="green" />
                ))}
              </div>
            )}

            {/* Bottom line */}
            {data.bottom_line && (
              <div className="pt-2 border-t border-border">
                <p className="text-sm font-medium">{data.bottom_line}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function FlagCard({ flag, variant }: { flag: Flag; variant: "red" | "amber" | "green" }) {
  const borderClass =
    variant === "red" ? "border-l-destructive" :
    variant === "amber" ? "border-l-amber-400" :
    "border-l-emerald-400";

  return (
    <div className={`rounded-md border border-border bg-muted/30 border-l-2 ${borderClass} px-3 py-2 space-y-0.5`}>
      <p className="text-sm font-medium">{flag.issue}</p>
      <p className="text-xs text-muted-foreground">{flag.why}</p>
      <p className="text-xs text-primary font-medium">→ {flag.action}</p>
    </div>
  );
}
