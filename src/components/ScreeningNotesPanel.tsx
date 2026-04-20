import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Sparkles, Check, X, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
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

interface DraftPayload {
  why_suitable: string;
  key_strengths: string;
  interest_level: string;
  interest_reasoning: string;
  concerns: string;
  suggested_questions: string;
  thin_data: boolean;
}

export function ScreeningNotesPanel({ candidateJob, candidate, jobId, jobTitle }: Props) {
  const { data: existing, isLoading: loadingExisting } = useScreeningNote(candidateJob.id);
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

  // AI auto-draft state
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [aiDraftedFields, setAiDraftedFields] = useState<Set<string>>(new Set());
  const [suggestedQuestions, setSuggestedQuestions] = useState<string>("");
  const [interestReasoning, setInterestReasoning] = useState<string>("");
  const [thinData, setThinData] = useState(false);
  const [questionsCovered, setQuestionsCovered] = useState(false);
  const [styleOverride, setStyleOverride] = useState<string>("my_template");
  const autoTriggeredRef = useRef(false);

  // Single-field re-enhance (existing behaviour, kept)
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
      setSalaryConfirmed(candidate.salary_current?.toString() ?? "");
      setAvailabilityConfirmed(candidate.availability ?? "");
      setNoticePeriodConfirmed((candidate as any).notice_period ?? "");
    }
  }, [existing, candidate]);

  // Auto-trigger AI draft on open when no existing notes
  useEffect(() => {
    if (loadingExisting) return;
    if (existing) return; // already have saved notes — never auto-overwrite
    if (autoTriggeredRef.current) return;
    if (styleOverride === "none") return; // user chose no AI draft
    autoTriggeredRef.current = true;
    void generateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingExisting, existing]);

  const applyDraft = (draft: DraftPayload) => {
    setWhySuitable(draft.why_suitable ?? "");
    setKeyStrengths(draft.key_strengths ?? "");
    setInterestLevel(draft.interest_level ?? "");
    setInterestReasoning(draft.interest_reasoning ?? "");
    setConcerns(draft.concerns ?? "");
    setSuggestedQuestions(draft.suggested_questions ?? "");
    setThinData(!!draft.thin_data);
    setAiDraftedFields(new Set(["why_suitable", "key_strengths", "interest_level", "concerns"]));
    setQuestionsCovered(false);
  };

  const generateDraft = async (overrideValue?: string) => {
    const activeStyle = overrideValue ?? styleOverride;
    if (activeStyle === "none") return;
    setDrafting(true);
    setDraftError(null);
    try {
      const { data, error } = await supabase.functions.invoke("draft-screening-note", {
        body: {
          candidate_job_id: candidateJob.id,
          candidate_id: candidate.id,
          job_id: jobId,
          style_override: activeStyle,
        },
      });
      if (error) throw error;
      if (!data?.draft) throw new Error("No draft returned");
      applyDraft(data.draft as DraftPayload);
    } catch (e: any) {
      const msg = e?.message || "Could not generate draft";
      setDraftError(msg);
      toast.error(msg);
    } finally {
      setDrafting(false);
    }
  };

  const isComplete = (n: Partial<ScreeningNote>) =>
    !!(n.why_suitable && n.key_strengths && n.interest_level);

  const markFieldEdited = (field: string) => {
    if (aiDraftedFields.has(field)) {
      setAiDraftedFields((prev) => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
  };

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

    // Mirror confirmed values back to candidate record
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

  const handleEnhanceWhy = async () => {
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
    if (enhancedDraft) {
      setWhySuitable(enhancedDraft);
      markFieldEdited("why_suitable");
    }
    setEnhancedDraft(null);
    toast.success("Enhanced version applied — remember to save");
  };

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Screening notes — {jobTitle}
        </h4>
        <div className="flex items-center gap-1.5">
          {existing?.completed && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] h-5 px-1.5 gap-1">
              <Check className="h-2.5 w-2.5" /> Screened
            </Badge>
          )}
          <Select
            value={styleOverride}
            onValueChange={(v) => {
              setStyleOverride(v);
              if (v !== "none" && !existing) void generateDraft(v);
            }}
          >
            <SelectTrigger className="h-6 w-auto gap-1 text-[10px] px-2 border-border bg-transparent">
              <span className="text-muted-foreground">Style:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="my_template" className="text-xs">My template</SelectItem>
              <SelectItem value="formal" className="text-xs">Formal</SelectItem>
              <SelectItem value="concise" className="text-xs">Concise</SelectItem>
              <SelectItem value="detailed" className="text-xs">Detailed</SelectItem>
              <SelectItem value="none" className="text-xs">No AI draft</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => generateDraft()}
            disabled={drafting || styleOverride === "none"}
            title="Regenerate AI draft"
          >
            {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Regenerate
          </Button>
        </div>
      </div>

      {/* Generating indicator */}
      {drafting && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground rounded-md border border-dashed border-border bg-muted/20 px-2.5 py-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          Generating screening notes... usually 3–5 seconds.
        </div>
      )}

      {/* Thin-data warning */}
      {thinData && !drafting && (
        <div className="flex items-start gap-2 text-[11px] text-yellow-400 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-2.5 py-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            Limited call history for this candidate. Add a transcript or call notes for richer screening notes.
          </span>
        </div>
      )}

      {/* Draft error */}
      {draftError && !drafting && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
          <span>Could not generate draft: {draftError}</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => generateDraft()}>
            Retry
          </Button>
        </div>
      )}

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
                <span className="ml-auto text-muted-foreground">click to view</span>
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

      {/* Suggested questions — call prep, sits at the top */}
      {suggestedQuestions && !questionsCovered && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide">
              Questions to cover on this screening call
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setQuestionsCovered(true)}
              title="Mark as covered — hides this section"
            >
              <Check className="h-3 w-3" /> Covered
            </Button>
          </div>
          <Textarea
            value={suggestedQuestions}
            onChange={(e) => setSuggestedQuestions(e.target.value)}
            rows={4}
            className="text-xs bg-background"
          />
          <p className="text-[10px] text-muted-foreground">
            Call prep only — these aren't saved with the screening notes.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <FieldBlock label="Why suitable for this role" aiDrafted={aiDraftedFields.has("why_suitable")}>
          <Textarea
            value={whySuitable}
            onChange={(e) => { setWhySuitable(e.target.value); markFieldEdited("why_suitable"); }}
            placeholder="Why are they right for this specific role at this specific company?"
            rows={5}
            className="text-xs"
          />
        </FieldBlock>

        <FieldBlock label="Key strengths relevant to this role" aiDrafted={aiDraftedFields.has("key_strengths")}>
          <Textarea
            value={keyStrengths}
            onChange={(e) => { setKeyStrengths(e.target.value); markFieldEdited("key_strengths"); }}
            placeholder="Technical skills, experience, cultural fit, specific achievements..."
            rows={4}
            className="text-xs"
          />
        </FieldBlock>

        <FieldBlock label="Stated interest level" aiDrafted={aiDraftedFields.has("interest_level")}>
          <Select
            value={interestLevel}
            onValueChange={(v) => { setInterestLevel(v); markFieldEdited("interest_level"); }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {INTEREST_LEVELS.map((l) => (
                <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {interestReasoning && (
            <p className="text-[10px] text-muted-foreground mt-1 italic">AI read: {interestReasoning}</p>
          )}
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

        <FieldBlock label="Concerns or risks" aiDrafted={aiDraftedFields.has("concerns")}>
          <Textarea
            value={concerns}
            onChange={(e) => { setConcerns(e.target.value); markFieldEdited("concerns"); }}
            placeholder="Counter offer risk, other processes, gaps, anything client should know"
            rows={3}
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

      {/* AI Enhance — single-field rewrite for "Why suitable" */}
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={handleEnhanceWhy}
          disabled={enhancing}
        >
          {enhancing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Enhance "Why suitable"
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

function FieldBlock({
  label,
  aiDrafted,
  children,
}: {
  label: string;
  aiDrafted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        {aiDrafted && (
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1 gap-0.5 border-primary/30 text-primary"
            title="AI-generated draft — edit as needed"
          >
            <Sparkles className="h-2 w-2" /> AI draft — edit as needed
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}
