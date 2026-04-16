import { useState } from "react";
import { Loader2, Check, X, Pencil, Sparkles, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCallInsights, useAcceptInsight, useIgnoreInsight, fieldLabel, type CallInsight } from "@/hooks/use-call-insights";
import { TAG_CATEGORIES } from "@/hooks/use-tags";
import { toast } from "sonner";

interface CallInsightsPanelProps {
  noteId: string;
  /** Show "Analysing..." pulse while AI is still working */
  analysing?: boolean;
}

export function CallInsightsPanel({ noteId, analysing }: CallInsightsPanelProps) {
  const { data: insights = [], isLoading } = useCallInsights(noteId);

  const fieldInsights = insights.filter(i => i.kind === "field");
  const tagInsights = insights.filter(i => i.kind === "tag");

  // Show "Analysing..." for a short window while waiting for results
  const isWaiting = analysing || (isLoading && insights.length === 0);

  if (insights.length === 0 && !isWaiting) return null;

  return (
    <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3" />
        AI insights
        {isWaiting && (
          <span className="flex items-center gap-1 text-muted-foreground font-normal">
            <Loader2 className="h-3 w-3 animate-spin" /> Analysing transcript…
          </span>
        )}
      </div>

      {fieldInsights.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested field updates</div>
          {fieldInsights.map(i => <FieldRow key={i.id} insight={i} />)}
        </div>
      )}

      {tagInsights.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested tags</div>
          {tagInsights.map(i => <TagRow key={i.id} insight={i} />)}
        </div>
      )}
    </div>
  );
}

function FieldRow({ insight }: { insight: CallInsight }) {
  const accept = useAcceptInsight();
  const ignore = useIgnoreInsight();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(insight.detected_value || "");

  const handleAccept = async () => {
    try {
      await accept.mutateAsync({ insight, overrideValue: editing ? draft : undefined });
      toast.success(`${fieldLabel(insight.field_name)} updated`);
    } catch (e) {
      toast.error("Failed to update field");
    }
  };

  return (
    <div className="flex items-start gap-2 rounded bg-background/60 p-2 text-xs">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium">{fieldLabel(insight.field_name)}:</span>
          {editing ? (
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="h-6 w-32 text-xs"
              autoFocus
            />
          ) : (
            <span className="text-foreground">{insight.detected_value}</span>
          )}
        </div>
        {insight.source_quote && (
          <div className="text-[11px] text-muted-foreground italic">"{insight.source_quote}"</div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleAccept} disabled={accept.isPending} title="Accept">
          <Check className="h-3 w-3 text-green-500" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(v => !v)} title="Edit">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => ignore.mutate(insight)} disabled={ignore.isPending} title="Ignore">
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

function TagRow({ insight }: { insight: CallInsight }) {
  const accept = useAcceptInsight();
  const ignore = useIgnoreInsight();

  const handleAdd = async () => {
    try {
      await accept.mutateAsync({ insight });
      toast.success(`Tag "${insight.tag_label}" added`);
    } catch (e) {
      toast.error("Failed to add tag");
    }
  };

  const confidenceColor =
    insight.confidence === "high"
      ? "bg-green-500/15 text-green-400 border-green-500/30"
      : "bg-amber-500/15 text-amber-400 border-amber-500/30";

  const categoryLabel = TAG_CATEGORIES[insight.tag_category || ""] || insight.tag_category;

  return (
    <div className="flex items-start gap-2 rounded bg-background/60 p-2 text-xs">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">{categoryLabel}:</span>
          <Badge variant="outline" className={`text-[10px] h-5 ${confidenceColor}`}>
            <TagIcon className="h-2.5 w-2.5 mr-1" />
            {insight.tag_label}
          </Badge>
          <span className="text-[10px] text-muted-foreground capitalize">{insight.confidence}</span>
        </div>
        {insight.source_quote && (
          <div className="text-[11px] text-muted-foreground italic">"{insight.source_quote}"</div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={handleAdd} disabled={accept.isPending}>
          Add tag
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => ignore.mutate(insight)} disabled={ignore.isPending} title="Ignore">
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
