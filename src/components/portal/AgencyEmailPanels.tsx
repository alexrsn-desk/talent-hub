import { useMutation } from "@tanstack/react-query";
import { Mail, Sparkles, UserX, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  bulkSendEmails,
  previewInterviewEmail,
  previewRejectionEmail,
  type EmailPreview,
} from "@/lib/agency.functions";

/* --------------------------- BULK EMAIL ACTION BAR ------------------------- */

export function CandidateEmailBulkBar({
  candidateIds,
  onClear,
  onSent,
}: {
  candidateIds: string[];
  onClear: () => void;
  onSent: () => void;
}) {
  const [tab, setTab] = useState<"general" | "reject">("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [markRejected, setMarkRejected] = useState(true);

  const send = useMutation({
    mutationFn: () =>
      bulkSendEmails({
        data:
          tab === "general"
            ? { candidateIds, kind: "general", subject, body }
            : { candidateIds, kind: "reject", markRejected },
      }),
    onSuccess: (res) => {
      const failed = res.results.filter((r) => !r.ok);
      toast.success(
        `${res.sent} email${res.sent === 1 ? "" : "s"} queued${failed.length ? ` · ${failed.length} failed` : ""}`,
      );
      setSubject("");
      setBody("");
      onSent();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!candidateIds.length) return null;

  return (
    <div className="panel sticky bottom-4 z-20 mt-4 border border-border bg-card p-4 shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">
          {candidateIds.length} selected
        </p>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => setTab("general")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "general" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <Mail className="size-3.5" /> General email
          </button>
          <button
            type="button"
            onClick={() => setTab("reject")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "reject" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <UserX className="size-3.5" /> Reject email
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
        >
          <X className="size-3.5" /> Clear
        </button>
      </div>

      {tab === "general" ? (
        <div className="mt-4 space-y-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message — use {{first_name}}, {{job_title}} or {{client_name}} to personalise."
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Each candidate gets their own rejection email, worded by this job's rejection mode
            (template or AI). Client feedback is never quoted.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markRejected}
              onChange={(e) => setMarkRejected(e.target.checked)}
            />
            Also mark them as rejected on the board
          </label>
        </div>
      )}

      <button
        type="button"
        disabled={send.isPending || (tab === "general" && (!subject.trim() || !body.trim()))}
        onClick={() => send.mutate()}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Mail className="size-4" />
        {send.isPending
          ? "Sending…"
          : tab === "general"
            ? `Send to ${candidateIds.length}`
            : `Send rejections to ${candidateIds.length}`}
      </button>
    </div>
  );
}

/* ----------------------------- EMAIL PREVIEWS ----------------------------- */

export function CandidateEmailPreview({
  candidateId,
  stages,
  currentStage,
}: {
  candidateId: string;
  stages: string[];
  currentStage: string;
}) {
  const [stage, setStage] = useState(currentStage);
  const [preview, setPreview] = useState<(EmailPreview & { kind: string }) | null>(null);

  const interview = useMutation({
    mutationFn: () => previewInterviewEmail({ data: { candidateId, stage } }),
    onSuccess: (p) => setPreview({ ...p, kind: "Interview invite" }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rejection = useMutation({
    mutationFn: () => previewRejectionEmail({ data: { candidateId } }),
    onSuccess: (p) => setPreview({ ...p, kind: "Rejection" }),
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = interview.isPending || rejection.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs"
          aria-label="Stage for the interview invite"
        >
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => interview.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
        >
          <Sparkles className="size-3.5" /> Preview interview invite
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => rejection.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
        >
          <Sparkles className="size-3.5" /> Preview rejection
        </button>
      </div>

      {pending && <p className="text-xs text-muted-foreground">Writing the email…</p>}

      {preview && !pending && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {preview.kind} · {preview.ai ? "AI worded" : "Template"}
            {preview.toEmail ? ` · to ${preview.toEmail}` : " · no email on file"}
          </p>
          <p className="mt-2 text-sm font-medium">{preview.subject}</p>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {preview.body}
          </div>
        </div>
      )}
    </div>
  );
}
