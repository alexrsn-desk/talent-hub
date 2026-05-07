import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Loader2, FileText, AlertTriangle, CheckCircle2, X, ClipboardList, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFeatureLimit, useLogUsage } from "@/hooks/use-usage";
import { FeatureLockButton } from "@/components/UsageLimitGuard";
import { IntakeCallCompanion } from "@/components/IntakeCallCompanion";
import { CallNotesPad } from "@/components/CallNotesPad";

interface Phase {
  number: number;
  title: string;
  goal: string;
  questions: string[];
  priority: "normal" | "critical";
  skipped_last_time: boolean;
  skipped_note?: string | null;
}

interface CallPrepProps {
  entityType: "candidate" | "client";
  entityId: string;
  entityName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CallPrepButton({ entityType, entityId, entityName }: Omit<CallPrepProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" /> Prep for Call
      </Button>
      <CallPrepDialog
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function CallPrepDialog({ entityType, entityId, entityName, open, onOpenChange }: CallPrepProps) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [intakeJob, setIntakeJob] = useState<{ id: string; title: string; intake_summary: string | null; intake_captured_at: string | null } | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const { toast } = useToast();
  const callSummaryLimit = useFeatureLimit("call_summary");
  const logUsage = useLogUsage();

  // For client calls, look up an open job to surface intake companion / summary
  useEffect(() => {
    if (!open || entityType !== "client") { setIntakeJob(null); return; }
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, title, intake_summary, intake_captured_at")
        .eq("client_id", entityId)
        .eq("status", "Open")
        .order("date_opened", { ascending: false })
        .limit(1);
      const j = (data || [])[0];
      if (j) setIntakeJob(j as any);
    })();
  }, [open, entityType, entityId]);


  const loadPrep = async () => {
    if (!callSummaryLimit.canUse) {
      toast({ title: "Limit reached", description: "Monthly call summary limit reached", variant: "destructive" });
      return;
    }
    setLoading(true);
    logUsage.mutate({ featureType: "call_summary", isGrace: callSummaryLimit.graceGranted });
    try {
      const { data, error } = await supabase.functions.invoke("call-prep", {
        body: { entity_type: entityType, entity_id: entityId },
      });
      if (error) throw error;
      setPhases(data.phases || []);
      setExpandedPhases({ 1: true });
      setChecked({});
      setLoaded(true);
    } catch (e: any) {
      toast({ title: "Error generating prep", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen && !loaded && !loading) {
      loadPrep();
    }
    if (!isOpen) {
      setShowSummary(false);
    }
  };

  const togglePhase = (num: number) => {
    setExpandedPhases((prev) => ({ ...prev, [num]: !prev[num] }));
  };

  const toggleQuestion = (key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleEndCall = () => {
    setShowSummary(true);
  };

  const totalQuestions = phases.reduce((sum, p) => sum + p.questions.length, 0);
  const coveredCount = Object.values(checked).filter(Boolean).length;

  const missedCritical = phases
    .filter((p) => p.priority === "critical")
    .flatMap((p) => p.questions.filter((_, qi) => !checked[`${p.number}-${qi}`])
      .map((q) => ({ phase: p.title, question: q }))
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Call Prep — {entityName}
          </DialogTitle>
        </DialogHeader>

        {intakeJob && !intakeJob.intake_captured_at && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4 text-primary" /> This is an intake call — here are your questions
            </p>
            <p className="text-xs text-muted-foreground">
              Open job <span className="text-foreground font-medium">{intakeJob.title}</span> has no intake notes yet.
            </p>
            <Button size="sm" onClick={() => setIntakeOpen(true)}>Open Intake Companion</Button>
          </div>
        )}
        {intakeJob && intakeJob.intake_captured_at && intakeJob.intake_summary && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" /> Intake already captured — here is what you know
            </p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{intakeJob.intake_summary}</p>
          </div>
        )}
        {intakeJob && (
          <IntakeCallCompanion
            jobId={intakeJob.id}
            jobTitle={intakeJob.title}
            open={intakeOpen}
            onOpenChange={setIntakeOpen}
          />
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analysing history and generating prompts...</p>
          </div>
        )}

        {!loading && !showSummary && phases.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-[55fr_45fr] gap-4">
            <div className="space-y-3 min-w-0">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{coveredCount}/{totalQuestions} questions covered</span>
                <Button size="sm" variant="outline" onClick={handleEndCall}>
                  End Call — Show Summary
                </Button>
              </div>

              {phases.map((phase) => (
                <PhaseSection
                  key={phase.number}
                  phase={phase}
                  expanded={!!expandedPhases[phase.number]}
                  onToggle={() => togglePhase(phase.number)}
                  checked={checked}
                  onToggleQuestion={toggleQuestion}
                />
              ))}
            </div>
            <div className="border-t md:border-t-0 md:border-l border-border md:pl-4 pt-4 md:pt-0">
              <CallNotesPad entityType={entityType} entityId={entityId} />
            </div>
          </div>
        )}

        {!loading && showSummary && (
          <PostCallSummary
            phases={phases}
            checked={checked}
            missedCritical={missedCritical}
            onClose={() => { onOpenChange(false); setShowSummary(false); }}
          />
        )}

        {!loading && !loaded && !phases.length && (
          <div className="flex flex-col items-center py-8 gap-3">
            <p className="text-muted-foreground text-sm">Click to generate AI call prep prompts</p>
            <Button onClick={loadPrep}>Generate Prep</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PhaseSection({
  phase,
  expanded,
  onToggle,
  checked,
  onToggleQuestion,
}: {
  phase: Phase;
  expanded: boolean;
  onToggle: () => void;
  checked: Record<string, boolean>;
  onToggleQuestion: (key: string) => void;
}) {
  const allCovered = phase.questions.every((_, qi) => checked[`${phase.number}-${qi}`]);
  const isCritical = phase.priority === "critical";

  return (
    <Card className={`${isCritical ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
      <Collapsible open={expanded} onOpenChange={onToggle}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium text-sm">
              Phase {phase.number} — {phase.title}
            </span>
            {isCritical && <Badge className="bg-amber-500/20 text-amber-400 text-xs">Must Cover</Badge>}
            {phase.skipped_last_time && (
              <Badge variant="destructive" className="text-xs">Missed Last Time</Badge>
            )}
            {allCovered && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3">
          <p className="text-xs text-muted-foreground mb-2 italic">{phase.goal}</p>
          {phase.skipped_note && (
            <p className="text-xs text-amber-400 mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {phase.skipped_note}
            </p>
          )}
          <div className="space-y-2">
            {phase.questions.map((q, qi) => {
              const key = `${phase.number}-${qi}`;
              return (
                <label
                  key={key}
                  className={`flex items-start gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-muted/30 transition-colors ${
                    checked[key] ? "text-muted-foreground line-through" : ""
                  } ${isCritical && !checked[key] ? "text-amber-200" : ""}`}
                >
                  <Checkbox
                    checked={!!checked[key]}
                    onCheckedChange={() => onToggleQuestion(key)}
                    className="mt-0.5"
                  />
                  <span>{q}</span>
                </label>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function PostCallSummary({
  phases,
  checked,
  missedCritical,
  onClose,
}: {
  phases: Phase[];
  checked: Record<string, boolean>;
  missedCritical: { phase: string; question: string }[];
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-medium">Post-Call Summary</h3>

      {phases.map((phase) => {
        const covered = phase.questions.filter((_, qi) => checked[`${phase.number}-${qi}`]).length;
        const total = phase.questions.length;
        const allDone = covered === total;

        return (
          <div key={phase.number} className="flex items-center gap-2 text-sm">
            {allDone ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertTriangle className={`h-4 w-4 ${phase.priority === "critical" ? "text-red-500" : "text-amber-500"}`} />
            )}
            <span>Phase {phase.number} — {phase.title}: {covered}/{total} covered</span>
          </div>
        );
      })}

      {missedCritical.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5 p-3 space-y-2">
          <p className="text-sm font-medium text-red-400 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> Critical questions missed
          </p>
          {missedCritical.map((mc, i) => (
            <div key={i} className="text-sm text-muted-foreground">
              <span className="text-red-400">•</span> {mc.question}
              <p className="text-xs text-muted-foreground ml-3">
                Add to next call prep automatically? This will be prioritised next time.
              </p>
            </div>
          ))}
        </Card>
      )}

      <Button onClick={onClose} className="w-full">Done</Button>
    </div>
  );
}
