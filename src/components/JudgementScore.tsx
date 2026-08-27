import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { JobJudgement } from "@/hooks/use-judgement";

export function judgementColor(score: number) {
  if (score >= 75) return "text-green-500 border-green-500/40";
  if (score >= 50) return "text-amber-500 border-amber-500/40";
  return "text-muted-foreground border-border";
}

/** Compact inline judgement score — never blended with the matching score. */
export function JudgementBadge({ judgement, compact = false }: { judgement?: JobJudgement | null; compact?: boolean }) {
  if (judgement?.dealbreaker) {
    return (
      <Badge variant="outline" className="text-xs text-destructive border-destructive/40">
        ⚠️ Matches a stated dealbreaker: {judgement.dealbreaker}
      </Badge>
    );
  }
  if (!judgement || judgement.score === null || judgement.score === undefined) {
    const label = "Judgement: Not enough evidence yet";
    if (compact) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground">Judgement: —</span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              No calls logged — book a screening call to assess fit beyond CV.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <div className="text-xs text-muted-foreground">
        {label}
        <span className="block text-[11px]">No calls logged — book a screening call to assess fit beyond CV.</span>
      </div>
    );
  }
  return (
    <Badge variant="outline" className={`text-xs ${judgementColor(judgement.score)}`}>
      Judgement: {judgement.score}%
    </Badge>
  );
}

export function JudgementReasoning({ judgement }: { judgement?: JobJudgement | null }) {
  if (!judgement?.reasoning) return null;
  return (
    <p className="text-xs text-foreground/80 leading-relaxed">
      <span className="text-muted-foreground">Judgement reasoning: </span>
      {judgement.reasoning}
    </p>
  );
}
