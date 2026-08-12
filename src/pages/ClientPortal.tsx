import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const REJECTED = "Rejected / Withdrawn";

type PortalCandidate = {
  candidate_job_id: string;
  candidate_id: string;
  stage: string;
  rejected: boolean;
  name: string;
  headline: string | null;
  client_ready_notes: string | null;
  cv_url: string | null;
};

type PortalFeedback = {
  id: string;
  candidate_job_id: string;
  client_email: string | null;
  stage_at_time: string | null;
  comment: string;
  rating: number | null;
  created_at: string;
};

type PortalData = {
  job: { id: string; title: string; location: string | null };
  client_name: string | null;
  stages: string[];
  interview_stages: string[];
  candidates: PortalCandidate[];
  feedback: PortalFeedback[];
  notes: { id: string; author_email: string | null; body: string; created_at: string }[];
  stage_content: { stage: string; prep_material: string | null; interview_details: string | null }[];
  scheduling: { calendly_url: string | null; slots: string[] };
  notification_settings: { label: string; on: boolean }[];
};

const TABS = [
  { id: "board", label: "Review board" },
  { id: "notes", label: "General notes" },
  { id: "prep", label: "Interview prep & details" },
  { id: "scheduling", label: "Scheduling & settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ── primitives ─────────────────────────────────────────── */

const inputCls =
  "w-full rounded-[10px] border border-border bg-card px-3 py-2 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-accent";
const selectCls =
  "w-full rounded-[10px] border border-border bg-card px-2.5 py-1.5 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-accent";
const primaryBtn =
  "rounded-[10px] bg-primary px-4 py-2 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";
const smallPrimaryBtn =
  "rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";
const outlinedBtn =
  "rounded-[10px] border border-border px-4 py-2 text-[14px] font-medium text-foreground transition-colors hover:bg-secondary";

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`portal-panel p-6 ${className}`}>{children}</div>;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── candidate card ─────────────────────────────────────── */

function CandidateCard({
  candidate,
  stages,
  feedback,
  actorEmail,
  onMove,
  onFeedback,
  pending,
}: {
  candidate: PortalCandidate;
  stages: string[];
  feedback: PortalFeedback[];
  actorEmail: string;
  onMove: (toStage: string, reject: boolean) => void;
  onFeedback: (args: { comment: string; rating: number | null; stage: string }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [stage, setStage] = useState(candidate.stage);

  return (
    <div
      className="portal-panel cursor-grab p-4 active:cursor-grabbing"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", candidate.candidate_job_id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-medium text-foreground">{candidate.name}</p>
          {candidate.headline && (
            <p className="truncate text-[14px] font-normal text-muted-foreground">{candidate.headline}</p>
          )}
        </div>
        <button
          type="button"
          title="Reject candidate"
          aria-label="Reject candidate"
          disabled={pending}
          onClick={() => onMove(candidate.stage, true)}
          className="rounded-[8px] p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {candidate.client_ready_notes && (
        <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-secondary/60 p-3 text-[14px] font-normal text-foreground/90">
          {candidate.client_ready_notes}
        </p>
      )}

      {candidate.cv_url && (
        <a
          href={candidate.cv_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[14px] text-accent hover:underline"
        >
          <FileText className="h-4 w-4" />
          View CV
        </a>
      )}

      <select
        className={`${selectCls} mt-3`}
        value=""
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v === "__reject") onMove(candidate.stage, true);
          else onMove(v, false);
        }}
      >
        <option value="">Move candidate…</option>
        {stages.map((s) => (
          <option key={s} value={s}>
            Move to {s}
          </option>
        ))}
        <option value="__reject">Reject</option>
      </select>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-3 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Feedback ({feedback.length})
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {feedback.map((f) => (
            <div key={f.id} className="rounded-[10px] bg-muted p-3">
              <p className="whitespace-pre-wrap text-[14px] text-foreground">{f.comment}</p>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {[f.client_email, formatWhen(f.created_at), f.stage_at_time, f.rating ? `${f.rating}/5` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ))}

          <select className={selectCls} value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <textarea
            rows={3}
            className={inputCls}
            placeholder="What did you think?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n} out of 5`}
                  onClick={() => setRating((r) => (r === n ? null : n))}
                  className="rounded-[8px] p-1.5"
                >
                  <Star
                    className={`h-4 w-4 ${rating && n <= rating ? "fill-accent text-accent" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              className={smallPrimaryBtn}
              disabled={!comment.trim() || !actorEmail}
              onClick={() => {
                onFeedback({ comment, rating, stage });
                setComment("");
                setRating(null);
              }}
            >
              Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── page ───────────────────────────────────────────────── */

export default function ClientPortal() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("board");
  const [actorEmail, setActorEmail] = useState<string>("");
  const [emailDraft, setEmailDraft] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem(`portal_email_${token}`);
    if (stored) setActorEmail(stored);
  }, [token]);

  const call = async (action: string, body: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("client-portal", {
      body: { action, token, ...body },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["client-portal", token],
    queryFn: async () => (await call("get")) as PortalData,
    enabled: !!token,
    retry: false,
  });

  const makeMutation = (action: string, successMessage: string) => ({
    mutationFn: (body: Record<string, unknown>) => call(action, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal", token] });
      toast({ title: successMessage });
    },
    onError: (e: Error) =>
      toast({ title: "Something went wrong", description: e.message, variant: "destructive" }),
  });

  const moveMutation = useMutation(makeMutation("move", "Pipeline updated"));
  const feedbackMutation = useMutation(makeMutation("add_feedback", "Feedback saved"));
  const noteMutation = useMutation(makeMutation("add_note", "Note added"));
  const stageMutation = useMutation(
    makeMutation("save_stage_content", "Saved — candidates see this when they reach that stage"),
  );
  const schedulingMutation = useMutation(
    makeMutation("save_scheduling", "Saved — candidates see this when they reach that stage"),
  );

  const columns = useMemo(() => {
    if (!data) return [] as { stage: string; items: PortalCandidate[] }[];
    const cols = data.stages.map((stage) => ({
      stage,
      items: data.candidates.filter((c) => !c.rejected && c.stage === stage),
    }));
    const rejected = data.candidates.filter((c) => c.rejected);
    if (rejected.length) cols.push({ stage: REJECTED, items: rejected });
    return cols;
  }, [data]);

  if (isLoading) {
    return (
      <div className="portal-root flex min-h-screen items-center justify-center bg-muted">
        <p className="text-[14px] text-muted-foreground">Loading your board…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="portal-root flex min-h-screen items-center justify-center bg-muted px-4">
        <p className="text-center text-[14px] text-muted-foreground">
          This link isn't valid any more. Ask your recruiter for a new one.
        </p>
      </div>
    );
  }

  if (!actorEmail) {
    return (
      <div className="portal-root flex min-h-screen items-center justify-center bg-muted px-4">
        <Panel className="w-full max-w-md p-8">
          <h1 className="text-[24px] font-semibold text-foreground">{data.job.title}</h1>
          <p className="mt-3 text-[14px] text-muted-foreground">
            Add your email so your recruiter knows who moved a candidate or left feedback. Anyone with this link can
            open the board.
          </p>
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const value = emailDraft.trim();
              if (!value) return;
              sessionStorage.setItem(`portal_email_${token}`, value);
              setActorEmail(value);
            }}
          >
            <input
              type="email"
              required
              className={inputCls}
              placeholder="you@company.com"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
            />
            <button type="submit" className={`${primaryBtn} w-full`}>
              Open the board
            </button>
          </form>
        </Panel>
      </div>
    );
  }

  const feedbackFor = (cjId: string) => data.feedback.filter((f) => f.candidate_job_id === cjId);
  const pending = moveMutation.isPending;

  return (
    <div className="portal-root min-h-screen bg-muted">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-8 sm:px-8 lg:px-16 lg:py-10">
          <div>
            {data.client_name && (
              <p className="text-[12px] font-medium uppercase tracking-wide text-accent">{data.client_name}</p>
            )}
            <h1 className="mt-1 text-[24px] font-semibold text-foreground">{data.job.title}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[12px] font-normal text-muted-foreground">Reviewing as {actorEmail}</p>
        </div>
      </header>

      <main className="px-4 py-8 sm:px-8 lg:px-16">
        {tab === "board" && (
          <div className="mx-auto max-w-7xl overflow-x-auto pb-4">
            <div className="flex gap-4">
              {columns.map((col) => {
                const isRejected = col.stage === REJECTED;
                return (
                  <section key={col.stage} className="w-[320px] shrink-0">
                    <div className="mb-3 flex items-center gap-2">
                      <h2 className={`text-[14px] font-semibold ${isRejected ? "text-muted-foreground" : "text-foreground"}`}>
                        {col.stage}
                      </h2>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[12px] font-normal text-muted-foreground">
                        {col.items.length}
                      </span>
                    </div>
                    <div
                      className="min-h-[96px] space-y-3 rounded-[16px] bg-background/60 p-2"
                      onDragOver={(e) => !isRejected && e.preventDefault()}
                      onDrop={(e) => {
                        if (isRejected) return;
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        if (id) moveMutation.mutate({ candidate_job_id: id, to_stage: col.stage, actor_email: actorEmail });
                      }}
                    >
                      {col.items.map((c) =>
                        isRejected ? (
                          <div key={c.candidate_job_id} className="portal-panel p-4 opacity-75">
                            <p className="text-[16px] font-medium text-foreground">{c.name}</p>
                            {c.headline && <p className="text-[14px] text-muted-foreground">{c.headline}</p>}
                          </div>
                        ) : (
                          <CandidateCard
                            key={c.candidate_job_id}
                            candidate={c}
                            stages={data.stages}
                            feedback={feedbackFor(c.candidate_job_id)}
                            actorEmail={actorEmail}
                            pending={pending}
                            onMove={(toStage, reject) =>
                              moveMutation.mutate({
                                candidate_job_id: c.candidate_job_id,
                                to_stage: toStage,
                                reject,
                                actor_email: actorEmail,
                              })
                            }
                            onFeedback={({ comment, rating, stage }) =>
                              feedbackMutation.mutate({
                                candidate_job_id: c.candidate_job_id,
                                comment,
                                rating,
                                stage,
                                client_email: actorEmail,
                              })
                            }
                          />
                        ),
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {tab === "notes" && <NotesTab data={data} actorEmail={actorEmail} onAdd={(body) => noteMutation.mutate({ body, author_email: actorEmail })} />}

        {tab === "prep" && (
          <PrepTab data={data} onSave={(payload) => stageMutation.mutate(payload)} />
        )}

        {tab === "scheduling" && (
          <SchedulingTab data={data} onSave={(payload) => schedulingMutation.mutate(payload)} />
        )}
      </main>
    </div>
  );
}

/* ── tabs ───────────────────────────────────────────────── */

function NotesTab({
  data,
  actorEmail,
  onAdd,
}: {
  data: PortalData;
  actorEmail: string;
  onAdd: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  return (
    <div className="mx-auto max-w-3xl">
      <Panel>
        <h2 className="text-[18px] font-semibold text-foreground">General notes</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Anything for the whole search — timings, budget changes, must-haves. Your recruiter sees these instantly.
        </p>
        <textarea
          rows={4}
          className={`${inputCls} mt-4`}
          placeholder="Add a note for the search…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-3">
          <button
            type="button"
            className={primaryBtn}
            disabled={!body.trim() || !actorEmail}
            onClick={() => {
              onAdd(body);
              setBody("");
            }}
          >
            Add note
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {data.notes.map((n) => (
            <div key={n.id} className="rounded-[10px] bg-muted p-4">
              <p className="whitespace-pre-wrap text-[14px] text-foreground">{n.body}</p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                {[n.author_email, formatWhen(n.created_at)].filter(Boolean).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function PrepTab({
  data,
  onSave,
}: {
  data: PortalData;
  onSave: (payload: { stage: string; interview_details: string; prep_material: string }) => void;
}) {
  const stages = data.interview_stages.filter((s) => data.stages.includes(s));
  const existing = (stage: string) => data.stage_content.find((c) => c.stage === stage);
  const [draft, setDraft] = useState<Record<string, { details: string; prep: string }>>(() =>
    Object.fromEntries(
      stages.map((s) => [s, { details: existing(s)?.interview_details ?? "", prep: existing(s)?.prep_material ?? "" }]),
    ),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Panel>
        <h2 className="text-[18px] font-semibold text-foreground">Interview prep & details</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Tell us how each stage runs and what candidates should prepare. We pass this on when they reach that stage.
        </p>
      </Panel>

      {stages.length === 0 && (
        <Panel>
          <p className="text-[14px] text-muted-foreground">
            No interview stages on this search yet. Once candidates reach an interview stage, you can add details here.
          </p>
        </Panel>
      )}

      {stages.map((stage) => (
        <Panel key={stage}>
          <h3 className="text-[16px] font-semibold text-foreground">{stage}</h3>
          <label className="mt-4 block text-[12px] font-medium text-muted-foreground">Interview details</label>
          <textarea
            rows={3}
            className={`${inputCls} mt-1.5`}
            placeholder="Format, panel, duration, location or video link"
            value={draft[stage]?.details ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [stage]: { ...d[stage], details: e.target.value } }))}
          />
          <label className="mt-4 block text-[12px] font-medium text-muted-foreground">Interview prep</label>
          <textarea
            rows={5}
            className={`${inputCls} mt-1.5`}
            placeholder="What to read, sample questions, what good looks like"
            value={draft[stage]?.prep ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [stage]: { ...d[stage], prep: e.target.value } }))}
          />
          <div className="mt-4">
            <button
              type="button"
              className={primaryBtn}
              onClick={() =>
                onSave({
                  stage,
                  interview_details: draft[stage]?.details ?? "",
                  prep_material: draft[stage]?.prep ?? "",
                })
              }
            >
              Save {stage}
            </button>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function SchedulingTab({
  data,
  onSave,
}: {
  data: PortalData;
  onSave: (payload: { calendly_url: string; slots: string[] }) => void;
}) {
  const [url, setUrl] = useState(data.scheduling.calendly_url ?? "");
  const [slots, setSlots] = useState<string[]>(
    Array.isArray(data.scheduling.slots) ? (data.scheduling.slots as string[]) : [],
  );
  const [newSlot, setNewSlot] = useState("");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Panel>
        <h2 className="text-[18px] font-semibold text-foreground">Scheduling</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Share a booking link or fixed windows and we'll arrange interviews against them.
        </p>
        <label className="mt-4 block text-[12px] font-medium text-muted-foreground">Booking link</label>
        <input
          className={`${inputCls} mt-1.5`}
          placeholder="https://calendly.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <label className="mt-5 block text-[12px] font-medium text-muted-foreground">Fixed availability</label>
        <div className="mt-1.5 space-y-2">
          {slots.map((slot, i) => (
            <div key={`${slot}-${i}`} className="flex items-center gap-2 rounded-[10px] bg-muted px-3 py-2">
              <CalendarClock className="h-4 w-4 text-accent" />
              <span className="flex-1 text-[14px] text-foreground">{slot}</span>
              <button
                type="button"
                aria-label="Remove slot"
                onClick={() => setSlots((s) => s.filter((_, idx) => idx !== i))}
                className="rounded-[8px] p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Tue 14 Oct, 10:00–12:00"
            value={newSlot}
            onChange={(e) => setNewSlot(e.target.value)}
          />
          <button
            type="button"
            className={outlinedBtn}
            onClick={() => {
              if (!newSlot.trim()) return;
              setSlots((s) => [...s, newSlot.trim()]);
              setNewSlot("");
            }}
          >
            Add slot
          </button>
        </div>

        <div className="mt-4">
          <button type="button" className={primaryBtn} onClick={() => onSave({ calendly_url: url, slots })}>
            Save scheduling
          </button>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-[18px] font-semibold text-foreground">Candidate emails</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Managed by your recruiter — shown here so you know what candidates receive.
        </p>
        <div className="mt-4 space-y-2">
          {data.notification_settings.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 rounded-[10px] bg-muted px-3 py-2">
              <span className="text-[14px] text-foreground">{s.label}</span>
              <span
                className={
                  s.on
                    ? "rounded-full bg-accent/15 px-2.5 py-0.5 text-[12px] font-medium text-accent"
                    : "rounded-full border border-border px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground"
                }
              >
                {s.on ? "On" : "Off"}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
