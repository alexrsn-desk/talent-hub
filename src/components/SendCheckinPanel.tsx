import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Mail, Send, ChevronLeft, Sparkles, Check, AlertTriangle, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateCandidate, useCreateNote, type Candidate } from "@/hooks/use-data";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Draft {
  subject: string;
  body: string;
  recruiterName: string;
  loading: boolean;
  error?: string;
  reviewed?: boolean;
  sent?: boolean;
  awaitingResponse?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: Candidate[];
}

const MAX_BULK = 20;

function isWithinSendingWindow(): { ok: boolean; reason?: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return { ok: false, reason: "Check-ins are weekday-only — try again Mon–Fri." };
  const h = now.getHours();
  if (h < 8 || h >= 18) return { ok: false, reason: "Check-ins send between 8am–6pm only." };
  return { ok: true };
}

function buildGdprFooter(recruiterName: string) {
  const name = recruiterName?.trim() || "your recruiter";
  return `\n\n—\nYou are receiving this because you are registered with ${name}. Reply REMOVE to be deleted from our records.`;
}

export function SendCheckinPanel({ open, onOpenChange, candidates }: Props) {
  const isMulti = candidates.length > 1;
  const eligible = useMemo(
    () => candidates.filter((c) => c.email && c.status !== "Do Not Contact").slice(0, MAX_BULK),
    [candidates]
  );
  const skipped = candidates.length - eligible.length;
  const truncated = candidates.length > MAX_BULK;

  // drafts keyed by candidate id
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [stage, setStage] = useState<"summary" | "review" | "sending" | "complete" | "responded">(
    isMulti ? "summary" : "review"
  );
  const [reviewIndex, setReviewIndex] = useState(0); // for "review each individually"
  const [sendProgress, setSendProgress] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [respondedCandidate, setRespondedCandidate] = useState<Candidate | null>(null);

  const updateCandidate = useUpdateCandidate();
  const createNote = useCreateNote();

  // Reset on open
  useEffect(() => {
    if (open) {
      setDrafts({});
      setStage(isMulti ? "summary" : "review");
      setReviewIndex(0);
      setSendProgress(0);
      setSentCount(0);
      setRespondedCandidate(null);
      // Kick off draft generation for all eligible candidates
      eligible.forEach((c) => generateDraft(c));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const generateDraft = async (c: Candidate) => {
    setDrafts((d) => ({ ...d, [c.id]: { subject: "", body: "", recruiterName: "", loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke("draft-checkin-email", {
        body: { candidate_id: c.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDrafts((d) => ({
        ...d,
        [c.id]: {
          subject: data.subject || `Quick check in — ${c.first_name || c.name.split(" ")[0]}`,
          body: data.body || "",
          recruiterName: data.recruiter_name || "",
          loading: false,
        },
      }));
    } catch (e: any) {
      setDrafts((d) => ({
        ...d,
        [c.id]: {
          subject: `Quick check in — ${c.first_name || c.name.split(" ")[0]}`,
          body: "",
          recruiterName: "",
          loading: false,
          error: e?.message || "Failed to draft",
        },
      }));
    }
  };

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  const sendOne = async (c: Candidate): Promise<boolean> => {
    const draft = drafts[c.id];
    if (!draft || draft.loading || !draft.body.trim()) return false;
    const fullBody = draft.body.trim() + buildGdprFooter(draft.recruiterName);
    try {
      // Stub send — log touchpoint + activity. (Wire to Gmail/Outlook later.)
      await createNote.mutateAsync({
        content: `Check-in email sent — Subject: ${draft.subject}\n\n${fullBody}`,
        activity_type: "Email",
        outcome: "Sent",
        candidate_id: c.id,
      } as any);
      await logActivity({
        action_type: "checkin_sent",
        candidate_id: c.id,
        metadata: { subject: draft.subject, awaiting_response: true },
      });
      updateDraft(c.id, { sent: true, awaitingResponse: true });
      return true;
    } catch (e: any) {
      toast.error(`Failed to send to ${c.name}: ${e?.message ?? "unknown error"}`);
      return false;
    }
  };

  const handleSendSingle = async () => {
    const window = isWithinSendingWindow();
    if (!window.ok) { toast.error(window.reason!); return; }
    setStage("sending");
    const c = eligible[0];
    const ok = await sendOne(c);
    if (ok) {
      setSentCount(1);
      toast.success("Check-in email sent ✓");
      setRespondedCandidate(c);
      setStage("responded");
    } else {
      setStage("review");
    }
  };

  const handleSendAll = async () => {
    const window = isWithinSendingWindow();
    if (!window.ok) { toast.error(window.reason!); return; }
    setStage("sending");
    setSendProgress(0);
    setSentCount(0);
    let count = 0;
    for (let i = 0; i < eligible.length; i++) {
      const ok = await sendOne(eligible[i]);
      if (ok) count++;
      setSentCount(count);
      setSendProgress(Math.round(((i + 1) / eligible.length) * 100));
    }
    setStage("complete");
    toast.success(`${count} check-in email${count !== 1 ? "s" : ""} sent successfully`);
  };

  // ───────────────────────── render ─────────────────────────

  const renderSummary = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" /> Sending check-in to {eligible.length} candidate{eligible.length !== 1 ? "s" : ""}
        </DialogTitle>
        <DialogDescription>
          Each email is personalised individually using that candidate's profile data — not a mass identical email.
        </DialogDescription>
      </DialogHeader>

      {(skipped > 0 || truncated) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            {skipped > 0 && <p>{skipped} candidate{skipped !== 1 ? "s" : ""} skipped (no email or Do Not Contact).</p>}
            {truncated && <p>Capped at {MAX_BULK} per session — keeps it personal, not spam.</p>}
          </div>
        </div>
      )}

      <div className="max-h-[340px] overflow-y-auto rounded-md border border-border">
        {eligible.map((c) => {
          const d = drafts[c.id];
          return (
            <div key={c.id} className="px-3 py-2 border-b border-border/50 last:border-0 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.name} <span className="text-muted-foreground font-normal">· {c.status}</span></p>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Subject:</span>
                {d?.loading ? (
                  <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Drafting…</span>
                ) : d?.error ? (
                  <span className="text-red-400 truncate">{d.error}</span>
                ) : (
                  <span className="truncate text-foreground">{d?.subject}</span>
                )}
              </div>
            </div>
          );
        })}
        {eligible.length === 0 && (
          <p className="text-sm text-muted-foreground p-4 text-center">No eligible candidates to email.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <div className="flex gap-2">
          <Button variant="outline" disabled={eligible.length === 0} onClick={() => { setReviewIndex(0); setStage("review"); }}>
            Review each individually
          </Button>
          <Button
            disabled={eligible.length === 0 || Object.values(drafts).some((d) => d.loading)}
            onClick={handleSendAll}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" /> Send all ({eligible.length})
          </Button>
        </div>
      </div>
    </>
  );

  const renderReview = () => {
    const c = isMulti ? eligible[reviewIndex] : eligible[0];
    if (!c) return null;
    const d = drafts[c.id];

    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Check-in to {c.name}
            {isMulti && <span className="text-sm font-normal text-muted-foreground">— {reviewIndex + 1} of {eligible.length}</span>}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <Sparkles className="h-3 w-3 text-violet-400" /> AI-drafted from profile, tags, notes & your writing style. Fully editable.
          </DialogDescription>
        </DialogHeader>

        {d?.loading ? (
          <div className="py-12 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Drafting personalised email…
          </div>
        ) : d?.error ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p>Could not draft email: {d.error}</p>
              <Button size="sm" variant="outline" onClick={() => generateDraft(c)}>Retry</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input value={c.email || ""} disabled className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Subject</label>
              <Input
                value={d?.subject || ""}
                onChange={(e) => updateDraft(c.id, { subject: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Body</label>
              <Textarea
                value={d?.body || ""}
                onChange={(e) => updateDraft(c.id, { body: e.target.value })}
                rows={9}
                className="text-sm resize-none"
              />
            </div>

            {/* Preview the 3 response options that the recruiter sees */}
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">When they reply, log it as:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[11px] border-green-500/40 text-green-400">Yes — still open to new roles</Badge>
                <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-400">Not right now — check back in a few months</Badge>
                <Badge variant="outline" className="text-[11px] border-slate-500/40 text-slate-400">All sorted — found something</Badge>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              GDPR footer is appended automatically: “You are receiving this because you are registered with {d?.recruiterName || "your recruiter"}. Reply REMOVE to be deleted…”
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex gap-2">
            {isMulti && (
              <Button variant="ghost" onClick={() => setStage("summary")} className="gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            {!isMulti && (
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            )}
          </div>
          <div className="flex gap-2">
            {isMulti && reviewIndex < eligible.length - 1 && (
              <Button variant="outline" onClick={() => setReviewIndex((i) => i + 1)}>
                Next ({reviewIndex + 2}/{eligible.length})
              </Button>
            )}
            <Button
              disabled={!d || d.loading || !d.body.trim()}
              onClick={isMulti ? handleSendAll : handleSendSingle}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {isMulti ? `Send all (${eligible.length})` : "Send"}
            </Button>
          </div>
        </div>
      </>
    );
  };

  const renderSending = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Sending check-ins…
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-4">
        <Progress value={sendProgress} />
        <p className="text-sm text-center text-muted-foreground">
          {sentCount} of {eligible.length} sent
        </p>
      </div>
    </>
  );

  const renderComplete = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-green-400">
          <Check className="h-5 w-5" /> {sentCount} check-in email{sentCount !== 1 ? "s" : ""} sent successfully
        </DialogTitle>
        <DialogDescription>
          Each candidate is now flagged as <span className="text-amber-400">Awaiting response</span>. Log their reply from the candidate profile when it arrives.
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-end pt-2">
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </div>
    </>
  );

  if (stage === "responded" && respondedCandidate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <CheckinResponseHandler
            candidate={respondedCandidate}
            onClose={() => onOpenChange(false)}
            updateCandidate={updateCandidate.mutateAsync}
            createNote={createNote.mutateAsync}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-2xl", stage === "review" && "max-w-2xl")}>
        {stage === "summary" && renderSummary()}
        {stage === "review" && renderReview()}
        {stage === "sending" && renderSending()}
        {stage === "complete" && renderComplete()}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────── Response handler (single candidate) ─────────────────── */

interface ResponseProps {
  candidate: Candidate;
  onClose: () => void;
  updateCandidate: (args: any) => Promise<any>;
  createNote: (args: any) => Promise<any>;
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function CheckinResponseHandler({ candidate, onClose, updateCandidate, createNote }: ResponseProps) {
  const [step, setStep] = useState<"choose" | "yes" | "not_now" | "all_sorted" | "all_sorted_started" | "done">("choose");
  const [holdMonths, setHoldMonths] = useState<1 | 3 | 6>(3);
  const [yesCheckinDays, setYesCheckinDays] = useState<30 | 60 | 90>(60);
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const seniorRole = /head|director|chief|vp|lead|principal|senior/i.test(candidate.job_title || "");

  const handleYes = async () => {
    setSubmitting(true);
    await updateCandidate({
      id: candidate.id,
      status: "Active" as any,
      reengage_date: addDays(yesCheckinDays),
      reengage_reason: `Check-in confirmed: still open to roles. Next check-in in ${yesCheckinDays} days.`,
    } as any);
    await createNote({
      content: `Check-in response: still open to new roles. Next check-in scheduled for ${yesCheckinDays} days.`,
      activity_type: "Note",
      candidate_id: candidate.id,
    });
    await logActivity({ action_type: "checkin_response", candidate_id: candidate.id, metadata: { response: "yes_open", next_checkin_days: yesCheckinDays } });
    toast.success("Logged — next check-in scheduled");
    setSubmitting(false);
    onClose();
  };

  const handleNotNow = async () => {
    setSubmitting(true);
    await updateCandidate({
      id: candidate.id,
      status: "On Hold" as any,
      reengage_date: addMonths(holdMonths),
      reengage_reason: `Not right now — check back in ${holdMonths} month${holdMonths !== 1 ? "s" : ""}`,
    } as any);
    await createNote({
      content: `Check-in response: not right now. Re-engage in ${holdMonths} month${holdMonths !== 1 ? "s" : ""}.`,
      activity_type: "Note",
      candidate_id: candidate.id,
    });
    await logActivity({ action_type: "checkin_response", candidate_id: candidate.id, metadata: { response: "not_now", hold_months: holdMonths } });
    toast.success("Status set to On Hold");
    setSubmitting(false);
    onClose();
  };

  const handleAllSortedStarted = async (started: boolean) => {
    setSubmitting(true);
    const note = started
      ? `Check-in response: all sorted — started new role${companyName ? ` at ${companyName}` : ""}.`
      : `Check-in response: all sorted — not started yet.`;
    await updateCandidate({
      id: candidate.id,
      reengage_date: addMonths(9),
      reengage_reason: started
        ? `Recently started${companyName ? ` at ${companyName}` : " a new role"} — re-engage in 9 months`
        : "Sorted for now — re-engage in 9 months",
    } as any);
    await createNote({
      content: note,
      activity_type: "Note",
      candidate_id: candidate.id,
    });
    await logActivity({
      action_type: "checkin_response",
      candidate_id: candidate.id,
      metadata: { response: "all_sorted", started, company: companyName || null, senior_role: seniorRole },
    });
    if (started && seniorRole && companyName) {
      toast.info(`${companyName} could be a BD opportunity — consider adding to BD pipeline.`, { duration: 6000 });
    } else {
      toast.success("Logged — re-engage in 9 months");
    }
    setSubmitting(false);
    onClose();
  };

  if (step === "choose") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>How did {candidate.first_name || candidate.name.split(" ")[0]} respond?</DialogTitle>
          <DialogDescription>Optional — log a response now or close and log later from the profile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <button
            onClick={() => setStep("yes")}
            className="w-full text-left rounded-md border border-green-500/40 bg-green-500/5 hover:bg-green-500/10 p-3 transition-colors"
          >
            <p className="font-medium text-green-400">Yes — still open to new roles</p>
            <p className="text-xs text-muted-foreground mt-0.5">Stays Active. Schedule next check-in.</p>
          </button>
          <button
            onClick={() => setStep("not_now")}
            className="w-full text-left rounded-md border border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 p-3 transition-colors"
          >
            <p className="font-medium text-amber-400">Not right now — check back in a few months</p>
            <p className="text-xs text-muted-foreground mt-0.5">Status → On Hold. Set re-engage date.</p>
          </button>
          <button
            onClick={() => setStep("all_sorted")}
            className="w-full text-left rounded-md border border-slate-500/40 bg-slate-500/5 hover:bg-slate-500/10 p-3 transition-colors"
          >
            <p className="font-medium text-slate-300">All sorted — found something</p>
            <p className="text-xs text-muted-foreground mt-0.5">Re-engage in 9 months. BD opportunity?</p>
          </button>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Close — log later</Button>
        </div>
      </>
    );
  }

  if (step === "yes") {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-green-400">Still open — schedule next check-in</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">When should we check back in?</p>
          <div className="flex gap-2">
            {[30, 60, 90].map((d) => (
              <Button
                key={d}
                variant={yesCheckinDays === d ? "default" : "outline"}
                onClick={() => setYesCheckinDays(d as any)}
                className="flex-1"
              >
                {d} days
              </Button>
            ))}
          </div>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep("choose")}><ChevronLeft className="h-4 w-4" /> Back</Button>
          <Button onClick={handleYes} disabled={submitting}>Save</Button>
        </div>
      </>
    );
  }

  if (step === "not_now") {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-amber-400">Putting on hold — choose re-engage date</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            {[1, 3, 6].map((m) => (
              <Button
                key={m}
                variant={holdMonths === m ? "default" : "outline"}
                onClick={() => setHoldMonths(m as any)}
                className="flex-1"
              >
                {m} month{m !== 1 ? "s" : ""}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Will appear in AI Actions on {addMonths(holdMonths)}.
          </p>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep("choose")}><ChevronLeft className="h-4 w-4" /> Back</Button>
          <Button onClick={handleNotNow} disabled={submitting}>Save</Button>
        </div>
      </>
    );
  }

  if (step === "all_sorted") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Congratulations — have you started somewhere new?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Button variant="default" className="flex-1" onClick={() => setStep("all_sorted_started")}>Yes</Button>
            <Button variant="outline" className="flex-1" onClick={() => handleAllSortedStarted(false)} disabled={submitting}>No</Button>
          </div>
        </div>
        <div className="flex justify-start pt-2">
          <Button variant="ghost" onClick={() => setStep("choose")}><ChevronLeft className="h-4 w-4" /> Back</Button>
        </div>
      </>
    );
  }

  if (step === "all_sorted_started") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Where have they started? <span className="text-muted-foreground font-normal text-sm">(optional)</span></DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company name…"
            autoFocus
          />
          {seniorRole && companyName && (
            <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3 text-sm text-violet-300 flex items-start gap-2">
              <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Senior role detected — <strong>{companyName}</strong> could be a BD opportunity. Add to BD pipeline?
                Decide after saving.
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep("all_sorted")}><ChevronLeft className="h-4 w-4" /> Back</Button>
          <Button onClick={() => handleAllSortedStarted(true)} disabled={submitting}>Save</Button>
        </div>
      </>
    );
  }

  return null;
}
