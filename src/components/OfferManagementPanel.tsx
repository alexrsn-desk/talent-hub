import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  ShieldAlert,
  Sparkles,
  Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useOfferByCandidateJob,
  useUpdateOffer,
  useCounterOffers,
  useCreateCounterOffer,
  useUpdateCounterOffer,
  type Offer,
  type CounterOffer,
} from "@/hooks/use-offers";
import { useCreateNote } from "@/hooks/use-data";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateJobId: string;
  candidate: { id: string; name: string; first_name?: string | null; salary_expectation?: number | null; current_employer?: string | null; notice_period?: string | null } | null;
  job: { id: string; title: string; clients?: { company_name?: string | null } | null } | null;
}

const CONDITIONS = ["References", "Background check", "Medical", "Other"] as const;

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `£${Number(n).toLocaleString()}`;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function daysSince(d: string | null | undefined) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function RiskPill({ level, label }: { level: Offer["overall_risk"]; label: string }) {
  const cls =
    level === "high"
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : level === "medium"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : level === "low"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`${cls} text-[10px] uppercase`}>
      {label}: {level ?? "not assessed"}
    </Badge>
  );
}

export function OfferManagementPanel({ open, onOpenChange, candidateJobId, candidate, job }: Props) {
  const { data: offer, refetch } = useOfferByCandidateJob(open ? candidateJobId : null);
  const updateOffer = useUpdateOffer();
  const createNote = useCreateNote();

  // Form state mirrors offer
  const [offerType, setOfferType] = useState<"verbal" | "written">("verbal");
  const [salaryOffered, setSalaryOffered] = useState<string>("");
  const [startDateProposed, setStartDateProposed] = useState<string>("");
  const [noticeWeeks, setNoticeWeeks] = useState<string>("");
  const [benefits, setBenefits] = useState<string>("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [conditionsOther, setConditionsOther] = useState<string>("");
  const [acceptanceDeadline, setAcceptanceDeadline] = useState<string>("");
  const [writtenOfferDate, setWrittenOfferDate] = useState<string>("");

  const [savingDetails, setSavingDetails] = useState(false);
  const [assessing, setAssessing] = useState(false);

  // Dialog state for sub-flows
  const [resignationDate, setResignationDate] = useState<string>("");
  const [counterOpen, setCounterOpen] = useState(false);

  useEffect(() => {
    if (!offer || !open) return;
    setOfferType(offer.offer_type ?? "verbal");
    setSalaryOffered(offer.salary_offered?.toString() ?? "");
    setStartDateProposed(offer.start_date_proposed ?? "");
    setNoticeWeeks(offer.notice_period_weeks?.toString() ?? "");
    setBenefits(offer.benefits_notes ?? "");
    setConditions(offer.conditions ?? []);
    setConditionsOther(offer.conditions_other ?? "");
    setAcceptanceDeadline(offer.acceptance_deadline ?? "");
    setWrittenOfferDate(offer.written_offer_date ?? "");
    setResignationDate(offer.resignation_planned_date ?? "");
  }, [offer?.id, open]);

  const expectation = candidate?.salary_expectation ?? offer?.candidate_expectation_snapshot ?? null;
  const offered = Number(salaryOffered || 0) || null;
  const salaryDelta = useMemo(() => {
    if (!offered || !expectation) return null;
    return offered - expectation;
  }, [offered, expectation]);

  const earliestStart = useMemo(() => {
    const w = Number(noticeWeeks);
    if (!w && w !== 0) return null;
    const base = offer?.verbal_offer_date ? new Date(offer.verbal_offer_date) : new Date();
    return new Date(base.getTime() + w * 7 * 86400000);
  }, [noticeWeeks, offer?.verbal_offer_date]);

  if (!candidate || !job) return null;
  const firstName = candidate.first_name || candidate.name.split(" ")[0];
  const company = job.clients?.company_name || "";

  const handleSaveDetails = async () => {
    if (!offer) {
      toast.error("Offer record not ready — try again in a moment.");
      return;
    }
    setSavingDetails(true);
    try {
      await updateOffer.mutateAsync({
        id: offer.id,
        offer_type: offerType,
        salary_offered: offered,
        start_date_proposed: startDateProposed || null,
        notice_period_weeks: noticeWeeks === "" ? null : Number(noticeWeeks),
        benefits_notes: benefits || null,
        conditions,
        conditions_other: conditions.includes("Other") ? conditionsOther || null : null,
        acceptance_deadline: acceptanceDeadline || null,
        written_offer_date: writtenOfferDate || null,
      });
      toast.success("Offer details saved");
      await runRiskAssessment();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSavingDetails(false);
    }
  };

  const runRiskAssessment = async () => {
    if (!offer || !candidate) return;
    setAssessing(true);
    try {
      // Pull recent candidate notes / signals to feed the model
      const [notesRes, signalsRes] = await Promise.all([
        supabase.from("notes").select("content,created_at,activity_type").eq("candidate_id", candidate.id).order("created_at", { ascending: false }).limit(15),
        supabase.from("call_signals").select("signal_type,trigger_phrase,explanation,created_at").order("created_at", { ascending: false }).limit(10),
      ]);
      const notesText = (notesRes.data ?? [])
        .map((n: any) => `[${n.created_at?.slice(0, 10)} · ${n.activity_type}] ${n.content}`)
        .join("\n\n");
      const signalsText = (signalsRes.data ?? [])
        .map((s: any) => `${s.signal_type}: "${s.trigger_phrase}" — ${s.explanation}`)
        .join("\n");

      const { data, error } = await supabase.functions.invoke("assess-offer-risk", {
        body: {
          kind: "risk_assessment",
          candidate_first_name: firstName,
          client_company: company,
          job_title: job.title,
          salary_offered: offered,
          candidate_expectation: expectation,
          notice_period_weeks: noticeWeeks === "" ? null : Number(noticeWeeks),
          start_date_proposed: startDateProposed || null,
          candidate_notes: notesText,
          motivations: null,
          prior_signals: signalsText,
          current_employer: candidate.current_employer ?? null,
          time_in_current_role: null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await updateOffer.mutateAsync({
        id: offer.id,
        counter_offer_risk: data.counter_offer_risk,
        counter_offer_reasons: data.counter_offer_reasons,
        acceptance_risk: data.acceptance_risk,
        acceptance_reasons: data.acceptance_reasons,
        start_date_risk: data.start_date_risk,
        start_date_reasons: data.start_date_reasons,
        overall_risk: data.overall_risk,
        risk_assessed_at: new Date().toISOString(),
      });
      await refetch();
      toast.success("Risk assessment updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Risk assessment failed");
    } finally {
      setAssessing(false);
    }
  };

  const logAcceptance = async () => {
    if (!offer) return;
    await updateOffer.mutateAsync({
      id: offer.id,
      candidate_decision: "accepted",
      decision_logged_at: new Date().toISOString(),
    });
    await createNote.mutateAsync({
      content: `Offer accepted — ${job.title} at ${company}`,
      candidate_id: candidate.id,
      job_id: job.id,
      activity_type: "Note",
    });
    toast.success("Acceptance logged");
  };

  const logDecline = async () => {
    if (!offer) return;
    await updateOffer.mutateAsync({
      id: offer.id,
      candidate_decision: "declined",
      decision_logged_at: new Date().toISOString(),
    });
    toast.message("Offer marked declined");
  };

  const logResignationPlan = async () => {
    if (!offer) return;
    await updateOffer.mutateAsync({
      id: offer.id,
      resignation_planned_date: resignationDate || null,
    });
    toast.success("Resignation plan logged");
  };

  const logResignationHandedIn = async () => {
    if (!offer) return;
    await updateOffer.mutateAsync({
      id: offer.id,
      resignation_handed_in_date: new Date().toISOString().slice(0, 10),
    });
    toast.success("Resignation handed in");
  };

  const updateChecklist = async (k: keyof Offer, v: boolean) => {
    if (!offer) return;
    await updateOffer.mutateAsync({ id: offer.id, [k]: v } as any);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4" /> Offer — {candidate.name}
          </SheetTitle>
          <SheetDescription>
            {job.title}{company ? ` · ${company}` : ""}
          </SheetDescription>
        </SheetHeader>

        {!offer && (
          <div className="text-sm text-muted-foreground mt-6">Setting up offer record…</div>
        )}

        {offer && (
          <div className="space-y-5 mt-4">
            {/* Status pill */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {offer.status.replace(/_/g, " ")}
              </Badge>
              {offer.overall_risk && (
                <RiskPill level={offer.overall_risk} label="overall risk" />
              )}
              <span className="text-xs text-muted-foreground">
                Day {daysSince(offer.verbal_offer_date) + 1} of offer
              </span>
            </div>

            {/* ============== OFFER DETAILS ============== */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Offer details</h3>

              <div>
                <Label>Offer type</Label>
                <Select value={offerType} onValueChange={(v) => setOfferType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verbal">Verbal</SelectItem>
                    <SelectItem value="written">Written — letter received</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {offerType === "written" && (
                <div>
                  <Label>Written offer received</Label>
                  <Input type="date" value={writtenOfferDate} onChange={(e) => setWrittenOfferDate(e.target.value)} />
                </div>
              )}

              <div>
                <Label>Salary offered (£)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={salaryOffered}
                  onChange={(e) => setSalaryOffered(e.target.value)}
                  placeholder="e.g. 85000"
                />
                {expectation != null && (
                  <p className="text-xs mt-1">
                    Candidate's expectation: {fmtMoney(expectation)}.{" "}
                    {salaryDelta == null ? null : salaryDelta === 0 ? (
                      <span className="text-emerald-400">✅ At expectation</span>
                    ) : salaryDelta > 0 ? (
                      <span className="text-emerald-400">✅ {fmtMoney(salaryDelta)} above expectation</span>
                    ) : (
                      <span className="text-amber-400">⚠️ {fmtMoney(Math.abs(salaryDelta))} below expectation — risk</span>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start date proposed</Label>
                  <Input type="date" value={startDateProposed} onChange={(e) => setStartDateProposed(e.target.value)} />
                </div>
                <div>
                  <Label>Notice (weeks)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={noticeWeeks}
                    onChange={(e) => setNoticeWeeks(e.target.value)}
                    placeholder="e.g. 4"
                  />
                </div>
              </div>
              {earliestStart && (
                <p className="text-xs text-muted-foreground">
                  Earliest possible start: <span className="text-foreground">{fmtDate(earliestStart.toISOString())}</span>
                </p>
              )}

              <div>
                <Label>Benefits / bonus / equity (optional)</Label>
                <Textarea value={benefits} onChange={(e) => setBenefits(e.target.value)} className="min-h-[60px]" />
              </div>

              <div>
                <Label>Conditions on offer</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {CONDITIONS.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={conditions.includes(c)}
                        onCheckedChange={(v) =>
                          setConditions((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
                {conditions.includes("Other") && (
                  <Input className="mt-2" value={conditionsOther} onChange={(e) => setConditionsOther(e.target.value)} placeholder="Describe other condition" />
                )}
              </div>

              <div>
                <Label>Acceptance deadline (optional)</Label>
                <Input type="date" value={acceptanceDeadline} onChange={(e) => setAcceptanceDeadline(e.target.value)} />
              </div>

              <Button className="w-full" onClick={handleSaveDetails} disabled={savingDetails || assessing}>
                {savingDetails ? "Saving…" : assessing ? "Running risk assessment…" : "Save offer details & assess risk"}
              </Button>
            </section>

            <Separator />

            {/* ============== RISK ASSESSMENT ============== */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Risk assessment
                </h3>
                <Button size="sm" variant="ghost" onClick={runRiskAssessment} disabled={assessing}>
                  {assessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  Re-run
                </Button>
              </div>

              {!offer.risk_assessed_at && !assessing && (
                <p className="text-xs text-muted-foreground">Save offer details to run the first risk assessment.</p>
              )}

              <div className="space-y-2">
                {(["counter_offer", "acceptance", "start_date"] as const).map((k) => {
                  const level = (offer as any)[`${k}_risk`] as Offer["overall_risk"];
                  const reason = (offer as any)[`${k}_reasons`] as string | null;
                  const label =
                    k === "counter_offer" ? "Counter offer" : k === "acceptance" ? "Acceptance" : "Start date";
                  if (!level) return null;
                  return (
                    <div key={k} className="rounded-md border border-border p-2 text-xs space-y-1">
                      <RiskPill level={level} label={label} />
                      {reason && <p className="text-muted-foreground">{reason}</p>}
                    </div>
                  );
                })}
              </div>

              {offer.overall_risk === "high" && offer.candidate_decision === "pending" && (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-medium text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> High risk — call {firstName} today
                  </div>
                  <p className="text-muted-foreground">
                    Have you told your manager yet? When are you planning to resign? Do you want to talk through how to handle that conversation?
                  </p>
                </div>
              )}
            </section>

            <Separator />

            {/* ============== TIMELINE ============== */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Timeline</h3>
              <ul className="space-y-1.5 text-xs">
                <TimelineRow label="Verbal offer extended" date={offer.verbal_offer_date} />
                <TimelineRow label="Written offer received" date={offer.written_offer_date} pending={offer.offer_type === "verbal" && !offer.written_offer_date ? "pending" : undefined} />
                <TimelineRow label="Acceptance deadline" date={offer.acceptance_deadline} />
                <TimelineRow
                  label="Candidate decision"
                  date={offer.decision_logged_at}
                  pending={offer.candidate_decision === "pending" ? "pending" : offer.candidate_decision}
                />
                <TimelineRow label="Resignation planned" date={offer.resignation_planned_date} />
                <TimelineRow label="Resignation handed in" date={offer.resignation_handed_in_date} />
                <TimelineRow label="Counter offer received" date={offer.counter_offer_received_date ?? null} pending={!offer.counter_offer_received_date ? "none" : undefined} />
                <TimelineRow label="Resignation accepted" date={offer.resignation_accepted_date} />
                <TimelineRow label="Start date confirmed" date={offer.start_date_confirmed} />
              </ul>
            </section>

            {/* Decision actions */}
            {offer.candidate_decision === "pending" && (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={logAcceptance}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Log acceptance
                </Button>
                <Button variant="outline" className="flex-1" onClick={logDecline}>
                  Mark declined
                </Button>
              </div>
            )}

            {/* Resignation flow */}
            {offer.candidate_decision === "accepted" && !offer.resignation_handed_in_date && (
              <section className="space-y-2 rounded-md border border-border p-3">
                <h4 className="text-sm font-medium">Resignation</h4>
                <p className="text-xs text-muted-foreground">
                  {firstName} has accepted. The next critical step is resignation — when are they planning to hand in their notice?
                </p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Planned resignation date</Label>
                    <Input type="date" value={resignationDate} onChange={(e) => setResignationDate(e.target.value)} />
                  </div>
                  <Button size="sm" onClick={logResignationPlan}>Log plan</Button>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={logResignationHandedIn}>
                  Mark resignation handed in
                </Button>
              </section>
            )}

            {/* Counter offer button */}
            {offer.candidate_decision === "accepted" && (
              <Button variant="outline" className="w-full" onClick={() => setCounterOpen(true)}>
                Log counter offer
              </Button>
            )}

            {/* Pre-start checklist */}
            {offer.resignation_handed_in_date && !offer.pre_start_placement_ready && (
              <section className="space-y-2 rounded-md border border-border p-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Trophy className="h-4 w-4" /> Pre-start checklist
                </h4>
                {[
                  ["pre_start_candidate_called", "Called candidate — confirmed starting"],
                  ["pre_start_client_called", "Called client — confirmed start logistics"],
                  ["pre_start_candidate_briefed", "Candidate has all details for day one"],
                  ["pre_start_placement_ready", "Placement record ready for invoice"],
                ].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={(offer as any)[k] as boolean}
                      onCheckedChange={(v) => updateChecklist(k as keyof Offer, !!v)}
                    />
                    {label}
                  </label>
                ))}
              </section>
            )}

            {offer.pre_start_placement_ready && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex items-center gap-2">
                <Trophy className="h-4 w-4 text-emerald-400" />
                Placement complete — move {firstName} to Placed to finalise.
              </div>
            )}
          </div>
        )}

        {/* Counter offer dialog */}
        {offer && (
          <CounterOfferDialog
            open={counterOpen}
            onOpenChange={setCounterOpen}
            offer={offer}
            candidate={candidate}
            company={company}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TimelineRow({ label, date, pending }: { label: string; date: string | null | undefined; pending?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border/50 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={date ? "text-foreground" : "text-muted-foreground italic"}>
        {date ? fmtDate(date) : pending ?? "pending"}
      </span>
    </li>
  );
}

// ===========================================================================
// Counter offer sub-dialog
// ===========================================================================
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

function CounterOfferDialog({
  open,
  onOpenChange,
  offer,
  candidate,
  company,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer: Offer;
  candidate: { id: string; name: string; first_name?: string | null; salary_expectation?: number | null };
  company: string;
}) {
  const updateOffer = useUpdateOffer();
  const create = useCreateCounterOffer();
  const update = useUpdateCounterOffer();
  const { data: existing = [] } = useCounterOffers(open ? offer.id : null);

  const current = existing[0] as CounterOffer | undefined;
  const [amount, setAmount] = useState<string>("");
  const [otherChanges, setOtherChanges] = useState<string>("");
  const [reaction, setReaction] = useState<NonNullable<CounterOffer["candidate_reaction"]>>("undecided");
  const [strategy, setStrategy] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(current?.amount_offered?.toString() ?? "");
    setOtherChanges(current?.other_changes ?? "");
    setReaction(current?.candidate_reaction ?? "undecided");
    setStrategy(current?.ai_strategy ?? "");
  }, [open, current?.id]);

  const generateStrategy = async () => {
    setGenerating(true);
    try {
      // Pull candidate notes for context
      const { data: notesRows } = await supabase
        .from("notes").select("content,created_at,activity_type")
        .eq("candidate_id", candidate.id)
        .order("created_at", { ascending: false }).limit(15);
      const notesText = (notesRows ?? [])
        .map((n: any) => `[${n.created_at?.slice(0, 10)} · ${n.activity_type}] ${n.content}`)
        .join("\n\n");

      const { data, error } = await supabase.functions.invoke("assess-offer-risk", {
        body: {
          kind: "counter_offer_strategy",
          candidate_first_name: candidate.first_name || candidate.name.split(" ")[0],
          client_company: company,
          motivations: null,
          candidate_notes: notesText,
          original_offer: offer.salary_offered,
          current_salary: candidate.salary_expectation, // best proxy
          counter_amount: amount ? Number(amount) : null,
          counter_other_changes: otherChanges || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStrategy(data.message ?? "");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate strategy");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        offer_id: offer.id,
        amount_offered: amount ? Number(amount) : null,
        other_changes: otherChanges || null,
        candidate_reaction: reaction,
        ai_strategy: strategy || null,
        outcome: reaction === "declined" ? "declined" as const : "pending" as const,
      };
      if (current) await update.mutateAsync({ id: current.id, ...payload });
      else await create.mutateAsync(payload);

      // Mirror the headline date onto offers, set lost flag if accepted
      const updates: Partial<Offer> & { id: string } = {
        id: offer.id,
        counter_offer_received_date: new Date().toISOString().slice(0, 10),
      };
      if (reaction === "leaning_accept") {
        // Don't change status yet; recruiter must explicitly mark lost
      }
      await updateOffer.mutateAsync(updates);
      toast.success("Counter offer saved");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const markLost = async () => {
    if (!current) {
      toast.error("Save the counter offer details first.");
      return;
    }
    await update.mutateAsync({ id: current.id, outcome: "accepted", resolved_at: new Date().toISOString() });
    await updateOffer.mutateAsync({
      id: offer.id,
      candidate_decision: "declined",
      decision_logged_at: new Date().toISOString(),
    });
    toast.message("Counter offer accepted by candidate — offer withdrawn");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Counter offer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label>Counter amount (£)</Label>
            <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Other changes offered</Label>
            <Textarea value={otherChanges} onChange={(e) => setOtherChanges(e.target.value)} className="min-h-[60px]" />
          </div>
          <div>
            <Label>Candidate reaction</Label>
            <Select value={reaction} onValueChange={(v) => setReaction(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="leaning_accept">Leaning towards accepting counter</SelectItem>
                <SelectItem value="undecided">Undecided</SelectItem>
                <SelectItem value="leaning_decline">Leaning towards declining counter</SelectItem>
                <SelectItem value="declined">Declined counter offer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>AI retention strategy</Label>
              <Button size="sm" variant="ghost" onClick={generateStrategy} disabled={generating}>
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Generate
              </Button>
            </div>
            <Textarea value={strategy} onChange={(e) => setStrategy(e.target.value)} className="min-h-[140px] text-xs" />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={markLost}>Counter accepted — withdraw</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
