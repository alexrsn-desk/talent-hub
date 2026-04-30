import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, ClipboardCopy, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useInterviewByCandidateJob,
  useUpdateInterview,
  type Interview,
} from "@/hooks/use-interviews";
import { useCreateNote, useUpdateCandidateJob } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";

const FORMATS = ["In person", "Video call", "Phone"] as const;
const TYPES = ["Competency", "Technical", "Presentation", "Informal chat", "Case study", "Panel"] as const;
const DURATIONS = [30, 45, 60, 90, 120];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateJobId: string;
  stage: "First Interview" | "Second Interview";
  candidate: { id: string; name: string; first_name?: string | null; email?: string | null } | null;
  job: { id: string; title: string; clients?: { company_name?: string | null } | null } | null;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toTimeString().slice(0, 5);
}
function combine(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || "09:00";
  const d = new Date(`${date}T${t}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function dateHuman(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
function timeHuman(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function InterviewDetailsPanel({ open, onOpenChange, candidateJobId, stage, candidate, job }: Props) {
  const { user } = useAuth();
  const { data: existing } = useInterviewByCandidateJob(open ? candidateJobId : null, open ? stage : null);
  const updateInterview = useUpdateInterview();
  const updateCandidateJob = useUpdateCandidateJob();
  const createNote = useCreateNote();

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<string>("Video call");
  const [location, setLocation] = useState("");
  const [interviewers, setInterviewers] = useState("");
  const [interviewType, setInterviewType] = useState<string>("Competency");
  const [duration, setDuration] = useState<number>(45);
  const [prepNotes, setPrepNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Confirmation draft state
  const [step, setStep] = useState<"details" | "confirm">("details");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !existing) return;
    setDate(toDateInput(existing.scheduled_at));
    setTime(toTimeInput(existing.scheduled_at));
    setFormat(existing.format ?? "Video call");
    setLocation(existing.location ?? "");
    setInterviewers(existing.interviewers ?? "");
    setInterviewType(existing.interview_type ?? "Competency");
    setDuration(existing.duration_mins ?? 45);
    setPrepNotes(existing.prep_notes ?? "");
    setStep(existing.confirmation_sent_at ? "details" : "details");
  }, [open, existing?.id]);

  if (!candidate || !job) return null;
  const firstName = candidate.first_name || candidate.name.split(" ")[0];
  const company = job.clients?.company_name || "";

  const handleSaveDetails = async () => {
    if (!existing) {
      toast.error("Interview record not ready yet — try again in a moment.");
      return;
    }
    if (!date) { toast.error("Date is required"); return; }
    setSaving(true);
    try {
      const scheduled_at = combine(date, time);
      await updateInterview.mutateAsync({
        id: existing.id,
        scheduled_at,
        duration_mins: duration,
        format,
        location: location || null,
        interviewers: interviewers || null,
        interview_type: interviewType,
        prep_notes: prepNotes || null,
        details_captured_at: new Date().toISOString(),
      });
      // Mirror onto candidate_jobs.interview_date for the existing dashboard
      if (scheduled_at) {
        await updateCandidateJob.mutateAsync({ id: candidateJobId, interview_date: scheduled_at } as any);
      }
      toast.success("Interview details saved");
      // Now generate confirmation draft
      await generateConfirmation(scheduled_at);
      setStep("confirm");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const generateConfirmation = async (scheduled_at: string | null) => {
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-interview-message", {
        body: {
          kind: "confirmation",
          candidate_first_name: firstName,
          candidate_full_name: candidate.name,
          client_company: company,
          job_title: job.title,
          recruiter_name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "your recruiter",
          date_human: dateHuman(scheduled_at),
          time_human: timeHuman(scheduled_at),
          format,
          location: location || null,
          interviewers: interviewers || null,
          interview_type: interviewType,
          duration_mins: duration,
          prep_focus: prepNotes || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraftSubject(data.subject ?? `Interview confirmed — ${job.title} at ${company}`);
      setDraftBody(data.body ?? "");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to draft confirmation");
      setDraftSubject(`Interview confirmed — ${job.title} at ${company}`);
      setDraftBody("");
    } finally {
      setDrafting(false);
    }
  };

  const copyDraft = async () => {
    await navigator.clipboard.writeText(`Subject: ${draftSubject}\n\n${draftBody}`);
    toast.success("Copied confirmation to clipboard");
  };

  const markSent = async () => {
    if (!existing) return;
    setSending(true);
    try {
      await updateInterview.mutateAsync({
        id: existing.id,
        confirmation_sent_at: new Date().toISOString(),
      });
      // Log as touchpoint
      await createNote.mutateAsync({
        content: `Interview confirmation sent — ${job.title} at ${company} on ${dateHuman(combine(date, time))} ${timeHuman(combine(date, time))}\n\n${draftBody}`,
        candidate_id: candidate.id,
        job_id: job.id,
        activity_type: "Email",
      });
      toast.success("Marked as sent");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> {stage} — {candidate.name}
          </SheetTitle>
          <SheetDescription>{job.title}{company ? ` · ${company}` : ""}</SheetDescription>
        </SheetHeader>

        {step === "details" && (
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Location or video link</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://meet.… / Office address" />
            </div>

            <div>
              <Label>Who they will meet</Label>
              <Input
                value={interviewers}
                onChange={(e) => setInterviewers(e.target.value)}
                placeholder="James Brown — Head of Engineering, Sarah Collins — VP Engineering"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Interview type</Label>
                <Select value={interviewType} onValueChange={setInterviewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map(d => <SelectItem key={d} value={String(d)}>{d} mins</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Specific preparation needed (optional)</Label>
              <Textarea
                value={prepNotes}
                onChange={(e) => setPrepNotes(e.target.value)}
                placeholder="e.g. They will be asked to walk through a system design"
                className="min-h-[70px]"
              />
            </div>

            <Button className="w-full mt-2" onClick={handleSaveDetails} disabled={saving || !existing}>
              {saving ? "Saving…" : "Save interview details"}
            </Button>
            {!existing && (
              <p className="text-xs text-muted-foreground">Setting up interview record…</p>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Draft confirmation for {firstName}. Edit as needed, then mark as sent.
            </p>
            {drafting ? (
              <p className="text-sm text-muted-foreground">Drafting…</p>
            ) : (
              <>
                <div>
                  <Label>Subject</Label>
                  <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    className="min-h-[260px] text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={copyDraft}>
                    <ClipboardCopy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <Button className="flex-1" onClick={markSent} disabled={sending || !draftBody.trim()}>
                    <Send className="h-3.5 w-3.5 mr-1" />
                    {sending ? "Saving…" : "Mark sent"}
                  </Button>
                </div>
                <Button variant="ghost" className="w-full" onClick={() => setStep("details")}>
                  Back to details
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
