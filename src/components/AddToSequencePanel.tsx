import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Search, Check, ExternalLink, Zap, UserCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useSequences,
  useSequenceStepCounts,
  useSequenceEnrollmentCounts,
  useCandidateEnrollments,
  useEnrollEntity,
  type EntityType,
} from "@/hooks/use-sequences";

interface Props {
  candidateId?: string;
  candidateName?: string;
  /** Newer entity-aware props (preferred). */
  entityType?: EntityType;
  entityId?: string;
  entityName?: string;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
}

/**
 * Reusable popover panel that lets a user add a candidate, contact or client
 * to an Auto or Personal sequence.
 */
export function AddToSequencePanel({ candidateId, candidateName, entityType, entityId, entityName, trigger, align = "end" }: Props) {
  const resolvedType: EntityType = entityType ?? "candidate";
  const resolvedId = entityId ?? candidateId ?? "";
  const resolvedName = entityName ?? candidateName ?? "";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addedId, setAddedId] = useState<string | null>(null);

  const { data: sequences = [], isLoading } = useSequences();
  const { data: stepCounts = {} } = useSequenceStepCounts();
  const { data: enrollmentCounts = {} } = useSequenceEnrollmentCounts();
  // Existing-enrollment lookup currently only supports candidates
  const { data: existing = [] } = useCandidateEnrollments(
    open && resolvedType === "candidate" ? resolvedId : null
  );
  const enroll = useEnrollEntity();

  const existingByseq = useMemo(() => {
    const m = new Map<string, { current_step: number; total: number; name: string }>();
    existing.forEach((e) => {
      if (e.status === "active" && e.sequences) {
        m.set(e.sequence_id, {
          current_step: e.current_step,
          total: e.total_steps ?? 0,
          name: e.sequences.name,
        });
      }
    });
    return m;
  }, [existing]);

  const filtered = sequences
    .filter((s) => s.status === "active")
    .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  const autoSeqs = filtered.filter((s) => s.type === "auto");
  const personalSeqs = filtered.filter((s) => s.type !== "auto");

  // Suggested sequence based on entity type — match first active sequence whose
  // name corresponds to the recommended template for this kind of person.
  const suggestionRules: Record<EntityType, { primary: string[]; reason: string }> = {
    candidate: {
      primary: ["warm candidate re-engagement", "warm candidate"],
      reason: "Best fit for candidates you want to keep warm.",
    },
    contact: {
      primary: ["warm senior contact", "bd nurture"],
      reason: "Ideal for nurturing a senior contact at a prospect company.",
    },
    client: {
      primary: ["post-placement client nurture", "lapsed client reconnect"],
      reason: "Designed to keep clients engaged after a placement.",
    },
  };
  const rules = suggestionRules[resolvedType];
  const suggested = useMemo(() => {
    if (query) return null; // hide suggestion while user is searching
    const active = sequences.filter((s) => s.status === "active");
    for (const needle of rules.primary) {
      const match = active.find((s) => s.name.toLowerCase().includes(needle));
      if (match) return match;
    }
    return null;
  }, [sequences, rules, query]);

  const handleAdd = async (seqId: string, seqName: string) => {
    if (!resolvedId) return;
    try {
      await enroll.mutateAsync({
        sequence_id: seqId,
        entity_type: resolvedType,
        entity_id: resolvedId,
      });
      setAddedId(seqId);
      toast.success(`Added to ${seqName} ✓`);
      setTimeout(() => {
        setOpen(false);
        setAddedId(null);
        setQuery("");
      }, 900);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add to sequence");
    }
  };

  const defaultTrigger = (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className="p-2 rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-[#9CA3AF] hover:text-primary hover:bg-muted/40"
              onClick={(e) => e.stopPropagation()}
              aria-label="Add to sequence"
            >
              <GitBranch className="h-[18px] w-[18px]" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Add to sequence</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuery(""); setAddedId(null); } }}>
      {trigger ? <PopoverTrigger asChild>{trigger}</PopoverTrigger> : defaultTrigger}
      <PopoverContent
        className="w-[340px] p-0"
        align={align}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-border">
          <p className="text-sm font-medium mb-2">Add {resolvedName} to a sequence</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search sequences..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-sm pl-8"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-3">Loading sequences...</p>
          ) : sequences.length === 0 ? (
            <div className="p-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No sequences yet</p>
              <Link to="/sequences" onClick={() => setOpen(false)}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3 w-3" /> Create one in Outreach
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <SequenceSection
                title="Auto Sequences"
                icon={<Zap className="h-3 w-3" />}
                tone="amber"
                items={autoSeqs}
                stepCounts={stepCounts}
                enrollmentCounts={enrollmentCounts}
                existingByseq={existingByseq}
                addedId={addedId}
                pending={enroll.isPending}
                onAdd={handleAdd}
              />
              <SequenceSection
                title="Personal Sequences"
                icon={<UserCircle2 className="h-3 w-3" />}
                tone="teal"
                items={personalSeqs}
                stepCounts={stepCounts}
                enrollmentCounts={enrollmentCounts}
                existingByseq={existingByseq}
                addedId={addedId}
                pending={enroll.isPending}
                onAdd={handleAdd}
              />
              {filtered.length === 0 && query && (
                <p className="text-sm text-muted-foreground p-3">No matching sequences</p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SequenceSection({
  title,
  icon,
  tone,
  items,
  stepCounts,
  enrollmentCounts,
  existingByseq,
  addedId,
  pending,
  onAdd,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "amber" | "teal";
  items: Array<{ id: string; name: string; description: string | null; type: string }>;
  stepCounts: Record<string, number>;
  enrollmentCounts: Record<string, number>;
  existingByseq: Map<string, { current_step: number; total: number; name: string }>;
  addedId: string | null;
  pending: boolean;
  onAdd: (id: string, name: string) => void;
}) {
  if (items.length === 0) return null;
  const toneColor = tone === "amber" ? "text-amber-400" : "text-teal-400";

  return (
    <div className="border-b border-border/50 last:border-0">
      <div className={cn("px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5 bg-muted/20", toneColor)}>
        {icon} {title}
      </div>
      {items.map((seq) => {
        const stepCount = stepCounts[seq.id] ?? 0;
        const enrolled = enrollmentCounts[seq.id] ?? 0;
        const existing = existingByseq.get(seq.id);
        const justAdded = addedId === seq.id;
        return (
          <button
            key={seq.id}
            className={cn(
              "w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors border-b border-border/30 last:border-0 disabled:cursor-not-allowed",
              justAdded && "bg-green-500/10",
              existing && !justAdded && "opacity-90"
            )}
            onClick={() => onAdd(seq.id, seq.name)}
            disabled={pending || justAdded}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{seq.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {stepCount} step{stepCount === 1 ? "" : "s"} · {enrolled} in sequence
                </p>
                {existing && (
                  <p className="text-[11px] text-teal-400 mt-0.5">
                    Already in {existing.name} — Step {existing.current_step}
                    {existing.total ? ` of ${existing.total}` : ""}
                  </p>
                )}
              </div>
              {justAdded ? (
                <Check className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                  {seq.type === "auto" ? "Auto" : "Personal"}
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
