import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Loader2, PhoneCall, RefreshCw, Scale } from "lucide-react";
import { toast } from "sonner";
import { LogCallDialog } from "@/components/LogCallDialog";
import {
  useCallTranscripts, useCandidateJudgement, useImpactClaims, useRegenerateJudgement,
} from "@/hooks/use-judgement";

export function specificityStyle(s: string) {
  if (s === "high") return "bg-success/15 text-green-500 border-success/30";
  if (s === "medium") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export function JudgementPanel({ candidateId }: { candidateId: string }) {
  const { data: judgement } = useCandidateJudgement(candidateId);
  const { data: claims = [] } = useImpactClaims(candidateId);
  const { data: transcripts = [] } = useCallTranscripts(candidateId);
  const regenerate = useRegenerateJudgement();
  const [logOpen, setLogOpen] = useState(false);
  const [claimsOpen, setClaimsOpen] = useState(false);

  const meta = judgement?.evidence_meta || {};
  const callCount = transcripts.length;

  const doRegen = async () => {
    try {
      await regenerate.mutateAsync(candidateId);
      toast.success("Judgement Summary regenerated");
    } catch (e: any) {
      toast.error(e?.message || "Could not regenerate");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Judgement Summary</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setLogOpen(true)}>
            <PhoneCall className="h-3.5 w-3.5" /> Log a call
          </Button>
          {callCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs"
              onClick={doRegen}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {callCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          No calls logged yet —{" "}
          <button className="text-primary hover:underline" onClick={() => setLogOpen(true)}>
            log a call
          </button>{" "}
          to build a judgement profile.
        </p>
      ) : judgement?.summary ? (
        <>
          <p className="text-sm leading-relaxed text-foreground/90">{judgement.summary}</p>
          <p className="text-xs text-muted-foreground">
            Based on {callCount} call{callCount === 1 ? "" : "s"}, {claims.length} impact claim
            {claims.length === 1 ? "" : "s"}
            {meta.employer ? `, company context for ${meta.employer}${meta.has_employer_context ? "" : " (not enriched yet)"}` : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Calls logged but no summary yet — hit Regenerate to build the judgement profile.
        </p>
      )}

      {judgement?.low_specificity_flag && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          Impact claims from calls are mostly general — worth probing for specifics next conversation.
        </div>
      )}

      {claims.length > 0 && (
        <div className="pt-1">
          <button
            className="text-xs text-primary hover:underline flex items-center gap-1"
            onClick={() => setClaimsOpen((v) => !v)}
          >
            {claimsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {claimsOpen ? "Hide" : "Show"} {claims.length} impact claim{claims.length === 1 ? "" : "s"}
          </button>
          {claimsOpen && (
            <ul className="mt-2 space-y-2">
              {claims.map((c) => (
                <li key={c.id} className="rounded-md border border-border bg-background/40 p-2 space-y-1">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className={`text-[10px] uppercase ${specificityStyle(c.specificity)}`}>
                      {c.specificity}
                    </Badge>
                    <span className="text-xs text-foreground/90">{c.what_they_did}</span>
                  </div>
                  {c.claimed_impact && (
                    <p className="text-xs text-muted-foreground pl-1">→ {c.claimed_impact}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <LogCallDialog candidateId={candidateId} open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}
