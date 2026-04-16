import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Sparkles, Check, X, Loader2 } from "lucide-react";
import { useScreeningNote, useUpsertScreeningNote, usePreviousScreeningNotes, type ScreeningNote } from "@/hooks/use-screening-notes";
import { useUpdateCandidate, type Candidate, type CandidateJob } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const INTEREST_LEVELS = ["Very interested", "Interested", "Considering", "Uncertain"] as const;

interface Props {
  candidateJob: CandidateJob;
  candidate: Candidate;
  jobId: string;
  jobTitle: string;
}

export function ScreeningNotesPanel({ candidateJob, candidate, jobId, jobTitle }: Props) {
  const { data: existing } = useScreeningNote(candidateJob.id);
  const { data: previous = [] } = usePreviousScreeningNotes(candidate.id, candidateJob.id);
  const upsert = useUpsertScreeningNote();
  const updateCandidate = useUpdateCandidate();

  const [whySuitable, setWhySuitable] = useState("");
  const [keyStrengths, setKeyStrengths] = useState("");
  const [interestLevel, setInterestLevel] = useState<string>("");
  const [salaryConfirmed, setSalaryConfirmed] = useState<string>("");
  const [availabilityConfirmed, setAvailabilityConfirmed] = useState("");
  const [noticePeriodConfirmed, setNoticePeriodConfirmed] = useState("");
  const [concerns, setConcerns] = useState("");
  const [questionsAnswered, setQuestionsAnswered] = useState("");

  // AI enhance state
  const [enhancing, setEnhancing] = useState(false);
  const [enhancedDraft, setEnhancedDraft] = useState<string | null>(null);

  // Hydrate from existing record OR pre-fill from candidate record
  useEffect(() => {
    if (existing) {
      setWhySuitable(existing.why_suitable ?? "");
      setKeyStrengths(existing.key_strengths ?? "");
      setInterestLevel(existing.interest_level ?? "");
      setSalaryConfirmed(existing.salary_confirmed?.toString() ?? "");
      setAvailabilityConfirmed(existing.availability_confirmed ?? "");
      setNoticePeriodConfirmed(existing.notice_period_confirmed ?? "");
      setConcerns(existing.concerns ?? "");
      setQuestionsAnswered(existing.questions_answered ?? "");
    } else {
      // Pre-fill from candidate record where possible
      setSalaryConfirmed(candidate.salary_current?.toString() ?? "");
      setAvailabilityConfirmed(candidate.availability ?? "");
      setNoticePeriodConfirmed((candidate as any).notice_period ?? "");
    }
  }, [existing, candidate]);

  const isComplete = (n: Partial<ScreeningNote>) =>
    !!(n.why_suitable && n.key_strengths && n.interest_level);

  const handleSave = async () => {
    const payload: Partial<ScreeningNote> & { candidate_job_id: string } = {
      candidate_job_id: candidateJob.id,
      why_suitable: whySuitable || null,
      key_strengths: keyStrengths || null,
      interest_level: interestLevel || null,
      salary_confirmed: salaryConfirmed ? Number(salaryConfirmed) : null,
      availability_confirmed: availabilityConfirmed || null,
      notice_period_confirmed: noticePeriodConfirmed || null,
      concerns: concerns || null,
      questions_answered: questionsAnswered || null,
    };
    payload.completed = isComplete(payload);

    await upsert.mutateAsync(payload);

    // Mirror confirmed values back to candidate record (the "source of truth" for these fields)
    const candidateUpdates: any = {};
    if (salaryConfirmed && Number(salaryConfirmed) !== candidate.salary_current) {
      candidateUpdates.salary_current = Number(salaryConfirmed);
    }
    if (availabilityConfirmed && availabilityConfirmed !== candidate.availability) {
      candidateUpdates.availability = availabilityConfirmed;
    }
    if (noticePeriodConfirmed && noticePeriodConfirmed !== (candidate as any).notice_period) {
      candidateUpdates.notice_period = noticePeriodConfirmed;
    }
    if (Object.keys(candidateUpdates).length > 0) {
      await updateCandidate.mutateAsync({ id: candidate.id, ...candidateUpdates });
    }

    toast.success("Screening notes saved");
  };

  const handleEnhance = async () => {
    if (!whySuitable.trim()) {
      toast.error("Add some notes in 'Why suitable' first");
      return;
    }
    setEnhancing(true);
    setEnhancedDraft(null);
    try {
      const { data, error } = await supabase.functions.invoke("enhance-screening-note", {
        body: {
          candidate_job_id: candidateJob.id,
          candidate_id: candidate.id,
          job_id: jobId,
          why_suitable: whySuitable,
          key_strengths: keyStrengths,
          concerns,
        },
      });
      if (error) throw error;
      if (!data?.enhanced) throw new Error("No enhancement returned");
      setEnhancedDraft(data.enhanced);
    } catch (e: any) {
      toast.error(e.message || "Enhancement failed");
    } finally {
      setEnhancing(false);
    }
  };

  const acceptEnhancement = () => {
    if (enhancedDraft) setWhySuitable(enhancedDraft);
    setEnhancedDraft(null);
    toast.success("Enhanced version applied — remember to save");
  };

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Screening notes — {jobTitle}
        </h4>
        {existing?.completed && (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] h-5 px-1.5 gap-1">
            <Check className="h-2.5 w-2.5" /> Screened
          </Badge>
        )}
      </div>

      {/* Previously screened reference */}
      {previous.length > 0 && (
        <div className="space-y-1">
          {previous.map((p: any) => (
            <Collapsible key={p.id}>
              <CollapsibleTrigger className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 px-2 rounded bg-muted/30">
                <ChevronDown className="h-3 w-3" />
                Previously screened for {p.job_title}
                {p.company_name ? ` at ${p.company_name}` : ""} —{" "}
                {new Date(p.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </CollapsibleTrigger>
              <CollapsibleContent className="text-[11px] text-muted-foreground space-y-1.5 px-2 py-2 border border-border rounded mt-1">
                {p.why_suitable && (
                  <div><span className="font-medium text-foreground">Why suitable:</span> {p.why_suitable}</div>
                )}
                {p.key_strengths && (
                  <div><span className="font-medium text-foreground">Strengths:</span> {p.key_strengths}</div>
                )}
                {p.concerns && (
                  <div><span className="font-medium text-foreground">Concerns:</span> {p.concerns}</div>
                )}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <FieldBlock label="Why suitable for this role">
          <Textarea
            value={whySuitable}
            onChange={(e) => setWhySuitable(e.target.value)}
            placeholder="Why are they right for this specific role at this specific company?"
            rows={3}
            className="text-xs"
          />
        </FieldBlock>

        <FieldBlock label="Key strengths relevant to this role">
          <Textarea
            value={keyStrengths}
            onChange={(e) => setKeyStrengths(e.target.value)}
            placeholder="Technical skills, experience, cultural fit, specific achievements..."
            rows={3}
            className="text-xs"
          />
        </FieldBlock>

        <FieldBlock label="Stated interest level">
          <Select value={interestLevel} onValueChange={setInterestLevel}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {INTEREST_LEVELS.map((l) => (
                <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>

        <div className="grid grid-cols-2 gap-2">
          <FieldBlock label="Salary confirmed (£)">
            <Input
              type="number"
              value={salaryConfirmed}
              onChange={(e) => setSalaryConfirmed(e.target.value)}
              placeholder="65000"
              className="h-8 text-xs"
            />
          </FieldBlock>
          <FieldBlock label="Notice period confirmed">
            <Input
              value={noticePeriodConfirmed}
              onChange={(e) => setNoticePeriodConfirmed(e.target.value)}
              placeholder="3 months"
              className="h-8 text-xs"
            />
          </FieldBlock>
        </div>

        <FieldBlock label="Availability confirmed">
          <Input
            value={availabilityConfirmed}
            onChange={(e) => setAvailabilityConfirmed(e.target.value)}
            placeholder="Immediate, or specific date"
            className="h-8 text-xs"
          />
        </FieldBlock>

        <FieldBlock label="Concerns or risks">
          <Textarea
            value={concerns}
            onChange={(e) => setConcerns(e.target.value)}
            placeholder="Counter offer risk, other processes, gaps, anything client should know"
            rows={2}
            className="text-xs"
          />
        </FieldBlock>

        <FieldBlock label="Specific questions answered">
          <Textarea
            value={questionsAnswered}
            onChange={(e) => setQuestionsAnswered(e.target.value)}
            placeholder="Any role-specific questions the client asked that have been addressed"
            rows={2}
            className="text-xs"
          />
        </FieldBlock>
      </div>

      {/* AI Enhance */}
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={handleEnhance}
          disabled={enhancing}
        >
          {enhancing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Enhance with AI
        </Button>

        {enhancedDraft && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Here is an enhanced version — edit before saving:
            </p>
            <Textarea
              value={enhancedDraft}
              onChange={(e) => setEnhancedDraft(e.target.value)}
              rows={5}
              className="text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs gap-1" onClick={acceptEnhancement}>
                <Check className="h-3 w-3" /> Use this
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setEnhancedDraft(null)}
              >
                <X className="h-3 w-3" /> Discard
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Saving..." : "Save screening notes"}
        </Button>
      </div>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
