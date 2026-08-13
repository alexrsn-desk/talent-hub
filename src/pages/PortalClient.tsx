import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import {
  clientAddFeedback,
  clientAddNote,
  clientMoveCandidate,
  clientSaveScheduling,
  clientSaveStageContent,
  getClientPortal,
} from "@/lib/portal.functions";

const TABS = ["board", "notes", "prep", "scheduling"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  board: "Review board",
  notes: "General notes",
  prep: "Interview prep & details",
  scheduling: "Scheduling & settings",
};

export function formatStamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClientPortal() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const [reviewer, setReviewer] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [tab, setTab] = useState<Tab>("board");

  useEffect(() => {
    document.title = "Candidate review board";
    setReviewer(window.sessionStorage.getItem(`reviewer:${token}`));
  }, [token]);

  const portal = useQuery({
    queryKey: ["client-portal", token],
    queryFn: () => getClientPortal({ data: { token } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-portal", token] });

  const move = useMutation({
    mutationFn: (v: { candidateId: string; toStage: string; reject?: boolean }) =>
      clientMoveCandidate({
        data: {
          token,
          candidateId: v.candidateId,
          toStage: v.toStage,
          reject: v.reject ?? false,
          actorEmail: reviewer,
        },
      }),
    onSuccess: () => {
      toast.success("Pipeline updated");
      invalidate();
    },
    onError: () => toast.error("Could not update"),
  });

  const feedback = useMutation({
    mutationFn: (v: {
      candidateId: string;
      comment: string;
      rating: number | null;
      stage: string;
    }) =>
      clientAddFeedback({
        data: {
          token,
          candidateId: v.candidateId,
          comment: v.comment,
          rating: v.rating,
          stage: v.stage,
          clientEmail: reviewer,
        },
      }),
    onSuccess: () => {
      toast.success("Feedback saved");
      invalidate();
    },
    onError: () => toast.error("Could not save feedback"),
  });

  const scheduling = useMutation({
    mutationFn: (v: { calendlyUrl: string | null; slots: { id: string; label: string }[] }) =>
      clientSaveScheduling({ data: { token, ...v } }),
    onSuccess: () => {
      toast.success("Scheduling saved");
      invalidate();
    },
  });

  const addNote = useMutation({
    mutationFn: (body: string) => clientAddNote({ data: { token, body, authorEmail: reviewer } }),
    onSuccess: () => {
      toast.success("Note added");
      invalidate();
    },
  });

  const saveStage = useMutation({
    mutationFn: (v: { stage: string; prepMaterial: string; interviewDetails: string }) =>
      clientSaveStageContent({ data: { token, ...v } }),
    onSuccess: () => {
      toast.success("Saved — candidates see this when they reach that stage");
      invalidate();
    },
  });

  if (portal.isLoading) {
    return <CenterNote text="Loading your board…" />;
  }
  if (!portal.data) {
    return <CenterNote text="This link isn't valid any more. Ask your recruiter for a new one." />;
  }

  if (!reviewer) {
    return (
      <div className="portal-scope flex min-h-screen items-center justify-center bg-surface px-4 text-foreground">
        <form
          className="panel w-full max-w-md p-8"
          onSubmit={(e) => {
            e.preventDefault();
            window.sessionStorage.setItem(`reviewer:${token}`, emailDraft);
            setReviewer(emailDraft);
          }}
        >
          <h1 className="text-2xl font-semibold">{portal.data.job.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email so we know who's reviewing. It's attached to your feedback only.
          </p>
          <input
            type="email"
            required
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="you@company.com"
            className="mt-5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            Open the board
          </button>
        </form>
      </div>
    );
  }

  const { job, candidates, scheduling: sched, notes, stageContent, notifications } = portal.data;
  const active = candidates.filter((c) => !c.rejected);
  const rejected = candidates.filter((c) => c.rejected);

  return (
    <div className="portal-scope min-h-screen bg-surface text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            {job.clientName}
          </p>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          {job.jobSpecUrl && (
            <a
              href={job.jobSpecUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm text-accent underline-offset-4 hover:underline"
            >
              <FileText className="size-4" />
              {job.jobSpecFilename ?? "Job description"}
            </a>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  tab === t ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
            <span className="ml-auto self-center text-xs text-muted-foreground">
              Reviewing as {reviewer}
            </span>
          </div>
        </div>
      </header>

      {tab === "board" && (
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 py-6">
          <div className="flex min-w-max gap-4">
            {job.stages.map((stage) => (
              <div key={stage} className="w-80 shrink-0">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{stage}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {active.filter((c) => c.currentStage === stage).length}
                  </span>
                </div>
                <div
                  className="min-h-24 space-y-3 rounded-xl bg-background/60 p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) move.mutate({ candidateId: id, toStage: stage });
                  }}
                >
                  {active
                    .filter((c) => c.currentStage === stage)
                    .map((c) => (
                      <CandidateCard
                        key={c.id}
                        candidate={c}
                        stages={job.stages}
                        onMove={(to) => move.mutate({ candidateId: c.id, toStage: to })}
                        onReject={() =>
                          move.mutate({ candidateId: c.id, toStage: stage, reject: true })
                        }
                        onFeedback={(comment, rating, fbStage) =>
                          feedback.mutate({
                            candidateId: c.id,
                            comment,
                            rating,
                            stage: fbStage,
                          })
                        }
                      />
                    ))}
                </div>
              </div>
            ))}

            {rejected.length > 0 && (
              <div className="w-80 shrink-0">
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Rejected</h2>
                <div className="space-y-3 rounded-xl bg-background/60 p-2">
                  {rejected.map((c) => (
                    <div key={c.id} className="panel p-4 opacity-75">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{c.headline}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "notes" && <NotesTab notes={notes} onAdd={(body) => addNote.mutate(body)} />}

      {tab === "prep" && <PrepTab content={stageContent} onSave={(v) => saveStage.mutate(v)} />}

      {tab === "scheduling" && (
        <SchedulingTab
          calendlyUrl={sched.calendlyUrl}
          slots={sched.slots}
          notifications={notifications}
          onSave={(v) => scheduling.mutate(v)}
        />
      )}
    </div>
  );
}

function CenterNote({ text }: { text: string }) {
  return (
    <div className="portal-scope flex min-h-screen items-center justify-center bg-surface px-4">
      <p className="max-w-sm text-center text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

type Candidate = {
  id: string;
  name: string;
  headline: string | null;
  clientNotes: string | null;
  currentStage: string;
  cvUrl: string | null;
  feedback: {
    id: string;
    client_email: string | null;
    stage_at_time: string | null;
    comment: string;
    rating: number | null;
    created_at: string;
  }[];
};

function CandidateCard({
  candidate,
  stages,
  onMove,
  onReject,
  onFeedback,
}: {
  candidate: Candidate;
  stages: string[];
  onMove: (stage: string) => void;
  onReject: () => void;
  onFeedback: (comment: string, rating: number | null, stage: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [fbStage, setFbStage] = useState(candidate.currentStage);
  const [openThread, setOpenThread] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", candidate.id)}
      className="panel cursor-grab p-4 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{candidate.name}</p>
          {candidate.headline && (
            <p className="text-sm text-muted-foreground">{candidate.headline}</p>
          )}
        </div>
        <button
          onClick={onReject}
          title="Reject candidate"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>

      {candidate.clientNotes && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-secondary/60 p-3 text-sm text-foreground/90">
          {candidate.clientNotes}
        </p>
      )}

      {candidate.cvUrl && (
        <a
          href={candidate.cvUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm text-accent underline-offset-4 hover:underline"
        >
          <FileText className="size-4" /> View CV
        </a>
      )}

      <select
        value={candidate.currentStage}
        onChange={(e) => {
          if (e.target.value === "__reject__") onReject();
          else onMove(e.target.value);
        }}
        className="mt-3 w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
      >
        {stages.map((s) => (
          <option key={s} value={s}>
            Move to {s}
          </option>
        ))}
        <option value="__reject__">Reject</option>
      </select>

      <button
        onClick={() => setOpenThread((v) => !v)}
        className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Feedback ({candidate.feedback.length})
      </button>

      {openThread && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {candidate.feedback.map((f) => (
            <div key={f.id} className="rounded-lg bg-surface p-3 text-sm">
              <p>{f.comment}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {f.client_email ?? "client"} · {formatStamp(f.created_at)}
                {f.stage_at_time ? ` · ${f.stage_at_time}` : ""}
                {f.rating ? ` · ${f.rating}/5` : ""}
              </p>
            </div>
          ))}
          <label className="block text-xs font-medium text-muted-foreground">
            Stage this relates to
            <select
              value={fbStage}
              onChange={(e) => setFbStage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm font-normal text-foreground"
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add your thoughts…"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n === rating ? null : n)}
                className="p-0.5"
                aria-label={`Rate ${n}`}
              >
                <Star
                  className={`size-4 ${rating && n <= rating ? "fill-accent text-accent" : "text-muted-foreground"}`}
                />
              </button>
            ))}
            <button
              onClick={() => {
                if (!comment.trim()) return;
                onFeedback(comment.trim(), rating, fbStage);
                setComment("");
                setRating(null);
              }}
              className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotesTab({
  notes,
  onAdd,
}: {
  notes: {
    id: string;
    author_role: string;
    author_email: string | null;
    body: string;
    created_at: string;
  }[];
  onAdd: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="panel p-6">
        <h2 className="text-lg font-semibold">General notes for the search</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search updates, patterns across candidates, changes to requirements. Every entry is kept
          with its timestamp — nothing overwrites anything.
        </p>
        <textarea
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. We're seeing strong platform engineers but light on payments experience…"
          className="mt-4 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => {
            if (!draft.trim()) return;
            onAdd(draft.trim());
            setDraft("");
          }}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Add note
        </button>

        <div className="mt-6 space-y-3 border-t border-border pt-6">
          {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg bg-surface p-4 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {n.author_email ?? n.author_role} · {formatStamp(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isInterviewStage(stage: string) {
  return /interview/i.test(stage);
}

function PrepTab({
  content,
  onSave,
}: {
  content: { stage: string; prepMaterial: string; interviewDetails: string }[];
  onSave: (v: { stage: string; prepMaterial: string; interviewDetails: string }) => void;
}) {
  const interviewStages = content.filter((c) => isInterviewStage(c.stage));

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="panel p-6">
        <h2 className="text-lg font-semibold">Interview prep &amp; details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only interview stages need prep — earlier stages like Submitted and Reviewed are skipped.
          Anything written here becomes visible on a candidate's portal the moment they reach that
          stage, and stays hidden until then.
        </p>
      </div>
      {interviewStages.length === 0 ? (
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">
            This job has no interview stages yet. Ask your recruiter to add one and prep fields will
            appear here.
          </p>
        </div>
      ) : (
        interviewStages.map((c) => <StageBlock key={c.stage} initial={c} onSave={onSave} />)
      )}
    </div>
  );
}

function StageBlock({
  initial,
  onSave,
}: {
  initial: { stage: string; prepMaterial: string; interviewDetails: string };
  onSave: (v: { stage: string; prepMaterial: string; interviewDetails: string }) => void;
}) {
  const [details, setDetails] = useState(initial.interviewDetails);
  const [prep, setPrep] = useState(initial.prepMaterial);

  return (
    <div className="panel p-6">
      <h3 className="font-semibold">{initial.stage}</h3>
      <div className="mt-4 grid gap-4">
        <div>
          <label className="text-sm font-medium">Interview details</label>
          <textarea
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Format, panel, duration, location or link…"
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Interview prep</label>
          <textarea
            rows={5}
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
            placeholder="What to read, sample questions, what good looks like…"
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <button
        onClick={() =>
          onSave({ stage: initial.stage, prepMaterial: prep, interviewDetails: details })
        }
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Save {initial.stage}
      </button>
    </div>
  );
}

function SchedulingTab({
  calendlyUrl,
  slots,
  notifications,
  onSave,
}: {
  calendlyUrl: string | null;
  slots: { id: string; label: string }[];
  notifications: {
    interview: boolean;
    rejection: boolean;
    interviewOverridden: boolean;
    rejectionOverridden: boolean;
    defaults: { interview: boolean; rejection: boolean };
  };
  onSave: (v: { calendlyUrl: string | null; slots: { id: string; label: string }[] }) => void;
}) {
  const [url, setUrl] = useState(calendlyUrl ?? "");
  const [list, setList] = useState(slots);
  const [draft, setDraft] = useState("");

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="panel p-6">
        <h2 className="text-lg font-semibold">Interview scheduling</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is what gets offered the moment you move someone to an Interview stage.
        </p>

        <div className="mt-6">
          <label className="text-sm font-medium">Booking link (Calendly or similar)</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://calendly.com/you/interview"
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium">Or offer fixed availability</p>
          <p className="text-xs text-muted-foreground">
            Used only when no booking link is set. We'll confirm requested slots with you.
          </p>
          <div className="mt-3 space-y-2">
            {list.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="size-4 text-accent" />
                  {s.label}
                </span>
                <button
                  onClick={() => setList((l) => l.filter((x) => x.id !== s.id))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Mon 9–11am"
              className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => {
                if (!draft.trim()) return;
                setList((l) => [...l, { id: crypto.randomUUID(), label: draft.trim() }]);
                setDraft("");
              }}
              className="rounded-lg border border-input px-3 py-2 text-sm hover:bg-secondary"
            >
              Add slot
            </button>
          </div>
        </div>

        <button
          onClick={() => onSave({ calendlyUrl: url.trim() || null, slots: list })}
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Save scheduling
        </button>
      </div>

      <div className="panel p-6">
        <h2 className="text-lg font-semibold">Candidate emails for this job</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Managed by your recruitment agency. Ask them if you'd like these changed.
        </p>
        <div className="mt-5 space-y-3">
          <StatusRow
            label="Email the candidate when they reach an Interview stage"
            on={notifications.interview}
          />
          <StatusRow
            label="Email the candidate when they're rejected"
            on={notifications.rejection}
          />
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3">
      <p className="text-sm">{label}</p>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          on ? "bg-accent/15 text-accent" : "border border-input text-muted-foreground"
        }`}
      >
        {on ? "On" : "Off"}
      </span>
    </div>
  );
}
