import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, GripVertical, X, Mail, Copy, Send, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { Job, Candidate } from "@/hooks/use-data";
import { useCreateCandidateJob, useUpdateCandidateJob, useCandidateJobs, useCreateNote } from "@/hooks/use-data";
import { logActivity } from "@/lib/activity-log";

type MinimalCandidate = Pick<Candidate, "id" | "name" | "job_title" | "current_employer" | "availability" | "salary_expectation" | "email">;

type Mode = "choose" | "individual" | "shortlist";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job: Job;
  candidates: MinimalCandidate[];
  recruiterName?: string;
}

interface Row {
  candidate: MinimalCandidate;
  note: string;
}

export function MultiCandidateSendDialog({ open, onOpenChange, job, candidates, recruiterName }: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const client = (job as any).clients;
  const clientCompany = client?.company_name || "your team";
  const contactName = client?.contact_name?.split(" ")?.[0] || "there";
  const clientEmail = client?.email || "";

  const defaultOpening = `Hi ${contactName},\n\nFollowing our conversation — here are my ${candidates.length} candidate${candidates.length === 1 ? "" : "s"} for your ${job.title} role.`;
  const defaultClosing = `Happy to arrange intro calls for anyone who looks interesting.\n\n${recruiterName || ""}`.trim();

  const [opening, setOpening] = useState(defaultOpening);
  const [closing, setClosing] = useState(defaultClosing);
  const [rows, setRows] = useState<Row[]>(candidates.map((c) => ({ candidate: c, note: "" })));
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const createCandidateJob = useCreateCandidateJob();
  const updateCandidateJob = useUpdateCandidateJob();
  const createNote = useCreateNote();
  const { data: existingCJs = [] } = useCandidateJobs(undefined, job.id);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setOpening(defaultOpening);
    setClosing(defaultClosing);
    setRows(candidates.map((c) => ({ candidate: c, note: "" })));
    setPreview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates]);

  const draftNotes = async () => {
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-shortlist-notes", {
        body: { job_id: job.id, candidate_ids: rows.map((r) => r.candidate.id) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const map = new Map<string, string>((data.notes || []).map((n: any) => [n.candidate_id, n.note]));
      setRows((prev) => prev.map((r) => ({ ...r, note: map.get(r.candidate.id) || r.note })));
      toast.success("Notes drafted");
    } catch (e: any) {
      toast.error(e.message || "Failed to draft notes");
    } finally {
      setDrafting(false);
    }
  };

  // Auto-draft when entering shortlist mode if no notes
  useEffect(() => {
    if (mode === "shortlist" && rows.every((r) => !r.note) && !drafting) {
      draftNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const moveCandidatesToSubmitted = async () => {
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    let ok = 0;
    for (const r of rows) {
      const existing = (existingCJs as any[]).find((cj) => cj.candidate_id === r.candidate.id);
      try {
        if (existing) {
          if (existing.stage !== "Submitted") {
            await updateCandidateJob.mutateAsync({ id: existing.id, stage: "Submitted" });
          }
        } else {
          await createCandidateJob.mutateAsync({
            candidate_id: r.candidate.id,
            job_id: job.id,
            stage: "Submitted",
            source: "ai",
          });
        }
        await createNote.mutateAsync({
          content: `Submitted to ${clientCompany} via shortlist email — ${today}`,
          activity_type: "Submission",
          candidate_id: r.candidate.id,
          job_id: job.id,
        });
        ok++;
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) console.warn("submit failed", e);
      }
    }
    return ok;
  };

  const buildShortlistEmailBody = () => {
    const parts: string[] = [opening.trim(), ""];
    for (const r of rows) {
      const c = r.candidate;
      parts.push(c.name);
      const sub: string[] = [];
      if (c.job_title) sub.push(c.job_title);
      if (c.current_employer) sub.push(`at ${c.current_employer}`);
      if (sub.length) parts.push(sub.join(" "));
      if (c.availability) parts.push(`Availability: ${c.availability}`);
      if (c.salary_expectation) parts.push(`Salary expectation: £${Number(c.salary_expectation).toLocaleString()}`);
      if (r.note?.trim()) parts.push("", r.note.trim());
      parts.push("");
    }
    if (closing.trim()) parts.push(closing.trim());
    return parts.join("\n");
  };

  const subjectLine = `Shortlist for ${job.title}${clientCompany && clientCompany !== "your team" ? ` — ${clientCompany}` : ""}`;

  const sendShortlist = async (viaMailto: boolean) => {
    setSending(true);
    try {
      const body = buildShortlistEmailBody();
      const ok = await moveCandidatesToSubmitted();
      await logActivity({
        action_type: "cv_sent",
        job_id: job.id,
        client_id: client?.id ?? null,
        metadata: {
          mode: "shortlist",
          candidate_count: rows.length,
          candidate_ids: rows.map((r) => r.candidate.id),
          subject: subjectLine,
        },
      });
      // Touchpoint note on the client
      if (client?.id) {
        await createNote.mutateAsync({
          content: `Sent shortlist email for ${job.title} — ${rows.length} candidate${rows.length === 1 ? "" : "s"}.`,
          activity_type: "Email",
          client_id: client.id,
          job_id: job.id,
        });
      }
      if (viaMailto) {
        const href = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(body)}`;
        window.open(href, "_blank");
      } else {
        await navigator.clipboard.writeText(`Subject: ${subjectLine}\n\n${body}`);
        toast.success("Email copied to clipboard");
      }
      toast.success(`${ok} candidate${ok === 1 ? "" : "s"} moved to Submitted`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to send shortlist");
    } finally {
      setSending(false);
    }
  };

  const sendIndividual = async () => {
    setSending(true);
    try {
      const ok = await moveCandidatesToSubmitted();
      await logActivity({
        action_type: "cv_sent",
        job_id: job.id,
        client_id: client?.id ?? null,
        metadata: { mode: "individual", candidate_count: rows.length, candidate_ids: rows.map((r) => r.candidate.id) },
      });
      toast.success(`${ok} candidate${ok === 1 ? "" : "s"} moved to Submitted`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setSending(false);
    }
  };

  // Drag and drop reorder
  const onDragStart = (i: number) => setDragIdx(i);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) return;
    setRows((prev) => {
      const next = prev.slice();
      const [m] = next.splice(dragIdx, 1);
      next.splice(i, 0, m);
      return next;
    });
    setDragIdx(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {mode === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>Send {rows.length} candidate{rows.length === 1 ? "" : "s"} to {clientCompany}</DialogTitle>
              <DialogDescription>Choose how to introduce these candidates.</DialogDescription>
            </DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setMode("individual")}
                className="text-left rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 p-4 transition"
              >
                <div className="flex items-center gap-2 mb-1"><Mail className="h-4 w-4 text-primary" /><span className="font-medium text-sm">Send individually</span></div>
                <p className="text-xs text-muted-foreground">One email per candidate. Best for targeted introductions.</p>
              </button>
              <button
                onClick={() => setMode("shortlist")}
                className="text-left rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 p-4 transition"
              >
                <div className="flex items-center gap-2 mb-1"><Send className="h-4 w-4 text-primary" /><span className="font-medium text-sm">Send as shortlist</span></div>
                <p className="text-xs text-muted-foreground">All candidates in one email. Best for presenting multiple options.</p>
              </button>
            </div>
          </>
        )}

        {mode === "individual" && (
          <>
            <DialogHeader>
              <DialogTitle>Send individually</DialogTitle>
              <DialogDescription>
                Each candidate gets their own email. They will be moved to <b>Submitted</b> on this job.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-2">
              {rows.map((r) => (
                <div key={r.candidate.id} className="flex items-center justify-between rounded border border-border p-2 text-sm">
                  <span>{r.candidate.name} <span className="text-muted-foreground text-xs">{r.candidate.job_title}</span></span>
                  <a
                    className="text-xs text-primary hover:underline"
                    href={`mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(`Candidate for ${job.title} — ${r.candidate.name}`)}&body=${encodeURIComponent(`Hi ${contactName},\n\nI'd like to introduce ${r.candidate.name} for your ${job.title} role.\n\n— ${recruiterName || ""}`)}`}
                    target="_blank" rel="noreferrer"
                  >
                    Open draft
                  </a>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" onClick={() => setMode("choose")}>Back</Button>
              <Button onClick={sendIndividual} disabled={sending}>
                {sending ? "Submitting…" : "Mark all as Submitted"}
              </Button>
            </div>
          </>
        )}

        {mode === "shortlist" && !preview && (
          <>
            <DialogHeader>
              <DialogTitle>Shortlist email builder</DialogTitle>
              <DialogDescription>
                To: <span className="font-medium">{client?.contact_name || "—"}</span>
                {clientEmail ? <> · {clientEmail}</> : null}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <Input value={subjectLine} readOnly className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Opening</label>
                <Textarea rows={3} value={opening} onChange={(e) => setOpening(e.target.value)} className="text-sm" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Candidates (drag to reorder)</label>
                  <Button size="sm" variant="outline" onClick={draftNotes} disabled={drafting} className="gap-1 h-7">
                    {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    Re-draft all notes
                  </Button>
                </div>
                {rows.map((r, i) => (
                  <div
                    key={r.candidate.id}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop(i)}
                    className="rounded-lg border border-border bg-card/40 p-3 space-y-1.5"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 cursor-grab" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{r.candidate.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.candidate.job_title}{r.candidate.current_employer ? ` · ${r.candidate.current_employer}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.candidate.availability ? `Availability: ${r.candidate.availability}` : ""}
                          {r.candidate.salary_expectation ? `${r.candidate.availability ? " · " : ""}Salary: £${Number(r.candidate.salary_expectation).toLocaleString()}` : ""}
                        </div>
                      </div>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove from shortlist"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      rows={3}
                      value={r.note}
                      onChange={(e) => setRows((prev) => prev.map((row, idx) => idx === i ? { ...row, note: e.target.value } : row))}
                      placeholder={drafting ? "Drafting…" : "Client-ready note — 2-3 punchy lines about why this candidate fits THIS role"}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Closing</label>
                <Textarea rows={3} value={closing} onChange={(e) => setClosing(e.target.value)} className="text-sm" />
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-3">
              <Button variant="outline" onClick={() => setMode("choose")}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPreview(true)}>Preview</Button>
                <Button onClick={() => sendShortlist(true)} disabled={sending || rows.length === 0} className="gap-1">
                  <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </>
        )}

        {mode === "shortlist" && preview && (
          <>
            <DialogHeader>
              <DialogTitle>Preview</DialogTitle>
              <DialogDescription>This is exactly what {client?.contact_name || "the client"} will receive.</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border bg-background p-4 text-sm space-y-2 max-h-[55vh] overflow-y-auto">
              <div className="text-xs text-muted-foreground">To: {clientEmail || "—"}</div>
              <div className="text-xs text-muted-foreground">Subject: <span className="text-foreground">{subjectLine}</span></div>
              <hr className="border-border" />
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{buildShortlistEmailBody()}</pre>
            </div>
            <div className="flex justify-between gap-2 pt-3">
              <Button variant="outline" onClick={() => setPreview(false)}>Edit</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => sendShortlist(false)} disabled={sending} className="gap-1">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button onClick={() => sendShortlist(true)} disabled={sending} className="gap-1">
                  <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
